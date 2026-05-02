import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const PHONE_REGEX = /^[0-9]{10}$/;

export class SendLoginOtpDto {
  @ApiProperty({
    example: '9876543210',
    description:
      '10-digit phone. OTP is sent with **no role check** (any `User` role or no user yet). Then call `POST /api/auth/login` with `otp` to open a **customer-scoped** storefront session (new users are created as `customer`).',
  })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'Phone must be 10 digits' })
  phone: string;
}
