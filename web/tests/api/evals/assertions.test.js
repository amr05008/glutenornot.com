import { describe, it, expect } from 'vitest';
import { hasOatsCaveat } from './assertions.js';

// Offline, always runs: the live runners' caveat assertion must accept the
// real caveat in its common phrasings and reject reassurance that merely
// mentions oats, tolerance, or avenin (Pi grill on PR #29, two rounds).
describe('hasOatsCaveat', () => {
  it.each([
    'Just a heads-up that a small share of people with celiac disease react to oats themselves.',
    'Note: some people with celiac are sensitive to oats even when they are gluten-free.',
    'Oats themselves can trigger a reaction in a small share of people with celiac disease.',
    "A minority of celiacs don't tolerate oats (avenin), so use your own judgment.",
    'The oats are covered by the label, though oat avenin affects some people.',
    'A few people with celiac disease cannot tolerate the oats in products like this.',
    'Just a heads-up that oats themselves bother a small share of people with celiac disease.',
    'Some people with celiac disease still have symptoms from oats.',
    'Oats can still be an issue for some people with celiac disease.',
    'A small share of people with celiac disease react to avenin, the protein in oats.',
  ])('accepts: %s', (text) => {
    expect(hasOatsCaveat(text)).toBe(true);
  });

  it.each([
    'Labeled gluten-free oats, suitable for people with gluten sensitivity.',
    'The oats themselves are covered by the gluten-free label.',
    'People with celiac disease can tolerate oats labeled gluten-free.',
    'Labeled gluten-free oats contain avenin, a natural oat protein.',
    'This carries a gluten-free claim, which is regulated and covers the oats and the natural flavor.',
    'Good news! The oats are certified gluten-free, so you are good to go.',
    'Sensitive individuals should check the label. The oats are covered.',
    'Most people with celiac disease tolerate oats well.',
    '',
    undefined,
  ])('rejects: %s', (text) => {
    expect(hasOatsCaveat(text)).toBe(false);
  });
});
