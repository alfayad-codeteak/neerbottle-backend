import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches, MinLength, MaxLength } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class RegisterDto {
  @ApiProperty({ example: '9876543210', description: '10-digit phone number' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Password for future login (optional if using OTP only)' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;

  @ApiPropertyOptional({ example: '123456', description: 'OTP sent to phone (required to complete registration)' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'OTP must be 6 digits' })
  otp?: string;
}
