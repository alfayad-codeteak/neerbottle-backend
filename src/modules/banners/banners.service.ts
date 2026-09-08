import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';

export const BANNER_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type BannerFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const bannerListSelect = {
  id: true,
  title: true,
  linkUrl: true,
  productId: true,
  sortOrder: true,
  isActive: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true } },
} as const;

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function storefrontOrigin(): string {
  return (process.env.STOREFRONT_URL || 'https://neerbottle.in').replace(/\/+$/, '');
}

function productDetailUrl(name: string): string {
  return `${storefrontOrigin()}/product/${slugify(name)}`;
}

type BannerRow = {
  id: string;
  title: string | null;
  linkUrl: string | null;
  productId: string | null;
  sortOrder: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  product: { id: string; name: string } | null;
};

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2StorageService,
  ) {}

  toDto(row: BannerRow, admin: boolean) {
    const productPath = row.product?.name
      ? productDetailUrl(row.product.name)
      : null;
    const stored = row.imageUrl?.trim() ?? '';
    const imageUrl = stored.startsWith('http://') || stored.startsWith('https://')
      ? stored
      : admin
        ? `/api/admin/banners/${row.id}/image`
        : `/api/banners/${row.id}/image`;
    return {
      id: row.id,
      title: row.title,
      linkUrl: productPath ?? row.linkUrl,
      productId: row.productId,
      productName: row.product?.name ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      imageUrl,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findAllPublic() {
    const rows = await this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: bannerListSelect,
    });
    return rows.map((r) => this.toDto(r, false));
  }

  async findAllAdmin() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: bannerListSelect,
    });
    return rows.map((r) => this.toDto(r, true));
  }

  async streamImage(id: string, opts: { activeOnly: boolean }) {
    const row = await this.prisma.banner.findUnique({
      where: { id },
      select: {
        imageBytes: true,
        imageMime: true,
        imageUrl: true,
        isActive: true,
      },
    });
    if (!row) throw new NotFoundException('Banner not found');
    if (opts.activeOnly && !row.isActive) throw new NotFoundException('Banner not found');
    const publicUrl = row.imageUrl?.trim();
    if (publicUrl?.startsWith('http://') || publicUrl?.startsWith('https://')) {
      return { redirectUrl: publicUrl };
    }
    if (!row.imageBytes) throw new NotFoundException('Banner image not found');
    return { buffer: Buffer.from(row.imageBytes), mime: row.imageMime };
  }

  sendHttpImage(
    res: import('express').Response,
    result: { redirectUrl: string } | { buffer: Buffer; mime: string },
  ) {
    if ('redirectUrl' in result) {
      return res.redirect(302, result.redirectUrl);
    }
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', 'inline');
    return res.send(result.buffer);
  }

  async create(fields: Record<string, string | undefined>, file?: BannerFile) {
    if (!file) throw new BadRequestException('Image file is required');
    this.assertFile(file);
    const data = await this.parseFields(fields);
    const uploaded = await this.r2.putBannerImage(file);
    try {
      const row = await this.prisma.banner.create({
        data: {
          title: data.title ?? null,
          linkUrl: data.linkUrl ?? null,
          productId: data.productId ?? null,
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
          imageMime: file.mimetype,
          imageBytes: null,
          imageKey: uploaded.key,
          imageUrl: uploaded.url,
        },
        select: bannerListSelect,
      });
      return this.toDto(row, true);
    } catch (err) {
      await this.r2.deleteObject(uploaded.key);
      throw err;
    }
  }

  async update(id: string, fields: Record<string, string | undefined>, file?: BannerFile) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    if (file) this.assertFile(file);
    const data = await this.parseFields(fields);
    let uploaded: { key: string; url: string } | null = null;
    if (file) uploaded = await this.r2.putBannerImage(file);
    try {
      const row = await this.prisma.banner.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.linkUrl !== undefined ? { linkUrl: data.linkUrl } : {}),
          ...(data.productId !== undefined ? { productId: data.productId } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(uploaded
            ? {
                imageMime: file!.mimetype,
                imageBytes: null,
                imageKey: uploaded.key,
                imageUrl: uploaded.url,
              }
            : {}),
        },
        select: bannerListSelect,
      });
      if (uploaded) await this.r2.deleteObject(existing.imageKey);
      return this.toDto(row, true);
    } catch (err) {
      if (uploaded) await this.r2.deleteObject(uploaded.key);
      throw err;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Banner not found');
    await this.prisma.banner.delete({ where: { id } });
    await this.r2.deleteObject(existing.imageKey);
    return { success: true };
  }

  private assertFile(file: BannerFile) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Use a JPEG, PNG, or WebP image');
    }
    if (file.size > BANNER_MAX_BYTES || file.buffer.length > BANNER_MAX_BYTES) {
      throw new BadRequestException('Image must be 10 MB or smaller');
    }
  }

  private async parseFields(fields: Record<string, string | undefined>) {
    const titleRaw = fields.title?.trim();
    const linkRaw = fields.linkUrl?.trim();
    const sortRaw = fields.sortOrder?.trim();
    const activeRaw = fields.isActive?.trim();
    const productRaw = fields.productId?.trim();

    let title: string | null | undefined;
    if (fields.title !== undefined) title = titleRaw ? titleRaw : null;

    let linkUrl: string | null | undefined;
    if (fields.linkUrl !== undefined) {
      if (!linkRaw) linkUrl = null;
      else if (/^https?:\/\//i.test(linkRaw) || linkRaw.startsWith('/')) {
        linkUrl = linkRaw;
      } else {
        throw new BadRequestException('Link must be an https URL or a path starting with /');
      }
    }

    let productId: string | null | undefined;
    if (fields.productId !== undefined) {
      if (!productRaw || productRaw === 'none') productId = null;
      else {
        const product = await this.prisma.product.findUnique({ where: { id: productRaw } });
        if (!product) throw new BadRequestException('Product not found');
        productId = productRaw;
      }
    }

    let sortOrder: number | undefined;
    if (sortRaw !== undefined && sortRaw !== '') {
      const n = Number(sortRaw);
      if (!Number.isInteger(n)) throw new BadRequestException('sortOrder must be an integer');
      sortOrder = n;
    }

    let isActive: boolean | undefined;
    if (activeRaw !== undefined && activeRaw !== '') {
      isActive = activeRaw === 'true' || activeRaw === '1' || activeRaw === 'on';
    }

    return { title, linkUrl, productId, sortOrder, isActive };
  }
}
