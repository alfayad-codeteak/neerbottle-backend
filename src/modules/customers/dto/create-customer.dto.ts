import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MinLength, MaxLength, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAddressDto } from '../../addresses/dto/create-address.dto';

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

  @ApiPropertyOptional({
    type: CreateAddressDto,
    description: 'Optional delivery address to create with the customer (first address defaults to isDefault if omitted).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAddressDto)
  address?: CreateAddressDto;
}
