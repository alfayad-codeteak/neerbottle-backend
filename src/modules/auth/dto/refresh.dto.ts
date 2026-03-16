import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token received from login or register' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
