/**
 * Barcode Lookup Endpoint
 * Looks up a product by barcode via Open Food Facts, then analyzes ingredients with Claude
 */

// Rate limiting (shared pattern with analyze.js)
let rateLimitMap = new Map();
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000;

function _setRateLimitMap(map) {
  rateLimitMap = map;
}

function _getRateLimitMap() {
  return rateLimitMap;
}

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/product';

/**
 * Claude prompt for barcode-based ingredient analysis
 */
const CLAUDE_PROMPT = `### Role
You are a celiac disease ingredient analyzer. You will receive ingredient information from a food product database lookup (Open Food Facts).

### Input
You will receive:
- Product name
- Ingredients text (if available)
- Allergen tags (if available)
- Traces/cross-contamination tags (if available)

### Output Format
Respond with JSON only, no additional text.

{
  "mode": "label",
  "verdict": "safe" | "caution" | "unsafe",
  "flagged_ingredients": ["ingredient1"],
  "allergen_warnings": ["May contain wheat"],
  "explanation": "Brief explanation in plain language",
  "confidence": "high" | "medium" | "low"
}

### Verdict Criteria
- **unsafe:** Contains wheat, barley, rye, or derivatives (malt, malt extract, malt syrup, malt flavoring, brewer's yeast, wheat starch, seitan, triticale, farina, semolina, spelt, kamut, einkorn, emmer, durum)
- **caution:**
  - Contains ambiguous ingredients (oats without GF certification, "natural flavors," maltodextrin, modified food starch, dextrin, "spices," hydrolyzed vegetable protein, soy sauce without GF label)
  - Has cross-contamination traces for gluten sources
  - Ingredient data is incomplete or missing
- **safe:** No gluten-containing ingredients, no ambiguous ingredients, no concerning allergen warnings

### Guidelines
- Be conservative—when uncertain, use "caution"
- Flag ALL oats as "caution" unless explicitly certified gluten-free
- If ingredient data is missing or sparse, use "caution" with low confidence
- Keep explanations to 1-2 sentences
- Use a warm, supportive tone`;

/**
 * Main handler
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  const rateLimitResult = checkRateLimit(clientIP);

  if (!rateLimitResult.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimitResult.resetIn / 1000));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `You've reached today's scan limit (${RATE_LIMIT}). Resets in ${formatTimeRemaining(rateLimitResult.resetIn)}.`
    });
  }

  try {
    const { barcode } = req.body;

    if (!barcode || typeof barcode !== 'string') {
      return res.status(400).json({
        error: 'Missing barcode',
        message: 'No barcode provided'
      });
    }

    // Validate barcode format (digits only, 8-14 chars covers EAN-8, UPC-A, EAN-13, ITF-14)
    const cleanBarcode = barcode.trim();
    if (!/^\d{8,14}$/.test(cleanBarcode)) {
      return res.status(400).json({
        error: 'Invalid barcode',
        message: 'Invalid barcode format'
      });
    }

    // Step 1: Look up product in Open Food Facts
    const product = await lookupProduct(cleanBarcode);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        message: "Product not found in our database. Try scanning the ingredient label instead."
      });
    }

    // Step 2: Build ingredient context for Claude
    const ingredientContext = buildIngredientContext(product);

    // If we have no useful data at all, return a caution result directly
    if (!ingredientContext) {
      incrementRateLimit(clientIP);
      return res.status(200).json({
        mode: 'label',
        verdict: 'caution',
        flagged_ingredients: [],
        allergen_warnings: [],
        explanation: `Found "${product.product_name || 'Unknown product'}" but no ingredient data is available. Try scanning the ingredient label instead.`,
        confidence: 'low',
        product_name: product.product_name || null,
        barcode: cleanBarcode,
      });
    }

    // Step 3: Analyze with Claude
    const analysis = await analyzeWithClaude(ingredientContext);

    // Add product metadata
    analysis.product_name = product.product_name || null;
    analysis.barcode = cleanBarcode;

    incrementRateLimit(clientIP);

    return res.status(200).json(analysis);

  } catch (error) {
    console.error('Barcode lookup error:', error);

    if (error.message === 'CLAUDE_ERROR') {
      return res.status(503).json({
        error: 'Analysis service unavailable',
        message: 'Our analysis service is temporarily unavailable. Please try again in a few minutes.'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong. Please try again.'
    });
  }
}

/**
 * Look up a product in Open Food Facts
 */
