import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MinLength, ValidateIf } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class LoginDto {
  @ApiProperty({
    example: '9876543210',
    description: '10-digit mobile number (same as used with `POST /api/auth/send-login-otp`).',
  })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;

  @ApiPropertyOptional({
    description:
      'Password login only. Omit when using `otp`. User must exist and have `passwordHash` set.',
  })
  @ValidateIf((o) => !o.otp)
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'OTP verification: 6 digits from SMS after `POST /api/auth/send-login-otp`. On success, session is issued and a customer `User` is created if this phone was new.',
  })
  @ValidateIf((o) => !o.password)
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'OTP must be 6 digits' })
  otp?: string;
}
