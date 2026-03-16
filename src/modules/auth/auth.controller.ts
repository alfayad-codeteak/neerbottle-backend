import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto, OtpSentResponseDto } from './dto/auth-response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new customer (phone + OTP)' })
  @ApiResponse({ status: 201, description: 'OTP sent or user created with tokens' })
  @ApiResponse({ status: 400, description: 'Invalid input or OTP' })
  @ApiResponse({ status: 409, description: 'Phone already registered' })
  async register(
    @Body() dto: RegisterDto,
  ): Promise<AuthResponseDto | OtpSentResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone + password or OTP (returns tokens + user with role)' })
  @ApiResponse({ status: 200, description: 'Returns access and refresh tokens plus user (id, phone, name, role)' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('login-owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Owner login – same as login but only succeeds for owner role' })
  @ApiResponse({ status: 200, description: 'Returns tokens + user (role: owner)' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or not an owner' })
  async loginOwner(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.loginOwner(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh login session (get new access token)' })
  @ApiResponse({ status: 200, description: 'New access and refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('register-owner')
  @ApiHeader({
    name: 'X-Owner-Secret',
    description: 'Must match OWNER_SECRET in .env (not sent in body)',
    required: true,
  })
  @ApiOperation({ summary: 'Register first owner – send secret in X-Owner-Secret header' })
  @ApiResponse({ status: 201, description: 'Owner created, returns tokens' })
  @ApiResponse({ status: 400, description: 'Owner already exists or invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-Owner-Secret header' })
  async registerOwner(
    @Body() dto: RegisterOwnerDto,
    @Headers('x-owner-secret') ownerSecret: string,
  ): Promise<AuthResponseDto> {
    return this.authService.registerOwner(dto, ownerSecret ?? '');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout – invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Session invalidated' })
  async logout(@Body() dto: LogoutDto): Promise<{ success: boolean }> {
    return this.authService.logout(dto.refreshToken);
  }
}
