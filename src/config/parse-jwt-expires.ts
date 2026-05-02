/** Parses env-style expiry: `15m`, `7d`, `24h`. Unknown format → 900 seconds. */
export function parseExpiresToSeconds(expires: string): number {
  const match = expires.trim().match(/^(\d+)([dhm])$/);
  if (!match) return 900;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60,
    h: 60 * 60,
    m: 60,
  };
  return num * (multipliers[unit] ?? 60);
}

export function refreshExpiryToDate(expires: string): Date {
  const match = expires.trim().match(/^(\d+)([dhm])$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
  };
  return new Date(Date.now() + num * (multipliers[unit] ?? 86400000));
}
