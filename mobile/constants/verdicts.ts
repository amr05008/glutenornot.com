// Verdict type + verdict palette live in theme.ts (the design-token source of
// truth). Re-export Verdict here so existing imports keep working.
export type { Verdict } from './theme';
export { verdictColors } from './theme';

import type { Verdict } from './theme';

export type Confidence = 'high' | 'medium' | 'low';
export type AnalysisMode = 'label' | 'menu';

// Decision 006's reasons. The server always sets one on a label caution; the
// app shows the card the same way whatever it is.
export type CautionReason = 'oats' | 'may_contain' | 'conflict' | 'undeclared_source' | 'incomplete' | 'other';

// Decision 009 (plans/retake-state-2026-10-11.md): the server says a photo
// couldn't be read fully and why. The app shows the retake screen only on a
// known value (isRetakeReason) and never decides from caution_reason or the
// explanation — the server can change which cases ask for a retake without
// an app release. The same enum rides back on the next photo as retake_after.
export const RETAKE_REASONS = ['no_heading', 'no_end', 'too_little_text', 'unclear'] as const;
export type RetakeReason = (typeof RETAKE_REASONS)[number];
export function isRetakeReason(value: unknown): value is RetakeReason {
  return typeof value === 'string' && (RETAKE_REASONS as readonly string[]).includes(value);
}

export interface MenuItem {
  name: string;
  verdict: Verdict;
  notes: string;
}

export interface AnalysisResult {
  mode: AnalysisMode;
  detected_language?: string;
  verdict: Verdict;
  flagged_ingredients: string[];
  allergen_warnings: string[];
  explanation: string;
  confidence: Confidence;
  menu_items?: MenuItem[];
  product_name?: string;
  barcode?: string;
  // Barcode path only (plans/barcode-recovery-2026-09-05.md): the server found
  // a product but had no ingredient/allergen context to analyze — the caution
  // verdict is "we can't tell", not a judgement on ingredients. Set from
  // context construction server-side, never from prose. Absent on every
  // evidence-backed result; a new client branches only on this known value
  // and treats anything else as a normal result.
  result_reason?: 'missing_context';
  // Decision 006: which specific reason a caution named. Display-neutral.
  caution_reason?: CautionReason;
  // Decision 009: set when the app should ask for a retake instead of showing
  // this caution. A parsed response may carry any string here, which is why
  // isRetakeReason, not this type, decides.
  retake_reason?: RetakeReason;
}

// Verdict display metadata. Colors come from verdictColors (theme.ts); `glyph`
// is the GIcon name rendered in the verdict band's icon circle.
export const VERDICT_META: Record<Verdict, { word: string; glyph: 'check' | 'alert' | 'cross' }> = {
  safe:    { word: 'Safe',    glyph: 'check' },
  caution: { word: 'Caution', glyph: 'alert' },
  unsafe:  { word: 'Unsafe',  glyph: 'cross' },
};

// Confidence as a 3-segment meter level.
export const CONFIDENCE_LEVEL: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const API_URL = 'https://www.glutenornot.com/api/analyze';
export const BARCODE_API_URL = 'https://www.glutenornot.com/api/barcode';
export const TRACK_API_URL = 'https://www.glutenornot.com/api/track';
export const RECOVERY_API_URL = 'https://www.glutenornot.com/api/recovery';
export const REVIEW_API_URL = 'https://www.glutenornot.com/api/review';

// Barcode types relevant for food products
export const FOOD_BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
] as const;
