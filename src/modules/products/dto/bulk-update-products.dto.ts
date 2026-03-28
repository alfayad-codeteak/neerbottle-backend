import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class BulkUpdateProductItemDto {
  @ApiProperty({ description: 'Product id' })
  @IsString()
  id: string;

  @ApiProperty({ example: 120.5, description: 'New price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

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
