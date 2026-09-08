import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ApiErrorResponseDto } from '../../common/swagger/swagger-response.dto';
import {
  BANNER_MAX_BYTES,
  BannersService,
  type BannerFile,
} from './banners.service';
import type { Request, Response } from 'express';

const upload = FileInterceptor('file', {
  limits: { fileSize: BANNER_MAX_BYTES },
});

@ApiTags('Admin – Banners')
@Controller('admin/banners')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminBannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  @ApiOperation({ summary: 'List all banners' })
  @ApiOkResponse({ description: 'Metadata + admin image URLs.' })
  findAll() {
    return this.bannersService.findAllAdmin();
  }

  @Get(':id/image')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async stream(@Param('id') id: string, @Res() res: Response) {
    return this.bannersService.sendHttpImage(
      res,
      await this.bannersService.streamImage(id, { activeOnly: false }),
    );
  }

  @Post()
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        linkUrl: { type: 'string' },
        sortOrder: { type: 'string' },
        isActive: { type: 'string' },
      },
    },
  })
  create(
    @UploadedFile() file: BannerFile | undefined,
    @Req() req: Request,
  ) {
    return this.bannersService.create(stringFields(req.body), file);
  }

  @Patch(':id')
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @UploadedFile() file: BannerFile | undefined,
    @Req() req: Request,
  ) {
    return this.bannersService.update(id, stringFields(req.body), file);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}

function stringFields(body: unknown): Record<string, string | undefined> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
}
