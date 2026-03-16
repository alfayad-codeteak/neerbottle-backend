import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token to invalidate (logout this session)' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
