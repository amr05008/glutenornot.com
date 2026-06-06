/**
 * Verdict Configuration
 * Centralized config for all verdict-related copy and display.
 * `glyph` maps to the inline SVG mark rendered in the verdict band (see ui.js).
 */

export const VERDICT_CONFIG = {
  safe: {
    label: 'Safe',
    glyph: 'check',
  },
  caution: {
    label: 'Caution',
    glyph: 'alert',
  },
  unsafe: {
    label: 'Unsafe',
    glyph: 'cross',
  },
};
