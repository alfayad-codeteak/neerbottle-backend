import { ConfigService } from '@nestjs/config';

/**
 * Returns a non-empty secret from Config, or `fallback`.
 * Blank env values (e.g. `JWT_ACCESS_SECRET` bound as an empty string on Cloudflare) must not
 * be passed to passport-jwt — `??` only treats null/undefined, not `""`.
 */
export function secretFromConfig(config: ConfigService, key: string, fallback: string): string {
  const value = config.get<string>(key)?.trim();
  return value && value.length > 0 ? value : fallback;
}
