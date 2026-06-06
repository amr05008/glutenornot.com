/* ============================================================================
 * GlutenOrNot — Design Tokens (Direction A · "Clinic")
 * Single source of truth for the MOBILE app (React Native / Expo).
 * Mirror of handoff/tokens.css (web) and handoff/tokens.json (canonical).
 *
 * Drop-in: place in mobile/constants/theme.ts and import { theme } from it.
 * Pairs with the existing mobile/constants/verdicts.ts (Verdict type).
 * ========================================================================= */

export type Verdict = 'safe' | 'caution' | 'unsafe';

/** Verdict palette — the ONLY saturated color in the product.
 *  fill: solid band background · on: text/icon on fill ·
 *  accent: dot/mark on white · surface: soft tint background. */
export const verdictColors: Record<
  Verdict,
  { fill: string; on: string; accent: string; surface: string }
> = {
  safe:    { fill: '#1E8E5A', on: '#FFFFFF', accent: '#1E8E5A', surface: '#E3F1E9' },
  caution: { fill: '#EBA31C', on: '#1C1407', accent: '#B97F16', surface: '#FBF1DC' },
  unsafe:  { fill: '#C8392C', on: '#FFFFFF', accent: '#C8392C', surface: '#F7E2DF' },
};

export const theme = {
  color: {
    // neutrals — all chrome is neutral, no brand hue
    ink:          '#0E0E0F',
    sub:          '#6E6E72',
    faint:        '#A1A1A5',
    line:         'rgba(0,0,0,0.09)',
    surface:      '#FFFFFF',
    surfaceMuted: '#F4F4F3',
    bg:           '#FCFBF9',
    captureBg:    '#161513', // camera / dark capture surface
  },

  verdict: verdictColors,

  font: {
    // load via expo-font: HankenGrotesk_400/500/600/700/800, JetBrainsMono_400/600
    sans: 'HankenGrotesk',
    mono: 'JetBrainsMono',
  },

  // type scale — { fontSize, fontWeight, letterSpacing?, lineHeight? }
  type: {
    display: { fontSize: 60, fontWeight: '800' as const, letterSpacing: -1.8 },
    title:   { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.6 },
    heading: { fontSize: 18, fontWeight: '700' as const },
    bodyLg:  { fontSize: 17, fontWeight: '400' as const, lineHeight: 26 },
    body:    { fontSize: 16, fontWeight: '400' as const, lineHeight: 25 },
    small:   { fontSize: 13, fontWeight: '500' as const },
    label:   { fontSize: 11.5, fontWeight: '700' as const, letterSpacing: 1.3 }, // + uppercase
    mono:    { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  },

  // spacing scale (4pt base)
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },

  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },

  touchMin: 44,

  motion: { durFast: 140, dur: 240 }, // ms
} as const;

export type Theme = typeof theme;
