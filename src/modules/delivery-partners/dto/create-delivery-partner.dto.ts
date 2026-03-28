import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MinLength, IsOptional } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class CreateDeliveryPartnerDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;

  @ApiProperty({ example: 'Ravi Kumar' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'loginPassword123', description: 'Min 6 characters' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'Bike' })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({ example: 'KL-01-AB-1234' })
  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
