import { describe, expect, it } from 'vitest';
import { marketDate, money, quantity, validDecimal, validateEmail, validatePassword } from './format';

describe('financial display and form validation', () => {
  it('preserves the provider trading date instead of shifting midnight into the previous local day', () => {
    expect(marketDate('2026-10-26T00:00:00.000Z')).toBe('Oct 26, 2026');
    expect(marketDate('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026');
    expect(marketDate(null)).toBe('Not available');
    expect(marketDate('invalid')).toBe('Not available');
  });
  it('distinguishes a missing quote from an actual zero quote', () => {
    expect(money(null)).toBe('Not available'); expect(money(undefined)).toBe('Not available'); expect(money('0')).toBe('$0.00');
  });
  it('preserves cents beyond Number precision and all supported quantity decimals', () => {
    expect(money('9007199254740993.01')).toBe('$9,007,199,254,740,993.01');
    expect(money('9999999999999999.12')).toBe('$9,999,999,999,999,999.12');
    expect(quantity('999999999.12345678')).toBe('999,999,999.12345678');
    expect(quantity('0.00000001')).toBe('0.00000001');
    expect(quantity('1e-8')).toBe('0.00000001');
    expect(money('NaN')).toBe('Not available'); expect(quantity('Infinity')).toBe('—');
  });
  it('accepts fractional decimal strings but excludes exponential, negative, and imprecise values', () => {
    expect(validDecimal('0.00000001')).toBe(true); expect(validDecimal('12.5')).toBe(true);
    for (const value of ['1e3', '-5', '1.123456789', '0', 'NaN', '', '001.5']) expect(validDecimal(value)).toBe(false);
    expect(validDecimal('0', true)).toBe(true);
  });
  it('enforces the password and email input limits', () => {
    expect(validatePassword('short')).not.toBeNull(); expect(validatePassword('x'.repeat(129))).not.toBeNull(); expect(validatePassword('a long unique passphrase')).toBeNull();
    expect(validateEmail('a@example.com')).toBeNull(); expect(validateEmail('invalid')).not.toBeNull();
  });
});