async function lookupProduct(barcode) {
  const url = `${OPEN_FOOD_FACTS_API}/${barcode}?fields=product_name,ingredients_text,allergens_tags,traces_tags,labels_tags`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'GlutenOrNot/1.0 (https://glutenornot.com)',
    },
  });

  if (!response.ok) {
    console.error('Open Food Facts API error:', response.status);
    return null;
  }

  const data = await response.json();

  if (data.status !== 1 || !data.product) {
    return null;
  }

  return data.product;
}

/**
 * Build a text summary of ingredient data for Claude
 */
function buildIngredientContext(product) {
  const parts = [];

  if (product.product_name) {
    parts.push(`Product: ${product.product_name}`);
  }

  if (product.ingredients_text) {
    parts.push(`Ingredients: ${product.ingredients_text}`);
  }

  if (product.allergens_tags && product.allergens_tags.length > 0) {
    const allergens = product.allergens_tags
      .map(tag => tag.replace('en:', ''))
      .join(', ');
    parts.push(`Allergens: ${allergens}`);
  }

  if (product.traces_tags && product.traces_tags.length > 0) {
    const traces = product.traces_tags
      .map(tag => tag.replace('en:', ''))
      .join(', ');
    parts.push(`Cross-contamination traces: ${traces}`);
  }

  if (product.labels_tags && product.labels_tags.length > 0) {
    const glutenLabels = product.labels_tags.filter(
      tag => tag.includes('gluten') || tag.includes('celiac') || tag.includes('coeliac')
    );
    if (glutenLabels.length > 0) {
      const labels = glutenLabels.map(tag => tag.replace('en:', '')).join(', ');
      parts.push(`Certifications: ${labels}`);
    }
  }

  // Only ingredients_text or allergens_tags are useful for analysis
  if (!product.ingredients_text && (!product.allergens_tags || product.allergens_tags.length === 0)) {
    return null;
  }

  return parts.join('\n');
}

/**
 * Analyze ingredient context with Claude
 */
async function analyzeWithClaude(ingredientContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${CLAUDE_PROMPT}\n\n### Product Data:\n${ingredientContext}`
      }]
    })
  });

  if (!response.ok) {
    console.error('Claude API error:', response.status);
    throw new Error('CLAUDE_ERROR');
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error('CLAUDE_ERROR');
  }

  return parseClaudeResponse(content);
}

/**
 * Parse and validate Claude's response
 */
function parseClaudeResponse(content) {
  if (!content || content.trim() === '') {
    return {
      mode: 'label',
      verdict: 'caution',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Unable to fully analyze the product. Please review the ingredients manually.',
      confidence: 'low'
    };
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const result = JSON.parse(jsonMatch[0]);

    // Normalize verdict
    const v = (result.verdict || '').toLowerCase().trim();
    if (v === 'safe') result.verdict = 'safe';
    else if (v === 'unsafe' || v === 'not safe') result.verdict = 'unsafe';
    else result.verdict = 'caution';

    result.mode = 'label';
    result.flagged_ingredients = result.flagged_ingredients || [];
    result.allergen_warnings = result.allergen_warnings || [];
    result.explanation = result.explanation || '';
    result.confidence = result.confidence || 'medium';

    return result;
  } catch {
    return {
      mode: 'label',
      verdict: 'caution',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Unable to fully analyze the product. Please review the ingredients manually.',
      confidence: 'low'
    };
  }
}

// --- Rate limiting utilities (same as analyze.js) ---

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) return { allowed: true };
  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }
  if (record.count < RATE_LIMIT) return { allowed: true };
  const resetIn = RATE_LIMIT_WINDOW - (now - record.windowStart);
  return { allowed: false, resetIn };
}

function incrementRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
  } else {
    record.count++;
  }
}

function formatTimeRemaining(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

export {
  parseClaudeResponse,
  buildIngredientContext,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  _setRateLimitMap,
  _getRateLimitMap,
};
