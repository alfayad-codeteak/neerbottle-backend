import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, OtpSentResponseDto } from './dto/auth-response.dto';

const DB_UNAVAILABLE_MSG =
  'Database is not available. Set DATABASE_URL in .env and run: npx prisma migrate dev';

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto | OtpSentResponseDto> {
    const { phone, name, password, otp } = dto;

    try {
      if (otp) {
        // Verify OTP and create user
        const valid = await this.verifyOtp(phone, otp);
        if (!valid) {
          throw new BadRequestException('Invalid or expired OTP');
        }
        const existing = await this.prisma.user.findUnique({ where: { phone } });
        if (existing) {
          throw new ConflictException('User already registered with this phone');
        }
        const passwordHash = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;
        const user = await this.prisma.user.create({
          data: { phone, name: name ?? null, passwordHash },
        });
        await this.deleteOtp(phone);
        const tokens = await this.buildTokens(user.id, user.phone);
        return { ...tokens, user: this.toUserResponse(user) };
      }

      // Request OTP (no OTP in body)
      const existing = await this.prisma.user.findUnique({ where: { phone } });
      if (existing) {
        throw new ConflictException('User already registered with this phone');
      }
      const code = this.generateOtp();
      await this.prisma.otpVerification.deleteMany({ where: { phone } });
      await this.prisma.otpVerification.create({
        data: {
          phone,
          code,
          expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        },
      });
      // TODO: Integrate SMS gateway (Twilio, MSG91, etc.)
      console.log(`[Auth] OTP for ${phone}: ${code}`);
      return { sent: true, message: 'OTP sent to your phone' };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException) {
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
      const user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        throw new UnauthorizedException('Invalid phone or password');
      }

      if (otp) {
        const valid = await this.verifyOtp(phone, otp);
        if (!valid) {
          throw new UnauthorizedException('Invalid or expired OTP');
        }
        await this.deleteOtp(phone);
      } else if (password && user.passwordHash) {
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
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) {
        throw err;
      }
      if (this.isDbUnavailableError(err)) {
        throw new ServiceUnavailableException(DB_UNAVAILABLE_MSG);
      }
      throw err;
    }
  }

  async loginOwner(dto: LoginDto): Promise<AuthResponseDto> {
    const response = await this.login(dto);
    if (response.user?.role !== 'owner') {
      throw new UnauthorizedException('Owner credentials required');
    }
    return response;
  }

  async registerOwner(dto: RegisterOwnerDto, ownerSecretFromHeader: string): Promise<AuthResponseDto> {
    const secret = this.config.get<string>('OWNER_SECRET');
    if (!secret || !ownerSecretFromHeader || ownerSecretFromHeader !== secret) {
      throw new UnauthorizedException('Invalid or missing X-Owner-Secret header');
    }
    const existingOwner = await this.prisma.user.findFirst({
      where: { role: 'owner' },
    });
    if (existingOwner) {
      throw new BadRequestException('Owner already registered');
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
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (stored) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    }
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
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
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

  private async buildTokens(userId: string, phone: string): Promise<Omit<AuthResponseDto, 'user'>> {
    const accessSecret = this.config.get<string>('JWT_ACCESS_SECRET') ?? 'access-secret-change-me';
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET') ?? 'refresh-secret-change-me';
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';

    const accessExpiresSec = this.parseExpiresToSeconds(accessExpires);
    const refreshExpiresSec = this.parseExpiresToSeconds(refreshExpires);
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
        expiresAt: this.refreshExpiryToDate(refreshExpires),
      },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  private parseExpiresToSeconds(expires: string): number {
    const match = expires.match(/^(\d+)([dhm])$/);
    if (!match) return 900;
    const [, n, unit] = match;
    const num = parseInt(n, 10);
    const multipliers: Record<string, number> = {
      d: 24 * 60 * 60,
      h: 60 * 60,
      m: 60,
    };
    return num * (multipliers[unit] ?? 60);
  }

  private refreshExpiryToDate(expires: string): Date {
    const match = expires.match(/^(\d+)([dhm])$/);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [, n, unit] = match;
    const num = parseInt(n, 10);
    const multipliers: Record<string, number> = {
      d: 24 * 60 * 60 * 1000,
      h: 60 * 60 * 1000,
      m: 60 * 1000,
    };
    return new Date(Date.now() + num * (multipliers[unit] ?? 86400000));
  }

  private async validateRefreshToken(token: string): Promise<{ sub: string }> {
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET') ?? 'refresh-secret-change-me';
    try {
      return await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private generateOtp(): string {
    let code = '';
    for (let i = 0; i < OTP_LENGTH; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
  }

  private async verifyOtp(phone: string, code: string): Promise<boolean> {
    const record = await this.prisma.otpVerification.findFirst({
      where: { phone, code },
      orderBy: { createdAt: 'desc' },
    });
    return !!record && record.expiresAt > new Date();
  }

  private async deleteOtp(phone: string): Promise<void> {
    await this.prisma.otpVerification.deleteMany({ where: { phone } });
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
