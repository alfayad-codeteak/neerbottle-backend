import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const OTP_KEY_PREFIX = 'fliq:otp:';

export type OtpPurpose = 'login' | 'register';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    const host = this.config.get<string>('REDIS_HOST')?.trim();

    if (!url && !host) {
      this.logger.log('Redis not configured (set REDIS_URL or REDIS_HOST); OTP uses database');
      return;
    }

    try {
      this.client = url
        ? new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true })
        : new Redis({
            host,
            port: parseInt(this.config.get<string>('REDIS_PORT') ?? '6379', 10),
            password: this.config.get<string>('REDIS_PASSWORD')?.trim() || undefined,
            maxRetriesPerRequest: 2,
            lazyConnect: true,
          });
    } catch (e) {
      this.logger.warn(`Redis client init failed: ${e}`);
      this.client = null;
      return;
    }

    try {
      await this.client.connect();
      await this.client.ping();
      this.ready = true;
      this.logger.log('Redis connected');
    } catch (err) {
      this.logger.warn(`Redis unavailable (${err instanceof Error ? err.message : err}); OTP falls back to database`);
      this.client.disconnect();
      this.client = null;
      this.ready = false;
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }

  isEnabled(): boolean {
    return this.ready && this.client !== null;
  }

  private otpKey(phone: string, purpose: OtpPurpose): string {
    return `${OTP_KEY_PREFIX}${purpose}:${phone}`;
  }

  /** Returns false if Redis is not usable (caller should fall back to DB). */
  async setOtp(phone: string, code: string, ttlSeconds: number, purpose: OtpPurpose): Promise<boolean> {
    if (!this.client || !this.ready) return false;
    await this.client.set(this.otpKey(phone, purpose), code, 'EX', ttlSeconds);
    return true;
  }

  /** Single-use: deletes the OTP key only if the code matches (atomic). */
  async consumeOtpIfMatch(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    if (!this.client || !this.ready) return false;
    const key = this.otpKey(phone, purpose);
    const lua = `
      local v = redis.call('GET', KEYS[1])
      if v == false or v == nil then return 0 end
      if v == ARGV[1] then
        redis.call('DEL', KEYS[1])
        return 1
      end
      return 0
    `;
    const r = await this.client.eval(lua, 1, key, code);
    return r === 1;
  }

  async deleteOtp(phone: string, purpose: OtpPurpose): Promise<void> {
    if (!this.client || !this.ready) return;
    await this.client.del(this.otpKey(phone, purpose));
  }

  async ping(): Promise<boolean> {
    if (!this.client || !this.ready) return false;
    try {
      const r = await this.client.ping();
      return r === 'PONG';
    } catch {
      return false;
    }
  }
}
