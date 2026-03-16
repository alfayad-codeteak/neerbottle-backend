import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Home', description: 'e.g. Home, Office, Shop' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  @MinLength(1)
  line1: string;

  @ApiPropertyOptional({ example: 'Apartment 4' })
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @MinLength(1)
  city: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '400001' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ example: '9876543210', description: 'Contact phone at this address' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: false, description: 'Set as default delivery address' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
