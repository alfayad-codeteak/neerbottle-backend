import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, Matches, MinLength } from 'class-validator';
import { FEATURES } from '../../../common/constants/features';

const PHONE_REGEX = /^[0-9]{10}$/;

export class CreateAdminDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'password123', description: 'Min 6 characters' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: ['products', 'orders'],
    description: 'Feature keys this admin can access',
    enum: FEATURES,
  })
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
