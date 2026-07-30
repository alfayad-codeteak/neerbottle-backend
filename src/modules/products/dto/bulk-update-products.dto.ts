import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkUpdateProductItemDto {
  @ApiProperty({ description: 'Product id' })
  @IsString()
  id: string;

  @ApiProperty({ example: 120.5, description: 'New sale price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 140, description: 'New MRP' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ example: 5, description: 'New handling fee' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  handlingFee?: number;

  @ApiProperty({ example: 50, description: 'New stock quantity' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock: number;
}

export class BulkUpdateProductsDto {
  @ApiProperty({ type: [BulkUpdateProductItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateProductItemDto)
  items: BulkUpdateProductItemDto[];
}
