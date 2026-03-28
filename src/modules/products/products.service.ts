import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkUpdateProductsDto } from './dto/bulk-update-products.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { DepositsService } from '../deposits/deposits.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly depositsService: DepositsService,
  ) {}

  /** List all available products (stock > 0, isActive). Zero-stock hidden per business rules. */
  async findAll() {
    const depositConfig = await this.depositsService.getRuntimeConfig();
    const depositPerCan = depositConfig.enabled ? depositConfig.perCanAmount : 0;
    const list = await this.prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 } },
      orderBy: { name: 'asc' },
    });
    return list.map((p) => this.toResponse(p, depositPerCan));
  }

  /** Admin: list all products including inactive and zero-stock (full status). */
  async findAllAdmin() {
    const list = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
    });
    return list.map((p) => this.toResponse(p));
  }

  /** Get one product by id. Returns 404 if not found or not available (inactive/zero stock). */
  async findOne(id: string) {
    const depositConfig = await this.depositsService.getRuntimeConfig();
    const depositPerCan = depositConfig.enabled ? depositConfig.perCanAmount : 0;
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }
    return this.toResponse(product, depositPerCan);
  }

  /** Admin: get one product by id (includes inactive). */
  async findOneAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.toResponse(product);
  }

  /** Admin: create product */
  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        price: new Decimal(dto.price),
        photoUrl: dto.photoUrl ?? dto.photoUrls?.[0] ?? null,
        photoUrls: dto.photoUrls ?? (dto.photoUrl ? [dto.photoUrl] : []),
        stock: dto.stock,
        category: dto.category ?? null,
      },
    });
    return this.toResponse(product);
  }

  /** Admin: update product */
  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.price != null && { price: new Decimal(dto.price) }),
        ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl || null }),
        ...(dto.photoUrls !== undefined && { photoUrls: dto.photoUrls }),
        ...(dto.photoUrls !== undefined && dto.photoUrl === undefined && { photoUrl: dto.photoUrls[0] ?? null }),
        ...(dto.stock != null && { stock: dto.stock }),
        ...(dto.category !== undefined && { category: dto.category || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    return this.toResponse(product);
  }

  /** Admin: bulk update product price and stock */
  async bulkUpdatePriceAndStock(dto: BulkUpdateProductsDto) {
    const ids = dto.items.map((i) => i.id);
    const uniqueIds = Array.from(new Set(ids));

    const existing = await this.prisma.product.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));
    const missingIds = uniqueIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(`Products not found: ${missingIds.join(', ')}`);
    }

    const updated = await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.product.update({
          where: { id: item.id },
          data: {
            price: new Decimal(item.price),
            stock: item.stock,
          },
        }),
      ),
    );

    return {
      count: updated.length,
      products: updated.map((p) => this.toResponse(p)),
    };
  }

  /** Admin: delete one product */
  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    if (existing._count.orderItems > 0) {
      // Keep historical order integrity by preventing hard delete once ordered.
      throw new NotFoundException('Product cannot be deleted because it is already used in orders');
    }

    await this.prisma.product.delete({ where: { id } });
    return { success: true, id };
  }

  private toResponse(p: {
    id: string;
    name: string;
    price: Decimal;
    photoUrl: string | null;
    photoUrls: string[];
    stock: number;
    category: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }, depositPerCan = 0) {
    const price = Number(p.price);
    return {
      id: p.id,
      name: p.name,
      price,
      depositPerCan,
      orderValuePerCan: price + depositPerCan,
      photoUrl: p.photoUrl,
      photoUrls: Array.isArray(p.photoUrls) ? p.photoUrls : [],
      stock: p.stock,
      category: p.category,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
