function numericText(value: string | null | undefined): value is string {
  // API decimals retain their precision. Scientific notation is accepted only for chart tooltips.
  return typeof value === 'string' && value.length <= 64 && /^-?\d+(?:\.\d+)?(?:e[+-]?\d{1,2})?$/i.test(value);
}
function exactFormat(formatter: Intl.NumberFormat, value: string): string {
  // Modern Intl accepts decimal strings; the TypeScript signature still lists number/bigint.
  return Reflect.apply(formatter.format, formatter, [value]) as string;
}
export function money(value: string | null | undefined, currency = 'USD'): string {
  if (!numericText(value)) return 'Not available';
  return exactFormat(new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }), value);
}
export function quantity(value: string | null | undefined): string {
  if (!numericText(value)) return '—';
  return exactFormat(new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }), value);
}
export function dateTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not available';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
export function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
export function validDecimal(value: string, allowZero = false): boolean {
  return /^(?:0|[1-9]\d{0,17})(?:\.\d{1,8})?$/.test(value) && (allowZero || /[1-9]/.test(value));
}
export function validatePassword(password: string): string | null {
  return password.length < 12 || password.length > 128 ? 'Use a password between 12 and 128 characters.' : null;
}
export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254 ? null : 'Enter a valid email address.';
}
export function localDateTime(): string {
  const current = new Date();
  return new Date(current.getTime() - current.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
