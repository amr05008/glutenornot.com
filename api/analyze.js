/**
 * Analyze Endpoint
 * Orchestrates OCR and Claude analysis for ingredient labels and restaurant menus
 */

// Rate limiting storage (in-memory for development, use Vercel KV in production)
let rateLimitMap = new Map();
const RATE_LIMIT = 50; // requests per day per IP
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

// For testing: allow injecting a custom rate limit map
function _setRateLimitMap(map) {
  rateLimitMap = map;
}

function _getRateLimitMap() {
  return rateLimitMap;
}

/**
 * Claude prompt for ingredient analysis
 */
const CLAUDE_PROMPT = `### Role
You are a celiac disease ingredient analyzer. Your job is to evaluate food labels AND restaurant menus to determine what is safe for someone with celiac disease.

### Input
You will receive OCR-extracted text from either:
1. A food product's ingredient label (ingredient list, allergen statements, advisory warnings)
2. A restaurant menu (dish names, descriptions, prices)

**Auto-detect which type it is.** Menus typically have dish names with descriptions and/or prices. Ingredient labels have ingredient lists, nutrition facts, and allergen statements.

### Non-English Text / Language Detection
The OCR text may be in any language, especially Spanish. You MUST:
1. **Detect the language** of the OCR text and include \`"detected_language"\` in your response using an ISO 639-1 code (e.g., "es" for Spanish, "ca" for Catalan, "en" for English). Omit this field only if the text is in English.
2. **Analyze in any language** — apply the same gluten safety rules regardless of language
3. **Translate flagged ingredients** — in \`flagged_ingredients\`, use format: "original_term (english_translation)" (e.g., "harina de trigo (wheat flour)")
4. **Always write explanations and notes in English** — the user reads English even when scanning foreign-language products
5. **Translate allergen warnings** — show both the original text and an English translation, e.g., "Contiene gluten (Contains gluten)"

**Common Spanish gluten-containing ingredients:**
- harina de trigo (wheat flour), trigo (wheat), cebada (barley), centeno (rye)
- malta / extracto de malta (malt / malt extract), sémola (semolina)
- levadura de cerveza (brewer's yeast), almidón de trigo (wheat starch)
- espelta (spelt), avena (oats — treat as caution), salvado de trigo (wheat bran)

**Common Spanish allergen phrases:**
- "Contiene gluten" = Contains gluten
- "Puede contener trazas de trigo" = May contain traces of wheat
- "Elaborado en instalaciones que procesan trigo" = Processed in facility that handles wheat
- "Sin gluten" / "libre de gluten" = Gluten-free (still verify ingredients)
- "Apto para celíacos" = Suitable for celiacs

### Output Format
Respond with JSON only, no additional text.

**For ingredient labels:**
{
  "mode": "label",
  "detected_language": "es",
  "verdict": "safe" | "caution" | "unsafe",
  "flagged_ingredients": ["harina de trigo (wheat flour)"],
  "allergen_warnings": ["Contiene gluten (Contains gluten)"],
  "explanation": "Brief explanation in plain language, always in English",
  "confidence": "high" | "medium" | "low"
}

**For restaurant menus:**
{
  "mode": "menu",
  "detected_language": "es",
  "verdict": "safe" | "caution" | "unsafe",
  "menu_items": [
    { "name": "Dish Name (keep original language)", "verdict": "safe", "notes": "Why it's safe — always in English" }
  ],
  "allergen_warnings": ["Menu does not list full ingredients — ask your server about specific dishes"],
  "explanation": "Brief one-line summary (e.g., '3 items look safe, 1 needs a modification, and 2 are unsafe.')",
  "confidence": "high" | "medium" | "low"
}

Note: Omit \`detected_language\` only when the text is in English.

### For Ingredient Labels

#### Verdict Criteria
- **unsafe:** Contains wheat, barley, rye, or derivatives (malt, malt extract, malt syrup, malt flavoring, brewer's yeast, wheat starch, seitan, triticale, farina, semolina, spelt, kamut, einkorn, emmer, durum) — or their equivalents in any language (e.g., Spanish: harina de trigo, cebada, centeno, malta, sémola, espelta)
- **caution:**
  - Contains ambiguous ingredients (oats without GF certification, "natural flavors," maltodextrin, modified food starch, dextrin, "spices," hydrolyzed vegetable protein, soy sauce without GF label)
  - Has "may contain" warnings for gluten sources (in any language, e.g., "puede contener trazas de trigo")
  - Has "processed in facility" warnings for wheat/gluten
  - OCR text is unclear/incomplete
- **safe:** No gluten-containing ingredients, no ambiguous ingredients, no concerning allergen warnings

#### Guidelines
- Always check for allergen statements AND "may contain" warnings—these are often separate from ingredients
- Be conservative—when uncertain, use "caution"
- Flag ALL oats as "caution" even if the product claims to be gluten-free. Oats require third-party certification (like GFCO logo) to be considered safe—manufacturer "gluten-free" labels alone are not sufficient due to cross-contamination risks
- Common hidden gluten: soy sauce, malt vinegar, some seasonings
- If OCR is garbled, return "caution" explaining image quality issue
- Keep explanations to 1-2 sentences

### For Restaurant Menus

#### Verdict
Use the overall verdict to summarize the menu:
- **safe**: Every item on the menu appears gluten-free
- **caution**: Mix of safe and unsafe items, or not enough detail to be sure (most common for menus)
- **unsafe**: Every item contains gluten

#### menu_items
Return an array of objects, one per identifiable menu item, **ordered safe first, then caution, then unsafe**:
- Each object has: "name" (dish name), "verdict" ("safe" | "caution" | "unsafe"), "notes" (brief reason or actionable advice)
- For caution items, include actionable advice in notes (e.g., "Ask to remove croutons", "Check if the sauce contains flour")
- For safe items, keep notes short (e.g., "No gluten ingredients listed")

#### explanation
A brief one-line summary count (e.g., "3 items look safe, 1 needs a modification, and 2 are unsafe."). Do NOT list individual items here — that's what menu_items is for.

#### flagged_ingredients
Leave as an empty array for menus — the menu_items array replaces this.

#### allergen_warnings
If the menu doesn't list full ingredients (most don't), include: "Menu does not list full ingredients — ask your server about specific dishes"

#### Confidence
Use "medium" or "low" for menus since they rarely list full ingredients. Only use "high" if the menu explicitly lists ingredients or allergen info.

#### Partial Menus
If the OCR text appears to be only part of a menu (cuts off mid-item, very few items), note in the explanation: "I can only see part of the menu — try capturing the full page for a complete breakdown."

### Tone
Write explanations in a warm, supportive tone. Remember: you're helping someone with celiac disease make a quick decision in a store or restaurant.

**For safe products:**
Start with reassurance. Examples:
- "Good news! This product contains no gluten ingredients..."
- "You're good to go. The ingredients are all gluten-free..."

**For caution products:**
Be helpful and specific about next steps. Examples:
- "This contains oats, which aren't certified gluten-free. You may want to check with the manufacturer."
- "The 'natural flavors' could contain gluten. If you're very sensitive, consider a certified GF alternative."

**For unsafe products:**
Be clear but compassionate. Examples:
- "This contains wheat flour, so it's not safe for celiac disease."
- "Unfortunately, this has malt extract (from barley), which contains gluten."

**Avoid:**
- Clinical language ("contraindicated", "not recommended for consumption")
- Lecturing or over-explaining
- Scare tactics or alarming language`;

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check rate limit
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
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        error: 'Missing image',
        message: 'No image provided'
      });
    }

    // Step 1: OCR with Google Cloud Vision
    const ocrText = await performOCR(image);

    if (!ocrText || ocrText.trim().length === 0) {
      return res.status(400).json({
        code: 'OCR_FAILED',
        error: 'OCR failed',
        message: "Couldn't read the text. Try getting the ingredients or menu in focus."
      });
    }

    // Step 2: Analyze with Claude
    const analysis = await analyzeWithClaude(ocrText);

    // Increment rate limit counter on success
    incrementRateLimit(clientIP);

    return res.status(200).json(analysis);

  } catch (error) {
    console.error('Analysis error:', error);

    if (error.message === 'OCR_EMPTY') {
      return res.status(400).json({
        code: 'OCR_FAILED',
        error: 'OCR failed',
        message: "Couldn't read the text. Try getting the ingredients or menu in focus."
      });
    }

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
 * Perform OCR using Google Cloud Vision API
 */
async function performOCR(base64Image) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!apiKey) {
    throw new Error('Google Cloud Vision API key not configured');
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'TEXT_DETECTION' }]
        }]
      })
    }
  );

  if (!response.ok) {
    console.error('Vision API error:', response.status);
    throw new Error('OCR_ERROR');
  }

  const data = await response.json();

  // Extract text from response
  const textAnnotations = data.responses?.[0]?.textAnnotations;

  if (!textAnnotations || textAnnotations.length === 0) {
    throw new Error('OCR_EMPTY');
  }

  // First annotation contains the full text
  return textAnnotations[0].description;
}

