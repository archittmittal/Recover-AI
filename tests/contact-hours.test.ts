import { describe, it, expect } from 'vitest';
import { isWithinContactHours } from '../src/lib/utils/time';

describe('RBI Contact Hours Boundary Validation (08:00 to 19:00 IST)', () => {
  it('rejects 07:59:59 IST (1 second before window)', () => {
    const d = new Date('2026-08-21T07:59:59+05:30');
    expect(isWithinContactHours(d)).toBe(false);
  });

  it('accepts 08:00:00 IST (exact start boundary)', () => {
    const d = new Date('2026-08-21T08:00:00+05:30');
    expect(isWithinContactHours(d)).toBe(true);
  });

  it('accepts 12:30:00 IST (midday peak window)', () => {
    const d = new Date('2026-08-21T12:30:00+05:30');
    expect(isWithinContactHours(d)).toBe(true);
  });

  it('accepts 18:59:59 IST (1 second before close)', () => {
    const d = new Date('2026-08-21T18:59:59+05:30');
    expect(isWithinContactHours(d)).toBe(true);
  });

  it('rejects 19:00:00 IST (exact closing boundary)', () => {
    const d = new Date('2026-08-21T19:00:00+05:30');
    expect(isWithinContactHours(d)).toBe(false);
  });

  it('rejects 19:00:01 IST (1 second after window)', () => {
    const d = new Date('2026-08-21T19:00:01+05:30');
    expect(isWithinContactHours(d)).toBe(false);
  });
});
