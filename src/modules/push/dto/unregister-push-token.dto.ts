import { IsString, MinLength } from 'class-validator';

export class UnregisterPushTokenDto {
  @IsString()
  @MinLength(10)
  token: string;
}

