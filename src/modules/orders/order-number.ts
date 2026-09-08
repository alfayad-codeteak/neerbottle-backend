/** IST calendar prefix DDMMYYYY without relying on ICU timezone data. */
export function publicOrderDatePrefix(at = new Date()): string {
  const istMs = at.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(ist.getUTCFullYear());
  return `${dd}${mm}${yyyy}`;
}

export function formatPublicOrderNumber(prefix: string, seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${prefix}${String(n).padStart(3, '0')}`;
}

export function normalizePublicOrderNumber(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}
