// Verdict type + verdict palette live in theme.ts (the design-token source of
// truth). Re-export Verdict here so existing imports keep working.
export type { Verdict } from './theme';
export { verdictColors } from './theme';

import type { Verdict } from './theme';

export type Confidence = 'high' | 'medium' | 'low';
export type AnalysisMode = 'label' | 'menu';

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

// Barcode types relevant for food products
export const FOOD_BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
] as const;
