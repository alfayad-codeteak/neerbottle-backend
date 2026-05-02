import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, type OtpPurpose } from '../../redis/redis.service';
import { Msg91Service } from '../../msg91/msg91.service';
import { secretFromConfig } from '../../config/secret-from-env';
import { parseExpiresToSeconds, refreshExpiryToDate } from '../../config/parse-jwt-expires';
import { Prisma } from '../../generated/prisma';
import { RegisterDto } from './dto/register.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { LoginDto } from './dto/login.dto';
import { DeliveryPartnerLoginDto } from './dto/delivery-partner-login.dto';
import { AuthResponseDto, DeliveryPartnerAuthResponseDto, OtpSentResponseDto } from './dto/auth-response.dto';

const DB_UNAVAILABLE_MSG =
  'Database is not available. Set DATABASE_URL in .env and run: npx prisma migrate dev';

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;
const SALT_ROUNDS = 10;
const OTP_SEND_COOLDOWN_MS = 60_000;
const OTP_SEND_MAX_PER_HOUR = 10;
const MAX_REFRESH_SESSIONS_PER_USER = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly msg91: Msg91Service,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto | OtpSentResponseDto> {
    const { phone, name, password, otp } = dto;

    try {
      if (otp) {
        const consumed = await this.consumeOtp(phone, otp, 'register');
        if (!consumed) {
          throw new UnauthorizedException('Invalid or expired OTP');
        }
        const existing = await this.prisma.user.findUnique({ where: { phone } });
        if (existing) {
          throw new ConflictException('User already registered with this phone');
        }
        const passwordHash = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;
        const user = await this.prisma.user.create({
          data: { phone, name: name ?? null, passwordHash },
        });
        const tokens = await this.buildTokens(user.id, user.phone);
        return { ...tokens, user: this.toUserResponse(user) };
      }

      // Request OTP (no OTP in body)
      const existing = await this.prisma.user.findUnique({ where: { phone } });
      if (existing) {
        throw new ConflictException('User already registered with this phone');
      }
      await this.sendOtpSmsWithThrottle({
        phone,
        purpose: 'register',
        nameForSms: name ?? this.msg91.defaultShopName(),
      });
      return { sent: true, message: 'OTP sent to your phone' };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException ||
        err instanceof UnauthorizedException ||
        (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS)
      ) {
        throw err;
      }
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  async sendLoginOtp(phone: string): Promise<OtpSentResponseDto> {
    try {
      await this.sendOtpSmsWithThrottle({
        phone,
        purpose: 'login',
        nameForSms: this.msg91.defaultShopName(),
      });
      return { sent: true, message: 'OTP sent to your phone' };
    } catch (err) {
      if (
        err instanceof ServiceUnavailableException ||
        (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS)
      ) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const { phone, password, otp } = dto;
    if (!password && !otp) {
      throw new BadRequestException('Provide either password or OTP');
    }

    try {
      if (otp) {
        const consumed = await this.consumeOtp(phone, otp, 'login');
        if (!consumed) {
          throw new UnauthorizedException('Invalid or expired OTP');
        }
        let user = await this.prisma.user.findUnique({ where: { phone } });
        if (!user) {
          try {
            user = await this.prisma.user.create({ data: { phone } });
          } catch (err) {
            if (this.isPrismaUniqueViolation(err)) {
              user = await this.prisma.user.findUnique({ where: { phone } });
            } else {
              throw err;
            }
          }
        }
        if (!user) {
          throw new InternalServerErrorException('Could not create or load user');
        }
        const tokens = await this.buildTokens(user.id, user.phone);
        return { ...tokens, user: this.toUserResponse(user) };
      }

      const user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        throw new UnauthorizedException('Invalid phone or password');
      }

      if (password && user.passwordHash) {
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
          throw new UnauthorizedException('Invalid phone or password');
        }
      } else {
        throw new UnauthorizedException('Password not set. Use OTP to login.');
      }

      const tokens = await this.buildTokens(user.id, user.phone);
      return { ...tokens, user: this.toUserResponse(user) };
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof BadRequestException ||
        err instanceof InternalServerErrorException
      ) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  async loginOwner(dto: LoginDto): Promise<AuthResponseDto> {
    const { phone, password, otp } = dto;
    if (!password && !otp) {
      throw new BadRequestException('Provide either password or OTP');
    }

    if (otp) {
      try {
        const user = await this.prisma.user.findUnique({ where: { phone } });
        if (!user || user.role !== 'owner') {
          throw new UnauthorizedException('Owner credentials required');
        }
        const consumed = await this.consumeOtp(phone, otp, 'login');
        if (!consumed) {
          throw new UnauthorizedException('Invalid or expired OTP');
        }
        const tokens = await this.buildTokens(user.id, user.phone);
        return { ...tokens, user: this.toUserResponse(user) };
      } catch (err) {
        if (
          err instanceof UnauthorizedException ||
          err instanceof BadRequestException ||
          err instanceof InternalServerErrorException
        ) {
          throw err;
        }
        if (this.isDbUnavailableError(err)) {
          throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
        }
        throw err;
      }
    }

    const response = await this.login(dto);
    if (response.user?.role !== 'owner') {
      throw new UnauthorizedException('Owner credentials required');
    }
    return response;
  }

  async loginDeliveryPartner(dto: DeliveryPartnerLoginDto): Promise<DeliveryPartnerAuthResponseDto> {
    const { phone, password } = dto;

    try {
      const user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        throw new UnauthorizedException('Invalid phone or password');
      }
      if (!user.passwordHash) {
        throw new UnauthorizedException('Invalid phone or password');
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        throw new UnauthorizedException('Invalid phone or password');
      }
      if (user.role !== 'deliveryPartner') {
        throw new UnauthorizedException('Delivery partner credentials required');
      }

      const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId: user.id } });
      if (!partner) {
        throw new InternalServerErrorException('Delivery partner profile missing for this account');
      }

      const tokens = await this.buildTokens(user.id, user.phone);
      return {
        ...tokens,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: 'deliveryPartner' as const,
        },
        deliveryPartner: this.serializeDeliveryPartner(partner),
      };
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  async registerOwner(dto: RegisterOwnerDto, ownerSecretFromHeader: string): Promise<AuthResponseDto> {
    try {
      const existingOwner = await this.prisma.user.findFirst({
        where: { role: 'owner' },
      });
      if (existingOwner) {
        throw new BadRequestException('Owner already registered');
      }

      const secret = this.config.get<string>('OWNER_SECRET')?.trim();
      if (secret) {
        if (!ownerSecretFromHeader || ownerSecretFromHeader !== secret) {
          throw new UnauthorizedException('Invalid or missing X-Owner-Secret header');
        }
      }
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        throw new ConflictException('User already registered with this phone');
      }
      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      const user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          name: dto.name,
          passwordHash,
          role: 'owner',
        },
      });
      const tokens = await this.buildTokens(user.id, user.phone);
      return { ...tokens, user: this.toUserResponse(user) };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { success: true };
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    try {
      await this.validateRefreshToken(refreshToken);

      const stored = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });
      if (!stored || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Atomic-ish single-use behavior: if another request already consumed this token,
      // deleteMany count will be 0 and we reject this refresh attempt.
      const deleted = await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
      if (deleted.count === 0) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const tokens = await this.buildTokens(stored.user.id, stored.user.phone);
      return { ...tokens, user: this.toUserResponse(stored.user) };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  private toUserResponse(user: { id: string; phone: string; name: string | null; role: string; permissions: unknown }): AuthResponseDto['user'] {
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      ...(permissions.length > 0 && { permissions }),
    };
  }

  private serializeDeliveryPartner(p: {
    id: string;
    userId: string;
    name: string;
    phone: string;
    vehicleType: string | null;
    vehicleNumber: string | null;
    isAvailable: boolean;
    currentLat: { toString(): string } | null;
    currentLng: { toString(): string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      phone: p.phone,
      vehicleType: p.vehicleType,
      vehicleNumber: p.vehicleNumber,
      isAvailable: p.isAvailable,
      currentLat: p.currentLat != null ? Number(p.currentLat) : null,
      currentLng: p.currentLng != null ? Number(p.currentLng) : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private async buildTokens(userId: string, phone: string): Promise<Omit<AuthResponseDto, 'user'>> {
    const accessSecret = secretFromConfig(this.config, 'JWT_ACCESS_SECRET', 'access-secret-change-me');
    const refreshSecret = secretFromConfig(this.config, 'JWT_REFRESH_SECRET', 'refresh-secret-change-me');
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';

    const accessExpiresSec = parseExpiresToSeconds(accessExpires);
    const refreshExpiresSec = parseExpiresToSeconds(refreshExpires);
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, phone },
        { secret: accessSecret, expiresIn: accessExpiresSec },
      ),
      this.jwtService.signAsync(
        { sub: userId, phone },
        { secret: refreshSecret, expiresIn: refreshExpiresSec },
      ),
    ]);

    const decoded = this.jwtService.decode(accessToken) as { exp: number; iat: number };
    const expiresIn = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : accessExpiresSec;

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: refreshExpiryToDate(refreshExpires),
      },
    });
    await this.pruneRefreshTokensBeyondCap(userId);

    return { accessToken, refreshToken, expiresIn };
  }

  private async pruneRefreshTokensBeyondCap(userId: string): Promise<void> {
    const excess = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_REFRESH_SESSIONS_PER_USER,
      select: { id: true },
    });
    if (excess.length === 0) return;
    await this.prisma.refreshToken.deleteMany({
      where: { id: { in: excess.map((e) => e.id) } },
    });
  }

  private async validateRefreshToken(token: string): Promise<{ sub: string }> {
    const refreshSecret = secretFromConfig(this.config, 'JWT_REFRESH_SECRET', 'refresh-secret-change-me');
    try {
      return await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async deliverOtpSms(phone: string, code: string, nameForTemplate: string): Promise<void> {
    await this.msg91.sendOtpSms(phone, code, nameForTemplate);
    if (!this.msg91.isEnabled()) {
      this.logger.log(`[Auth] OTP for ${phone}: ${code} (MSG91_AUTH_KEY unset — not sent via SMS)`);
    }
  }

  private generateOtp(): string {
    let code = '';
    for (let i = 0; i < OTP_LENGTH; i++) {
      code += randomInt(0, 10).toString();
    }
    return code;
  }

  private async assertOtpSendAllowed(phone: string): Promise<void> {
    const now = Date.now();
    const cooldownCutoff = new Date(now - OTP_SEND_COOLDOWN_MS);
    const recent = await this.prisma.otpSendLog.findFirst({
      where: { phone, sentAt: { gte: cooldownCutoff } },
      orderBy: { sentAt: 'desc' },
    });
    if (recent) {
      const retryAfterSec = Math.ceil(
        (recent.sentAt.getTime() + OTP_SEND_COOLDOWN_MS - now) / 1000,
      );
      throw new HttpException(
        `Please wait ${Math.max(1, retryAfterSec)} seconds before requesting another OTP.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const hourlyCount = await this.prisma.otpSendLog.count({
      where: { phone, sentAt: { gte: hourAgo } },
    });
    if (hourlyCount >= OTP_SEND_MAX_PER_HOUR) {
      throw new HttpException(
        'Too many OTP requests for this phone. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async sendOtpSmsWithThrottle(args: {
    phone: string;
    purpose: OtpPurpose;
    nameForSms: string;
  }): Promise<void> {
    await this.assertOtpSendAllowed(args.phone);
    const code = this.generateOtp();
    await this.saveOtp(args.phone, code, args.purpose);
    try {
      await this.deliverOtpSms(args.phone, code, args.nameForSms);
    } catch (err) {
      await this.deleteOtp(args.phone, args.purpose);
      throw err;
    }
    await this.prisma.otpSendLog.create({ data: { phone: args.phone } });
  }

  private async saveOtp(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const ttlSec = OTP_EXPIRY_MINUTES * 60;
    if (this.redis.isEnabled()) {
      const ok = await this.redis.setOtp(phone, code, ttlSec, purpose);
      if (ok) return;
      this.logger.warn('Redis OTP write did not complete; persisting OTP in the database');
    }
    await this.prisma.otpVerification.deleteMany({ where: { phone, purpose } });
    await this.prisma.otpVerification.create({
      data: {
        phone,
        purpose,
        code,
        expiresAt: new Date(Date.now() + ttlSec * 1000),
      },
    });
  }

  /** Validates OTP and consumes it in one step (prevents parallel reuse). */
  private async consumeOtp(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    if (this.redis.isEnabled()) {
      const fromRedis = await this.redis.consumeOtpIfMatch(phone, code, purpose);
      if (fromRedis) return true;
    }
    const now = new Date();
    const deleted = await this.prisma.otpVerification.deleteMany({
      where: { phone, purpose, code, expiresAt: { gt: now } },
    });
    return deleted.count === 1;
  }

  private async deleteOtp(phone: string, purpose: OtpPurpose): Promise<void> {
    if (this.redis.isEnabled()) {
      await this.redis.deleteOtp(phone, purpose);
      return;
    }
    await this.prisma.otpVerification.deleteMany({ where: { phone, purpose } });
  }

  private isPrismaUniqueViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  private isDbUnavailableError(err: unknown): boolean {
    const name = err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : '';
    const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
    return (
      name === 'PrismaClientInitializationError' ||
      /denied access|not available|Can't reach database|Connection refused/i.test(message)
    );
  }
}
