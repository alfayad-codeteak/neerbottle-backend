import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdminAdjustDepositDto {
  @ApiProperty({
    example: 100,
    description: 'Amount to credit or return. For return, cannot exceed held deposit.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'Added by admin at counter' })
  @IsOptional()
  @IsString()
  note?: string;
}
