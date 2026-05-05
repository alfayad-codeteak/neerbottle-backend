import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsIn(['android', 'ios', 'web'])
  platform: 'android' | 'ios' | 'web';

  @IsOptional()
  @IsString()
  deviceId?: string;
}

