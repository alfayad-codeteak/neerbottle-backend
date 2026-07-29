import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MinLength, MaxLength, IsOptional } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class CreateCustomerDto {
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

  @ApiPropertyOptional({ description: 'Password for login (optional if using OTP only)' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;
}
