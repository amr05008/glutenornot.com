export type Verdict = 'safe' | 'caution' | 'unsafe';
export type Confidence = 'high' | 'medium' | 'low';

export interface AnalysisResult {
  verdict: Verdict;
  flagged_ingredients: string[];
  allergen_warnings: string[];
  explanation: string;
  confidence: Confidence;
}

export const VERDICT_CONFIG = {
  safe: {
    color: '#2d7d46',
    backgroundColor: '#e8f5e9',
    label: 'Safe',
    icon: '✓',
  },
  caution: {
    color: '#f9a825',
    backgroundColor: '#fff8e1',
    label: 'Caution',
    icon: '⚠',
  },
  unsafe: {
    color: '#c62828',
    backgroundColor: '#ffebee',
    label: 'Unsafe',
    icon: '✗',
  },
} as const;

export const API_URL = 'https://www.glutenornot.com/api/analyze';
