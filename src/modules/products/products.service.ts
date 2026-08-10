import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
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
    const [depositConfig, list] = await Promise.all([
      this.depositsService.getRuntimeConfig(),
      this.prisma.product.findMany({
        where: { isActive: true, stock: { gt: 0 } },
        orderBy: { name: 'asc' },
      }),
    ]);
    const depositPerCan = depositConfig.enabled ? depositConfig.perCanAmount : 0;
    return list.map((p) => this.toResponse(p, depositPerCan, depositConfig.enabled));
  }

  /** Admin: list all products including inactive and zero-stock (full status). */
  async findAllAdmin() {
    const [ctx, list] = await Promise.all([
      this.depositContext(),
      this.prisma.product.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return list.map((p) => this.toResponse(p, ctx.depositPerCan, ctx.depositsGloballyEnabled));
  }

  /** Get one product by id. Returns 404 if not found or not available (inactive/zero stock). */
  async findOne(id: string) {
    const [depositConfig, product] = await Promise.all([
      this.depositsService.getRuntimeConfig(),
      this.prisma.product.findUnique({ where: { id } }),
    ]);
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }
    const depositPerCan = depositConfig.enabled ? depositConfig.perCanAmount : 0;
    return this.toResponse(product, depositPerCan, depositConfig.enabled);
  }

  /** Admin: get one product by id (includes inactive). */
  async findOneAdmin(id: string) {
    const [ctx, product] = await Promise.all([
      this.depositContext(),
      this.prisma.product.findUnique({ where: { id } }),
    ]);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.toResponse(product, ctx.depositPerCan, ctx.depositsGloballyEnabled);
  }

  /** Admin: create product */
  async create(dto: CreateProductDto) {
    const salePrice = dto.salePrice ?? dto.price;
    if (salePrice == null) {
      throw new BadRequestException('Either salePrice or price is required');
    }
    // Run deposit config + insert in parallel (deposit only needed for response shaping).
    const [ctx, product] = await Promise.all([
      this.depositContext(),
      this.prisma.product.create({
        data: {
          name: dto.name,
          price: new Decimal(salePrice),
          mrp: dto.mrp != null ? new Decimal(dto.mrp) : null,
          handlingFee: new Decimal(dto.handlingFee ?? 0),
          photoUrl: dto.photoUrl ?? dto.photoUrls?.[0] ?? null,
          photoUrls: dto.photoUrls ?? (dto.photoUrl ? [dto.photoUrl] : []),
          stock: dto.stock,
          category: dto.category ?? null,
          hasDeposit: dto.hasDeposit ?? true,
        },
      }),
    ]);
    return this.toResponse(product, ctx.depositPerCan, ctx.depositsGloballyEnabled);
  }

  /** Admin: update product */
  async update(id: string, dto: UpdateProductDto) {
    const salePrice = dto.salePrice ?? dto.price;
    const data = {
      ...(dto.name != null && { name: dto.name }),
      ...(salePrice != null && { price: new Decimal(salePrice) }),
      ...(dto.mrp !== undefined && { mrp: dto.mrp == null ? null : new Decimal(dto.mrp) }),
      ...(dto.handlingFee != null && { handlingFee: new Decimal(dto.handlingFee) }),
      ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl || null }),
      ...(dto.photoUrls !== undefined && { photoUrls: dto.photoUrls }),
      ...(dto.photoUrls !== undefined && dto.photoUrl === undefined && { photoUrl: dto.photoUrls[0] ?? null }),
      ...(dto.stock != null && { stock: dto.stock }),
      ...(dto.category !== undefined && { category: dto.category || null }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.hasDeposit !== undefined && { hasDeposit: dto.hasDeposit }),
    };

    try {
      // Skip extra findUnique — one write RTT instead of read+write.
      const [ctx, product] = await Promise.all([
        this.depositContext(),
        this.prisma.product.update({ where: { id }, data }),
      ]);
      return this.toResponse(product, ctx.depositPerCan, ctx.depositsGloballyEnabled);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Product not found');
      }
      throw err;
    }
  }

  /** Admin: bulk update product price and stock */
  async bulkUpdatePriceAndStock(dto: BulkUpdateProductsDto) {
    const ids = dto.items.map((i) => i.id);
    const uniqueIds = Array.from(new Set(ids));

    const [ctx, existing] = await Promise.all([
      this.depositContext(),
      this.prisma.product.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      }),
    ]);
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
            ...(item.mrp !== undefined && { mrp: item.mrp == null ? null : new Decimal(item.mrp) }),
            ...(item.handlingFee != null && { handlingFee: new Decimal(item.handlingFee) }),
          },
        }),
      ),
    );

    return {
      count: updated.length,
      products: updated.map((p) =>
        this.toResponse(p, ctx.depositPerCan, ctx.depositsGloballyEnabled),
      ),
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

  private async depositContext() {
    const depositConfig = await this.depositsService.getRuntimeConfig();
    return {
      depositPerCan: depositConfig.enabled ? Number(depositConfig.perCanAmount) : 0,
      depositsGloballyEnabled: depositConfig.enabled,
    };
  }

  private toResponse(
    p: {
      id: string;
      name: string;
      price: Decimal;
      mrp: Decimal | null;
      handlingFee: Decimal;
      photoUrl: string | null;
      photoUrls: string[];
      stock: number;
      category: string | null;
      isActive: boolean;
      hasDeposit: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    depositPerCan = 0,
    depositsGloballyEnabled = false,
  ) {
    const price = Number(p.price);
    const mrp = p.mrp != null ? Number(p.mrp) : null;
    const handlingFee = Number(p.handlingFee ?? 0);
    const appliesDeposit = p.hasDeposit !== false && depositsGloballyEnabled;
    const effectiveDepositPerCan = appliesDeposit ? depositPerCan : 0;
    return {
      id: p.id,
      name: p.name,
      price,
      salePrice: price,
      mrp,
      handlingFee,
      hasDeposit: p.hasDeposit !== false,
      depositPerCan: effectiveDepositPerCan,
      orderValuePerCan: price + effectiveDepositPerCan,
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
