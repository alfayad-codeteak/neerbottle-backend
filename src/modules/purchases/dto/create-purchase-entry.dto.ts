import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseEntryItemDto {
  @ApiProperty({ description: 'Product SKU id' })
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1, example: 50, description: 'Units purchased (added to stock)' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ minimum: 0, example: 45, description: 'Cost per unit from supplier' })
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseEntryDto {
  @ApiPropertyOptional({ example: 'Aqua Supplies Pvt Ltd' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  supplierName?: string;

  @ApiPropertyOptional({ example: 'INV-2026-0042', description: 'Supplier invoice / bill number' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  referenceNo?: string;

  @ApiPropertyOptional({ example: 'Monthly refill stock' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '2026-07-05T10:00:00.000Z',
    description: 'Purchase date (defaults to now)',
  })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiProperty({ type: [CreatePurchaseEntryItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseEntryItemDto)
  items: CreatePurchaseEntryItemDto[];
}
