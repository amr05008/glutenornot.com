/**
 * Barcode Lookup Endpoint
 * Looks up a product by barcode via Open Food Facts, then analyzes ingredients with Claude
 */

import {
  RATE_LIMIT,
  CLAUDE_MODEL,
  getClientIP,
  getClientGeo,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  normalizeVerdict,
  _setRateLimitMap,
  _getRateLimitMap,
} from './_utils.js';
import { trackScan, normalizeClient } from './_analytics.js';

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

### Data Source Reliability (READ FIRST)
This data comes from Open Food Facts, a crowd-sourced database. Allergen and trace tags are
frequently auto-derived from ingredients or contributed by users — they are NOT manufacturer
"Contains:" declarations and are often wrong.
- **The ingredient list is the source of truth.** Allergen tags may only CORROBORATE or ESCALATE a
  verdict you already reach from the ingredients. They must never be the sole basis for "unsafe."
- A "gluten" allergen tag is commonly auto-derived from oats. If the ingredients contain NO wheat,
  barley, or rye (and no derivative), DO NOT return "unsafe" on the strength of a gluten tag alone —
  judge by the actual ingredients (oats → caution).
- If the data contradicts itself (e.g. a gluten allergen tag alongside a gluten-free label), treat
  the conflict as a reason to lean **caution with low confidence**, not "unsafe."
- A "DATA RELIABILITY:" note in the product data flags exactly these situations — follow it.

### Verdict Criteria
- **unsafe:** The **ingredients** contain wheat, barley, rye, or derivatives (malt, malt extract, malt syrup, malt flavoring, brewer's yeast, wheat starch, seitan, triticale, farina, semolina, spelt, kamut, einkorn, emmer, durum). A bare allergen tag with no matching ingredient is NOT sufficient for unsafe.
- **caution:**
  - Contains ambiguous ingredients (oats without GF certification, "natural flavors," maltodextrin, modified food starch, dextrin, "spices," hydrolyzed vegetable protein, soy sauce without GF label)
  - Has cross-contamination traces for gluten sources
  - A gluten allergen tag is present but uncorroborated by, or contradicted by, the ingredients/labels
  - Ingredient data is incomplete or missing
- **safe:** No gluten-containing ingredients, no ambiguous ingredients, no concerning allergen warnings

### Guidelines
- Be conservative—when uncertain, use "caution"
- Flag ALL oats as "caution" unless explicitly certified gluten-free
- If ingredient data is missing or sparse, use "caution" with low confidence
- Do not state a product is "labeled as containing gluten" unless the ingredients actually show a gluten grain — say the data is ambiguous instead
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
      console.log('barcode_not_found', cleanBarcode);
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
      await trackScan({
        ip: clientIP,
        platform: normalizeClient(req.headers['x-client']),
        method: 'barcode',
        mode: 'label',
        verdict: 'caution',
        dataSource: product.source,
        ...getClientGeo(req),
      });
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

    await trackScan({
      ip: clientIP,
      platform: normalizeClient(req.headers['x-client']),
      method: 'barcode',
      mode: analysis.mode,
      verdict: analysis.verdict,
      dataSource: product.source,
      ...getClientGeo(req),
    });

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

// Grains/derivatives that constitute an actual gluten source in an ingredient list.
// Oats are deliberately excluded — they are a cross-contamination (caution) concern,
// not proof of gluten, and are the usual reason a false `en:gluten` tag appears.
const GLUTEN_GRAIN_PATTERN =
  /\b(wheat|barley|rye|malt|triticale|spelt|kamut|khorasan|einkorn|emmer|durum|semolina|farina|seitan|bulgur|couscous|matzo|graham)\b/i;

/**
 * Assess whether a database `gluten` allergen tag is trustworthy.
 *
 * Open Food Facts allergen tags are crowd-sourced and frequently auto-derived from
 * ingredients (e.g. `oats` → `en:gluten`), so a `gluten` tag is NOT equivalent to a
 * manufacturer "Contains: gluten" declaration. Returns a caveat string to hand to
 * Claude when the tag is uncorroborated or self-contradictory, or null when the tag
 * is genuine (or absent, or unverifiable).
 */
function assessGlutenSignal(product) {
  const allergenTags = product.allergens_tags || [];
  const hasGlutenAllergen = allergenTags.some(
    tag => tag === 'en:gluten' || tag === 'en:wheat' || tag.includes('gluten')
  );
  if (!hasGlutenAllergen) return null;

  const ingredients = product.ingredients_text;
  // No ingredient list → the tag cannot be disproven; let it stand.
  if (!ingredients) return null;

  // If the ingredients actually contain a gluten grain, the tag is genuine.
  if (GLUTEN_GRAIN_PATTERN.test(ingredients)) return null;

  const labelTags = product.labels_tags || [];
  const hasGlutenFreeLabel = labelTags.some(
    tag => tag === 'en:no-gluten' || tag.includes('gluten-free') || tag.includes('no-gluten')
  );

  let note =
    "DATA RELIABILITY: The 'gluten' allergen tag is NOT corroborated by the ingredient list " +
    '(no wheat, barley, or rye present). Open Food Facts often auto-derives a gluten tag from oats ' +
    'or unverified crowd edits, so treat it as low-confidence metadata, not a manufacturer declaration. ' +
    'DO NOT mark this product unsafe on the strength of that tag alone — base the verdict on the actual ingredients.';

  if (hasGlutenFreeLabel) {
    note +=
      ' This product also carries a gluten-free label, which directly contradicts the gluten allergen tag; ' +
      'treat the conflict as a reason to lean caution with low confidence rather than unsafe.';
  }

  return note;
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

  // Flag unreliable / contradictory gluten metadata so Claude doesn't over-trust it.
  const glutenSignalNote = assessGlutenSignal(product);
  if (glutenSignalNote) {
    parts.push(glutenSignalNote);
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
  assessGlutenSignal,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  _setRateLimitMap,
  _getRateLimitMap,
};
