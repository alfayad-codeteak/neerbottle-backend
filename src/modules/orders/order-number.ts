/** IST calendar prefix DDMMYYYY, e.g. 8 Sep 2026 → 08092026 */
export function publicOrderDatePrefix(at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('day')}${pick('month')}${pick('year')}`;
}

export function formatPublicOrderNumber(prefix: string, seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${prefix}${String(n).padStart(3, '0')}`;
}

export function normalizePublicOrderNumber(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}
