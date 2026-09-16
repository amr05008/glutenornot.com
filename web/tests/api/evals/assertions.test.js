import { describe, it, expect } from 'vitest';
import { hasOatsCaveat, OATS_CAVEAT_SENTENCE } from './assertions.js';
import { CLAUDE_PROMPT as OCR_PROMPT } from '../../../../api/analyze.js';
import { CLAUDE_PROMPT as BARCODE_PROMPT } from '../../../../api/barcode.js';

// Offline, always runs. The live runners' caveat assertion is an exact
// sentence match — the prompts prescribe the sentence — so paraphrase,
// reassurance, and negation all fail by construction (Pi grill on PR #29).
describe('hasOatsCaveat', () => {
  it('is the sentence both prompts prescribe (kept in sync)', () => {
    expect(OCR_PROMPT).toContain(`this exact sentence: "${OATS_CAVEAT_SENTENCE}"`);
    // The barcode prompt wraps the sentence across a line break.
    expect(BARCODE_PROMPT.replace(/\s+/g, ' ')).toContain(`this exact sentence: "${OATS_CAVEAT_SENTENCE}"`);
  });

  it.each([
    `Labeled gluten-free, which covers the oats and the natural flavor. ${OATS_CAVEAT_SENTENCE}`,
    'You\'re good to go! heads-up: A small share of people with celiac disease react to oats themselves',
    'Covered by the label.  Heads-up:  a small  share of people with celiac disease react to oats themselves.',
    'Covered by the label. Heads‑up: a small share of people with celiac disease react to oats themselves.',
  ])('accepts: %s', (text) => {
    expect(hasOatsCaveat(text)).toBe(true);
  });

  it.each([
    'Labeled gluten-free oats, suitable for people with gluten sensitivity.',
    'The oats themselves are covered by the gluten-free label.',
    'People with celiac disease can tolerate oats labeled gluten-free.',
    'Labeled gluten-free oats contain avenin, a natural oat protein.',
    'The oats themselves are safe for people with gluten sensitivity.',
    'These gluten-free oats do not cause symptoms.',
    'There is no reaction to oats in people with celiac disease.',
    // Paraphrases of the caveat do not count either — the prompt asks for the sentence.
    'Just a heads-up that some people with celiac disease react to oats.',
    'A small share of people with celiac disease react to oats themselves, so use your judgment.',
    '',
    undefined,
  ])('rejects: %s', (text) => {
    expect(hasOatsCaveat(text)).toBe(false);
  });
});
