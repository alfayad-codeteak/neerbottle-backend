/** Parses env-style expiry: `15m`, `5h`, `90d`. Unknown format → 5 hours. */
export function parseExpiresToSeconds(expires: string): number {
  const match = expires.trim().match(/^(\d+)([dhm])$/i);
  if (!match) return 5 * 60 * 60;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60,
    h: 60 * 60,
    m: 60,
  };
  return num * (multipliers[unit] ?? 60);
}

export function refreshExpiryToDate(expires: string): Date {
  return new Date(Date.now() + parseExpiresToSeconds(expires) * 1000);
}

export function jwtAccessExpiresSpec(raw?: string | null): string {
  const v = raw?.trim();
  return v || '5h';
}

export function jwtRefreshExpiresSpec(raw?: string | null): string {
  const v = raw?.trim();
  return v || '90d';
}
