import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class SendLoginOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;
}
