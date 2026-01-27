# glutenornot.com

## Context

Building a free PWA (Progressive Web App) that lets people with celiac disease photograph ingredient labels and get instant, reliable safety assessments. This is an open-source, non-commercial project—the creators are funding it to help others who don't have access to tools like Claude.

## Technical Stack

- **Frontend:** Vanilla HTML/CSS/JS (reassess if app grows more complex)
- **PWA:** Manual manifest.json + service worker (no framework needed)
- **OCR:** Google Cloud Vision API
- **Ingredient analysis:** Claude API (Sonnet)—dial back to Haiku if costs require
- **Hosting:** Vercel or Cloudflare Pages (free tier)
- **Backend/API routes:** Serverless functions (Vercel/Cloudflare Workers) to secure API keys
- **Database:** Supabase free tier (or collaborator's preference)—for anonymous analytics only in MVP

## Data Storage Approach (MVP)

- **Store:** timestamp, ingredient flags triggered, verdict (safe/caution/unsafe), scan count
- **Don't store:** original photos, full ingredient text, IP addresses, user identifiers
- **Purpose:** aggregate stats ("X ingredients analyzed"), basic analytics
- **Future consideration:** store extracted ingredient text to improve analysis and build product database

## Cost Estimate (100 users, 20 scans/month each)

| Service | Cost |
|---------|------|
| Claude API (Sonnet) | ~$12/month |
| Google Cloud Vision | ~$1.50/month |
| Hosting/database | $0 (free tiers) |
| Domain | ~$12/year |
| **Total** | **~$15/month** |

## Collaboration Model

- GitHub for version control, issues, and project management
- Two contributors: one stronger on engineering, one stronger on product/domain expertise
- Feature branches + PR workflow, one approval required to merge
- Open source from day one (MIT license)

## Development Guidelines

- Be opinionated about architecture tradeoffs—give recommendations, not just options
- Flag when a decision has significant cost or complexity implications
- For ingredient safety logic, be conservative (flag uncertain items as "check further" rather than "safe")
- Optimize for the in-store use case: speed, clarity, minimal taps
- Write clear, maintainable code—this will be open source and may attract community contributors

## Current Phase

Planning—finalizing decisions with collaborator, then scaffolding initial app

## MVP Scope

- Single page PWA: upload/take photo → see result
- No authentication
- Anonymous analytics (scan counts, ingredient flags)
- US products only
- Flag all oats as "caution"

## Future Considerations (Post-MVP)

- Native iOS app if usage justifies it
- Offline capability via service worker + cached logic
- Crowdsourced product database
- Community correction submissions
- Store extracted ingredient text for analysis improvement
- "Products I've scanned" history (would require optional accounts)

## Out of Scope (MVP)

- User accounts
- International labeling
- Oat tolerance personalization

---

## Ingredient Analysis Prompt

The following prompt is used with Claude API to analyze ingredients:

### Role

You are a celiac disease ingredient analyzer. Your job is to evaluate ingredient lists and determine if a food product is safe for someone with celiac disease.

### Input

You will receive OCR-extracted text from a food product's ingredient label. The text may contain errors, formatting issues, or partial captures.

### Output Format

Respond with JSON only, no additional text:

```json
{
  "verdict": "safe" | "caution" | "unsafe",
  "flagged_ingredients": ["ingredient1", "ingredient2"],
  "explanation": "Brief explanation in plain language",
  "confidence": "high" | "medium" | "low"
}
```

### Verdict Criteria

- **unsafe:** Contains wheat, barley, rye, or derivatives (malt, brewer's yeast, etc.)
- **caution:** Contains ambiguous ingredients (oats without GF certification, "natural flavors," maltodextrin, modified food starch with unclear source, "spices" that could contain fillers), OR the OCR text is unclear/incomplete
- **safe:** No gluten-containing ingredients detected and no ambiguous ingredients

### Guidelines

- Be conservative—when uncertain, use "caution" rather than "safe"
- Flag all oats as "caution" regardless of context (cross-contamination risk unless certified GF)
- If the OCR text is too garbled to analyze reliably, return verdict "caution" with explanation noting the image quality issue
- Keep explanations brief but educational—assume the user is newly diagnosed
- Use plain language, but name the specific problematic ingredients
