/**
 * Analyze Endpoint
 * Orchestrates OCR and Claude analysis for ingredient labels
 */

// Rate limiting storage (in-memory for development, use Vercel KV in production)
const rateLimitMap = new Map();
const RATE_LIMIT = 50; // requests per day per IP
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

/**
 * Claude prompt for ingredient analysis
 */
const CLAUDE_PROMPT = `### Role
You are a celiac disease ingredient analyzer. Your job is to evaluate ingredient lists and determine if a food product is safe for someone with celiac disease.

### Input
You will receive OCR-extracted text from a food product's ingredient label. The text may contain:
- The ingredient list
- Allergen statements ("Contains: wheat, soy")
- Advisory warnings ("May contain wheat", "Processed in a facility that handles wheat")

### Output Format
Respond with JSON only, no additional text:
{
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
  - Has "may contain" warnings for gluten sources
  - Has "processed in facility" warnings for wheat/gluten
  - OCR text is unclear/incomplete
- **safe:** No gluten-containing ingredients, no ambiguous ingredients, no concerning allergen warnings

### Guidelines
- Always check for allergen statements AND "may contain" warnings—these are often separate from ingredients
- Be conservative—when uncertain, use "caution"
- Flag all oats as "caution" (cross-contamination risk unless certified GF)
- Common hidden gluten: soy sauce, malt vinegar, some seasonings
- If OCR is garbled, return "caution" explaining image quality issue
- Keep explanations brief but educational`;

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
        message: "Couldn't read the label. Try getting the ingredients list in focus."
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
        message: "Couldn't read the label. Try getting the ingredients list in focus."
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
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${CLAUDE_PROMPT}\n\n### OCR Text from Label:\n${ocrText}`
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

  // Parse JSON from Claude's response
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

    return result;

  } catch (parseError) {
    console.error('Failed to parse Claude response:', parseError, content);
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
