export type Verdict = 'safe' | 'caution' | 'unsafe';
export type Confidence = 'high' | 'medium' | 'low';

export interface AnalysisResult {
  verdict: Verdict;
  flagged_ingredients: string[];
  allergen_warnings: string[];
  explanation: string;
  confidence: Confidence;
}

// Brand colors for consistent theming
export const BRAND_COLORS = {
  primary: '#0D9488',
  primaryDark: '#0F766E',
  accent: '#5EEAD4',
  text: '#0F172A',
} as const;

export const VERDICT_CONFIG = {
  safe: {
    color: '#16A34A',
    backgroundColor: '#DCFCE7',
    label: 'Safe',
    icon: '✓',
  },
  caution: {
    color: '#F59E0B',
    backgroundColor: '#FEF3C7',
    label: 'Caution',
    icon: '⚠',
  },
  unsafe: {
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    label: 'Unsafe',
    icon: '✗',
  },
} as const;

export const API_URL = 'https://www.glutenornot.com/api/analyze';
