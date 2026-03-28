import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DepositTierDto {
  @ApiProperty({ example: 3, description: 'Minimum can quantity to apply this tier' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minQty: number;

  @ApiProperty({ example: 10, description: 'Discount percentage for this tier' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;
}

export class UpdateDepositConfigDto {
  @ApiPropertyOptional({ example: true, description: 'Enable/disable deposit feature globally' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ example: 50, description: 'Deposit amount per can' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  perCanAmount: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  promoActive?: boolean;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  promoStartsAt?: string;

  @ApiPropertyOptional({ example: '2026-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  promoEndsAt?: string;

  @ApiPropertyOptional({ type: [DepositTierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepositTierDto)
  tiers?: DepositTierDto[];
}
