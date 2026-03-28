import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '9876543210', description: '10-digit login identifier' })
  phone: string;

  @ApiPropertyOptional({ nullable: true, description: 'Display name when set' })
  name: string | null;

  @ApiProperty({
    example: 'customer',
    enum: ['owner', 'admin', 'customer', 'deliveryPartner'],
    description: 'Authorization role for subsequent requests',
  })
  role: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['products', 'orders'],
    description: 'Feature flags for `admin` users; omitted for other roles',
  })
  permissions?: string[];
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token; send as Authorization Bearer',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Opaque refresh token for POST /auth/refresh and /auth/logout',
  })
  refreshToken: string;

  @ApiProperty({
    example: 3600,
    description: 'Access token lifetime in seconds',
  })
  expiresIn: number;

  @ApiPropertyOptional({
    type: UserResponseDto,
    description: 'Authenticated principal after login/register completion',
  })
  user?: UserResponseDto;
}

export class OtpSentResponseDto {
  @ApiProperty({ example: true, description: 'True when OTP SMS path was triggered' })
  sent: boolean;

  @ApiProperty({
    example: 'OTP sent to your phone',
    description: 'Human-readable status; client should prompt for OTP and retry register',
  })
  message: string;
}
