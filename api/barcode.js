/**
 * Barcode Lookup Endpoint
 * Looks up a product by barcode via Open Food Facts, then analyzes ingredients with Claude
 */

import {
  RATE_LIMIT,
  CLAUDE_MODEL,
  getClientIP,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  normalizeVerdict,
  _setRateLimitMap,
  _getRateLimitMap,
} from './_utils.js';

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/product';
const USDA_API = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const NUTRITIONIX_API = 'https://trackapi.nutritionix.com/v2/search/item';

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

    // Build display name (include brand if available)
    const displayName = product.brand && product.product_name
      ? `${product.brand} - ${product.product_name}`
      : product.product_name;

    // If we have no useful data at all, return a caution result directly
    if (!ingredientContext) {
      incrementRateLimit(clientIP);
      return res.status(200).json({
        mode: 'label',
        verdict: 'caution',
        flagged_ingredients: [],
        allergen_warnings: [],
        explanation: `Found "${displayName || 'Unknown product'}" but no ingredient data is available. Try scanning the ingredient label instead.`,
        confidence: 'low',
        product_name: displayName || null,
        barcode: cleanBarcode,
        data_source: product.source,
      });
    }

    // Step 3: Analyze with Claude
    const analysis = await analyzeWithClaude(ingredientContext);

    // Add product metadata
    analysis.product_name = displayName || null;
    analysis.barcode = cleanBarcode;
    analysis.data_source = product.source;

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
 * Look up a product using waterfall approach:
 * 1. Open Food Facts (free, no key)
 * 2. USDA FoodData Central (free, no key)
 * 3. Nutritionix (free tier, requires key)
 */
async function lookupProduct(barcode) {
  // Try Open Food Facts first
  const offResult = await lookupOpenFoodFacts(barcode);
  if (offResult) {
    console.log('Found product in Open Food Facts');
    return offResult;
  }

  // Try USDA FoodData Central (if API key is configured)
  if (process.env.USDA_API_KEY) {
    const usdaResult = await lookupUSDA(barcode);
    if (usdaResult) {
      console.log('Found product in USDA FoodData Central');
      return usdaResult;
    }
  }

  // Try Nutritionix (if API keys are configured)
  if (process.env.NUTRITIONIX_APP_ID && process.env.NUTRITIONIX_API_KEY) {
    const nutritionixResult = await lookupNutritionix(barcode);
    if (nutritionixResult) {
      console.log('Found product in Nutritionix');
      return nutritionixResult;
    }
  }

  return null;
}

/**
 * Look up a product in Open Food Facts
 * Tries multiple barcode formats (original, zero-padded to 12/13 digits)
 */
async function lookupOpenFoodFacts(barcode) {
  // Generate barcode variants to try (OFF sometimes needs zero-padding)
  const variants = [barcode];
  if (barcode.length < 12) {
    variants.push(barcode.padStart(12, '0')); // UPC-A format
  }
  if (barcode.length < 13) {
    variants.push(barcode.padStart(13, '0')); // EAN-13 format
  }

  for (const variant of variants) {
    try {
      const url = `${OPEN_FOOD_FACTS_API}/${variant}?fields=product_name,ingredients_text,allergens_tags,traces_tags,labels_tags`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GlutenOrNot/1.0 (https://glutenornot.com)',
        },
      });

      if (!response.ok) {
        console.error('Open Food Facts API error:', response.status);
        continue;
      }

      const data = await response.json();

      if (data.status !== 1 || !data.product) {
        continue;
      }

      console.log(`Open Food Facts hit with barcode variant: ${variant}`);
      return {
        source: 'openfoodfacts',
        product_name: data.product.product_name,
        ingredients_text: data.product.ingredients_text,
        allergens_tags: data.product.allergens_tags,
        traces_tags: data.product.traces_tags,
        labels_tags: data.product.labels_tags,
      };
    } catch (error) {
      console.error('Open Food Facts lookup error:', error.message);
      continue;
    }
  }

  return null;
}

/**
 * Look up a product in USDA FoodData Central
 * Requires USDA_API_KEY env var (free at https://fdc.nal.usda.gov/api-key-signup/)
 */
async function lookupUSDA(barcode) {
  try {
    const url = `${USDA_API}?query=${barcode}&dataType=Branded&pageSize=1&api_key=${process.env.USDA_API_KEY}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GlutenOrNot/1.0 (https://glutenornot.com)',
      },
    });

    if (!response.ok) {
      console.error('USDA API error:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data.foods || data.foods.length === 0) {
      return null;
    }

    const food = data.foods[0];

    // USDA uses gtinUpc field for barcode - verify it matches
    if (food.gtinUpc && food.gtinUpc !== barcode) {
      // Search returned a different product, not a barcode match
      return null;
    }

    return {
      source: 'usda',
      product_name: food.description || food.brandName,
      ingredients_text: food.ingredients,
      allergens_tags: null, // USDA doesn't have structured allergen tags
      traces_tags: null,
      labels_tags: null,
      brand: food.brandName,
    };
  } catch (error) {
    console.error('USDA lookup error:', error.message);
    return null;
  }
}

/**
 * Look up a product in Nutritionix
 */
async function lookupNutritionix(barcode) {
  try {
    const url = `${NUTRITIONIX_API}?upc=${barcode}`;

    const response = await fetch(url, {
      headers: {
        'x-app-id': process.env.NUTRITIONIX_APP_ID,
        'x-app-key': process.env.NUTRITIONIX_API_KEY,
        'User-Agent': 'GlutenOrNot/1.0 (https://glutenornot.com)',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Product not found
      }
      console.error('Nutritionix API error:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data.foods || data.foods.length === 0) {
      return null;
    }

    const food = data.foods[0];

    return {
      source: 'nutritionix',
      product_name: food.food_name || food.brand_name_item_name,
      ingredients_text: food.nf_ingredient_statement,
      allergens_tags: null,
      traces_tags: null,
      labels_tags: null,
      brand: food.brand_name,
    };
  } catch (error) {
    console.error('Nutritionix lookup error:', error.message);
    return null;
  }
}

/**
 * Build a text summary of ingredient data for Claude
 */
function buildIngredientContext(product) {
  const parts = [];

  // Include brand if available (USDA/Nutritionix provide this separately)
  const displayName = product.brand && product.product_name
    ? `${product.brand} - ${product.product_name}`
    : product.product_name;

  if (displayName) {
    parts.push(`Product: ${displayName}`);
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
      model: CLAUDE_MODEL,
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

    result.verdict = normalizeVerdict(result.verdict);

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

// Re-export shared utils + local functions for testing
export {
  parseClaudeResponse,
  buildIngredientContext,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  _setRateLimitMap,
  _getRateLimitMap,
};
