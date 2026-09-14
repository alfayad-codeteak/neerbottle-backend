import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class CreateOwnerDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;

  @ApiProperty({ example: 'Rizwan' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'password123', description: 'Min 6 characters' })
  @IsString()
  @MinLength(6)
  password: string;
}
