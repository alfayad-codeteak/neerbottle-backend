import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional()
  name: string | null;

  @ApiProperty({ example: 'owner', enum: ['owner', 'admin', 'customer'] })
  role: string;

  @ApiPropertyOptional({ example: ['products', 'orders'], description: 'Only for admin' })
  permissions?: string[];
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;

  @ApiProperty({ example: 3600 })
  expiresIn: number;

  @ApiPropertyOptional({ type: UserResponseDto, description: 'Logged-in user (id, phone, name, role)' })
  user?: UserResponseDto;
}

export class OtpSentResponseDto {
  @ApiProperty({ example: true })
  sent: boolean;

  @ApiProperty({ example: 'OTP sent to your phone' })
  message: string;
}
