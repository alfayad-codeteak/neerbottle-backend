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
import { SendLoginOtpDto } from './dto/send-login-otp.dto';
import { DeliveryPartnerLoginDto } from './dto/delivery-partner-login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  AuthResponseDto,
  DeliveryPartnerAuthResponseDto,
  OtpSentResponseDto,
} from './dto/auth-response.dto';
import {
  ApiErrorResponseDto,
  ApiUnauthorizedResponseDto,
  LogoutResponseDto,
} from '../../common/swagger/swagger-response.dto';

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
    summary: 'Customer, staff, or delivery partner login',
    description:
      'Authenticate with **phone + password** or **phone + OTP**. Returns short-lived `accessToken`, rotating `refreshToken`, `expiresIn` (seconds), and `user` including `role` and `permissions` (admins). For partner-only apps, prefer **`POST /auth/login-delivery-partner`** so non-partner accounts receive 401.',
  })
  @ApiOkResponse({
    description: 'Authenticated session.',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or expired OTP.', type: ApiErrorResponseDto })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('send-login-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP for customer login',
    description:
      'Sends a 6-digit OTP to the phone when an account exists. Use with **`POST /auth/login`** (`phone` + `otp`). Same MSG91 template as registration.',
  })
  @ApiOkResponse({ description: 'OTP dispatched (or queued at provider).', type: OtpSentResponseDto })
  @ApiResponse({ status: 401, description: 'No account for this phone.', type: ApiErrorResponseDto })
  @ApiResponse({
    status: 503,
    description: 'Database unavailable or SMS provider error.',
    type: ApiErrorResponseDto,
  })
  async sendLoginOtp(@Body() dto: SendLoginOtpDto): Promise<OtpSentResponseDto> {
    return this.authService.sendLoginOtp(dto.phone);
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

  @Post('login-delivery-partner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delivery partner login',
    description:
      '**Phone + password only** (no OTP). Succeeds only when the account role is `deliveryPartner`. Use for the partner app so customer or staff tokens are not issued from the wrong entry point.',
  })
  @ApiOkResponse({
    description:
      'Delivery partner session. `user.role` is always `deliveryPartner`; `permissions` are not included (admin-only field).',
    type: DeliveryPartnerAuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. missing password, phone not 10 digits).',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid phone/password, or account exists but is not a delivery partner.',
    type: ApiUnauthorizedResponseDto,
  })
  async loginDeliveryPartner(@Body() dto: DeliveryPartnerLoginDto): Promise<DeliveryPartnerAuthResponseDto> {
    return this.authService.loginDeliveryPartner(dto);
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
