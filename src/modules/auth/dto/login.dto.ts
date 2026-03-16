import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MinLength, ValidateIf } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class LoginDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;

  @ApiPropertyOptional({ description: 'Password (use when logging in with password)' })
  @ValidateIf((o) => !o.otp)
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: '123456', description: 'OTP (use when logging in with OTP)' })
  @ValidateIf((o) => !o.password)
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'OTP must be 6 digits' })
  otp?: string;
}