/**
 * Normalize a verdict string to one of the valid values.
 * Claude sometimes returns non-standard verdicts like "warning" or "ask server".
 */
function normalizeVerdict(verdict) {
  if (typeof verdict !== 'string') return 'caution';
  const v = verdict.toLowerCase().trim();
  if (v === 'safe') return 'safe';
  if (v === 'unsafe' || v === 'not safe' || v === 'danger' || v === 'dangerous') return 'unsafe';
  // Anything else (caution, warning, ask, check, unknown, etc.) → caution
  return 'caution';
}

/**
 * Normalize a mode string to one of the valid values.
 * Returns null for unknown values so inference logic can handle it.
 */
function normalizeMode(mode) {
  if (typeof mode !== 'string') return null;
  const m = mode.toLowerCase().trim();
  if (m === 'menu') return 'menu';
  if (m === 'label') return 'label';
  return null;
}

/**
 * Parse and validate Claude's response
 * Exported for testing
 */
function parseClaudeResponse(content) {
  // Handle empty/null input
  if (!content || content.trim() === '') {
    return {
      verdict: 'caution',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Unable to fully analyze the ingredients. Please review manually.',
      confidence: 'low'
    };
  }

  try {
    // Try to extract JSON from the response (Claude might add extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!result.verdict || !['safe', 'caution', 'unsafe'].includes(result.verdict)) {
      throw new Error('Invalid verdict');
    }

    // Ensure arrays exist
    result.flagged_ingredients = result.flagged_ingredients || [];
    result.allergen_warnings = result.allergen_warnings || [];
    result.explanation = result.explanation || '';
    result.confidence = result.confidence || 'medium';
    // Normalize mode (handles capitalization like "Menu" → "menu")
    result.mode = normalizeMode(result.mode);
    // Infer mode from content if Claude omitted it or returned unknown value
    if (!result.mode && Array.isArray(result.menu_items) && result.menu_items.length > 0) {
      result.mode = 'menu';
    }
    result.mode = result.mode || 'label';

    // Validate and normalize menu_items if present
    if (result.mode === 'menu' && Array.isArray(result.menu_items)) {
      result.menu_items = result.menu_items
        .filter(item => item && item.name)
        .map(item => ({
          ...item,
          verdict: normalizeVerdict(item.verdict),
          notes: item.notes || '',
        }));
    } else if (result.mode === 'menu') {
      result.menu_items = [];
    }

    return result;

  } catch (parseError) {
    // Return a caution verdict if we can't parse
    return {
      verdict: 'caution',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Unable to fully analyze the ingredients. Please review manually.',
      confidence: 'low'
    };
  }
}

/**
 * Analyze ingredients with Claude
 */
async function analyzeWithClaude(ocrText) {
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
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `${CLAUDE_PROMPT}\n\n### OCR Text:\n${ocrText}`
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
 * Get client IP address from request
 */
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Check if client is rate limited
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    return { allowed: true };
  }

  // Check if window has expired
  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }

  // Check if under limit
  if (record.count < RATE_LIMIT) {
    return { allowed: true };
  }

  // Rate limited
  const resetIn = RATE_LIMIT_WINDOW - (now - record.windowStart);
  return { allowed: false, resetIn };
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
  } else {
    record.count++;
  }
}

/**
 * Format time remaining for rate limit message
 */
function formatTimeRemaining(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

// Export internal functions for testing
export {
  normalizeMode,
  normalizeVerdict,
  parseClaudeResponse,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  CLAUDE_PROMPT,
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  _setRateLimitMap,
  _getRateLimitMap
};
