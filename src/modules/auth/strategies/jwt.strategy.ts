import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { secretFromConfig } from '../../../config/secret-from-env';

export type JwtPayload = { sub: string; phone: string; customerOtpSession?: boolean };

type CachedAuthUser = {
  id: string;
  phone: string;
  role: string;
  permissions: unknown;
  expiresAt: number;
};

const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX = 500;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly authCache = new Map<string, CachedAuthUser>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secretFromConfig(config, 'JWT_ACCESS_SECRET', 'access-secret-change-me'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.getAuthUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    const customerOtpSession = !!payload.customerOtpSession;
    const permissions = customerOtpSession
      ? []
      : Array.isArray(user.permissions)
        ? (user.permissions as string[])
        : [];
    const role = customerOtpSession ? 'customer' : user.role;
    return { id: user.id, phone: user.phone, role, permissions };
  }

  private async getAuthUser(userId: string) {
    const now = Date.now();
    const cached = this.authCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, role: true, permissions: true },
    });
    if (!user) {
      this.authCache.delete(userId);
      return null;
    }

    if (this.authCache.size >= AUTH_CACHE_MAX) {
      const oldest = this.authCache.keys().next().value;
      if (oldest) this.authCache.delete(oldest);
    }

    const entry: CachedAuthUser = {
      ...user,
      expiresAt: now + AUTH_CACHE_TTL_MS,
    };
    this.authCache.set(userId, entry);
    return entry;
  }
}
