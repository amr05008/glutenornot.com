import { describe, it, expect } from 'vitest';
import { CALIBRATION_CASES, BARCODE_CALIBRATION_CASES } from './calibration-cases.js';
import { CAUTION_REASONS } from '../../../../api/_utils.js';

describe('calibration eval cases (decision 006)', () => {
  const all = [...CALIBRATION_CASES, ...BARCODE_CALIBRATION_CASES];

  it('has unique ids', () => {
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it.each(all.map((c) => [c.id, c]))('%s is well-formed', (_id, c) => {
    expect(['safe', 'caution', 'unsafe', 'not-safe']).toContain(c.expect);
    if (c.expect === 'caution') expect(CAUTION_REASONS).toContain(c.reason);
    if (c.expect === 'safe' || c.expect === 'unsafe') expect(c.reason).toBeUndefined();
    if (c.reason) expect(c.reason).not.toBe('other');
    expect(c.ocrText ?? c.product).toBeTruthy();
  });
});
