import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsUrl, IsBoolean, Min, MinLength, IsArray } from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: '20L Water Can' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 100.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://example.com/photo-1.jpg', 'https://example.com/photo-2.jpg'],
    description: 'Replace product image list',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUrl({}, { each: true })
  photoUrls?: string[];

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: '20L Can' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: true, description: 'Hide/show product' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
