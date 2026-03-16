import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsUrl, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: '20L Water Can' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 100.5, description: 'Price per unit' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  photoUrl?: string;

  @ApiProperty({ example: 50, description: 'Starting stock quantity' })
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ example: '20L Can' })
  @IsOptional()
  @IsString()
  category?: string;
}
