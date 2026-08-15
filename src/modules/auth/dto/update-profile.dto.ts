import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Rahul Sharma', description: 'Display / account name' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
