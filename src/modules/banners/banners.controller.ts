import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/swagger/swagger-response.dto';
import { BannersService } from './banners.service';
import type { Response } from 'express';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  @ApiOperation({ summary: 'Active home banners' })
  @ApiOkResponse({ description: 'Metadata only; fetch imageUrl for the file.' })
  findAll() {
    return this.bannersService.findAllPublic();
  }

  @Get(':id/image')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Banner image bytes' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async stream(@Param('id') id: string, @Res() res: Response) {
    return this.bannersService.sendHttpImage(
      res,
      await this.bannersService.streamImage(id, { activeOnly: true }),
    );
  }
}
