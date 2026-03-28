import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(private readonly redis: RedisService) {}

  async check() {
    const redisConfigured = this.redis.isEnabled();
    const redisOk = redisConfigured ? await this.redis.ping() : null;
    return {
      status: 'ok',
      service: 'AquaFliq Water Ordering API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      redis: {
        enabled: redisConfigured,
        ping: redisOk,
      },
    };
  }

  ping() {
    return { pong: true };
  }
}
