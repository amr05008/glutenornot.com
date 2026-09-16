import { describe, it, expect } from 'vitest';
import { hasOatsCaveat } from './assertions.js';

// Offline, always runs: the live runners' caveat assertion must accept the
// real caveat in its common phrasings and reject reassurance that merely
// mentions oats and sensitivity (Pi grill on PR #29).
describe('hasOatsCaveat', () => {
  it.each([
    'Just a heads-up that a small share of people with celiac disease react to oats themselves.',
    'Note: some people with celiac are sensitive to oats even when they are gluten-free.',
    'Oats themselves can trigger a reaction in a small share of people with celiac disease.',
    "A minority of celiacs don't tolerate oats (avenin), so use your own judgment.",
    'The oats are covered by the label, though oat avenin affects some people.',
    'A few people with celiac disease cannot tolerate the oats in products like this.',
  ])('accepts: %s', (text) => {
    expect(hasOatsCaveat(text)).toBe(true);
  });

  it.each([
    'Labeled gluten-free oats, suitable for people with gluten sensitivity.',
    'This carries a gluten-free claim, which is regulated and covers the oats and the natural flavor.',
    'Good news! The oats are certified gluten-free, so you are good to go.',
    'Sensitive individuals should check the label. The oats are covered.',
    '',
    undefined,
  ])('rejects: %s', (text) => {
    expect(hasOatsCaveat(text)).toBe(false);
  });
});
