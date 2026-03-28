import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiCreatedResponse,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto, OtpSentResponseDto } from './dto/auth-response.dto';
import { ApiErrorResponseDto, LogoutResponseDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register or complete customer signup',
    description: [
      '**Step 1 — request OTP:** send `phone` (and optional `name` / `password`). Response: OTP sent (`OtpSentResponseDto`).',
      '**Step 2 — verify:** send same `phone` plus `otp` (6 digits). Response: JWT tokens and `user` (`AuthResponseDto`).',
      '',
      'Password is optional for OTP-only users; minimum length 6 when provided.',
    ].join('\n'),
  })
  @ApiCreatedResponse({
    description:
      'Either OTP challenge (incomplete registration) or full session with tokens. Inspect `sent` vs `accessToken`.',
    schema: {
      oneOf: [{ $ref: getSchemaPath(OtpSentResponseDto) }, { $ref: getSchemaPath(AuthResponseDto) }],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failure or invalid OTP.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Phone already registered.', type: ApiErrorResponseDto })
  async register(
    @Body() dto: RegisterDto,
  ): Promise<AuthResponseDto | OtpSentResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer or staff login',
    description:
      'Authenticate with **phone + password** or **phone + OTP**. Returns short-lived `accessToken`, rotating `refreshToken`, `expiresIn` (seconds), and `user` including `role` and `permissions` (admins).',
  })
  @ApiOkResponse({
    description: 'Authenticated session.',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or expired OTP.', type: ApiErrorResponseDto })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('login-owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Owner-only login',
    description:
      'Same credential rules as `login`, but succeeds only when the account role is `owner`. Use for the owner dashboard entry point.',
  })
  @ApiOkResponse({ description: 'Owner session.', type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account is not an owner.',
    type: ApiErrorResponseDto,
  })
  async loginOwner(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.loginOwner(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate tokens',
    description:
      'Submit a valid `refreshToken` to receive a new access/refresh pair. Old refresh token is invalidated.',
  })
  @ApiOkResponse({ description: 'New token pair.', type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or already-used refresh token.',
    type: ApiErrorResponseDto,
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('register-owner')
  @ApiHeader({
    name: 'X-Owner-Secret',
    description:
      'Required when `OWNER_SECRET` is set in server environment. Omit when unset (bootstrap first owner only).',
    required: false,
  })
  @ApiOperation({
    summary: 'Bootstrap first owner account',
    description: [
      'Creates the single **owner** user (phone + password + name).',
      'If `OWNER_SECRET` is configured, the same value must be sent in `X-Owner-Secret`.',
      'Subsequent owner creation is rejected; additional staff should be created as `admin` via owner APIs.',
    ].join('\n'),
  })
  @ApiCreatedResponse({ description: 'Owner registered; returns tokens like login.', type: AuthResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation error or owner already exists.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or wrong `X-Owner-Secret` when required.',
    type: ApiErrorResponseDto,
  })
  async registerOwner(
    @Body() dto: RegisterOwnerDto,
    @Headers('x-owner-secret') ownerSecret: string,
  ): Promise<AuthResponseDto> {
    return this.authService.registerOwner(dto, ownerSecret ?? '');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invalidate refresh token',
    description: 'Pass the current `refreshToken` to revoke the session server-side.',
  })
  @ApiOkResponse({ description: 'Refresh token removed.', type: LogoutResponseDto })
  async logout(@Body() dto: LogoutDto): Promise<{ success: boolean }> {
    return this.authService.logout(dto.refreshToken);
  }
}
