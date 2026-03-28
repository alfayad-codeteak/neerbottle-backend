import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const OTP_KEY_PREFIX = 'fliq:otp:';

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

  private otpKey(phone: string): string {
    return `${OTP_KEY_PREFIX}${phone}`;
  }

  async setOtp(phone: string, code: string, ttlSeconds: number): Promise<void> {
    if (!this.client || !this.ready) return;
    await this.client.set(this.otpKey(phone), code, 'EX', ttlSeconds);
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    if (!this.client || !this.ready) return false;
    const stored = await this.client.get(this.otpKey(phone));
    return stored !== null && stored === code;
  }

  async deleteOtp(phone: string): Promise<void> {
    if (!this.client || !this.ready) return;
    await this.client.del(this.otpKey(phone));
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
