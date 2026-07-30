import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsUrl, Min, MinLength, IsArray, IsBoolean } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: '20L Water Can' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({
    example: 100.5,
    description: 'Sale price per unit (alias of salePrice; one of price or salePrice is required)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    example: 100.5,
    description: 'Sale price per unit (preferred over price when both are sent)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ example: 120, description: 'Maximum retail price (display / compare)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ example: 5, description: 'Per-unit handling fee (catalog field; default 0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  handlingFee?: number;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://example.com/photo-1.jpg', 'https://example.com/photo-2.jpg'],
    description: 'Multiple product images',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUrl({}, { each: true })
  photoUrls?: string[];

  @ApiProperty({ example: 50, description: 'Starting stock quantity' })
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ example: '20L Can' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'When false, this product does not add per-can deposit on orders',
  })
  @IsOptional()
  @IsBoolean()
  hasDeposit?: boolean;
}
