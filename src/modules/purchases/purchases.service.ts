import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseEntryDto } from './dto/create-purchase-entry.dto';

const entryInclude = {
  items: { include: { product: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true, phone: true } },
} as const;

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createdById: string, dto: CreatePurchaseEntryDto) {
    const productIds = dto.items.map((i) => i.productId);
    const uniqueIds = Array.from(new Set(productIds));
    const products = await this.prisma.product.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    const missing = uniqueIds.filter((id) => !productMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Products not found: ${missing.join(', ')}`);
    }

    let totalAmount = new Decimal(0);
    const lineItems = dto.items.map((item) => {
      const lineTotal = new Decimal(item.unitCost).mul(item.quantity);
      totalAmount = totalAmount.add(lineTotal);
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitCost: new Decimal(item.unitCost),
      };
    });

    const purchasedAt = dto.purchasedAt ? new Date(dto.purchasedAt) : new Date();

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseEntry.create({
        data: {
          supplierName: dto.supplierName ?? null,
          referenceNo: dto.referenceNo ?? null,
          notes: dto.notes ?? null,
          totalAmount,
          purchasedAt,
          createdById,
          items: { create: lineItems },
        },
        include: entryInclude,
      });

      for (const item of lineItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      return created;
    });

    return this.toResponse(entry);
  }

  async findAllAdmin(filters: {
    dateFrom?: string;
    dateTo?: string;
    supplierName?: string;
    referenceNo?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.supplierName) {
      where.supplierName = { contains: filters.supplierName, mode: 'insensitive' };
    }
    if (filters.referenceNo) {
      where.referenceNo = { contains: filters.referenceNo, mode: 'insensitive' };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.purchasedAt = {};
      if (filters.dateFrom) {
        (where.purchasedAt as Record<string, Date>).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        const d = new Date(filters.dateTo);
        d.setHours(23, 59, 59, 999);
        (where.purchasedAt as Record<string, Date>).lte = d;
      }
    }

    const entries = await this.prisma.purchaseEntry.findMany({
      where,
      include: entryInclude,
      orderBy: { purchasedAt: 'desc' },
    });
    return entries.map((e) => this.toResponse(e));
  }

  async findOneAdmin(id: string) {
    const entry = await this.prisma.purchaseEntry.findUnique({
      where: { id },
      include: entryInclude,
    });
    if (!entry) throw new NotFoundException('Purchase entry not found');
    return this.toResponse(entry);
  }

  private toResponse(entry: {
    id: string;
    supplierName: string | null;
    referenceNo: string | null;
    notes: string | null;
    totalAmount: Decimal;
    purchasedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: { id: string; name: string | null; phone: string } | null;
    items: Array<{
      id: string;
      productId: string;
      quantity: number;
      unitCost: Decimal;
      product: { id: string; name: string };
    }>;
  }) {
    return {
      id: entry.id,
      supplierName: entry.supplierName,
      referenceNo: entry.referenceNo,
      notes: entry.notes,
      totalAmount: Number(entry.totalAmount),
      purchasedAt: entry.purchasedAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      createdBy: entry.createdBy
        ? { id: entry.createdBy.id, name: entry.createdBy.name, phone: entry.createdBy.phone }
        : null,
      items: entry.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product.name,
        quantity: i.quantity,
        unitCost: Number(i.unitCost),
        lineTotal: Number(i.unitCost) * i.quantity,
      })),
    };
  }
}
