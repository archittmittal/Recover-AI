import { describe, it, expect } from 'vitest';
import { maskPhone, maskEmail, maskPiiDeep } from '@/lib/utils/pii';

describe('maskPhone', () => {
  it('keeps the country code and last 4 digits, masks the rest', () => {
    expect(maskPhone('+919876543210')).toBe('+91******3210');
  });

  it('returns non-matching input unchanged', () => {
    expect(maskPhone('not-a-phone-number')).toBe('not-a-phone-number');
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain, masks the rest of the local part', () => {
    expect(maskEmail('aarav.sharma@example.com')).toBe('a***@example.com');
  });

  it('returns non-matching input unchanged', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});

describe('maskPiiDeep', () => {
  it('masks a top-level phone field', () => {
    const result = maskPiiDeep({ phone: '+919876543210', note: 'hello' });
    expect(result.phone).toBe('+91******3210');
    expect(result.note).toBe('hello');
  });

  it('masks a top-level email field', () => {
    const result = maskPiiDeep({ email: 'aarav@example.com' });
    expect(result.email).toBe('a***@example.com');
  });

  it('masks phone/email values nested inside arrays and objects', () => {
    const result = maskPiiDeep({
      customer: { contact: { phone: '+919876543210' }, tags: ['aarav@example.com', 'vip'] },
    }) as { customer: { contact: { phone: string }; tags: string[] } };

    expect(result.customer.contact.phone).toBe('+91******3210');
    expect(result.customer.tags[0]).toBe('a***@example.com');
    expect(result.customer.tags[1]).toBe('vip');
  });

  it('leaves free-text message content untouched (not an exact phone/email match)', () => {
    const result = maskPiiDeep({ message: 'Hi Amit, your payment of ₹499 is pending.' });
    expect(result.message).toBe('Hi Amit, your payment of ₹499 is pending.');
  });
});
