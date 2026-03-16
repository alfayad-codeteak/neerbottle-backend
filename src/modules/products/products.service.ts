import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List all available products (stock > 0, isActive). Zero-stock hidden per business rules. */
  async findAll() {
    const list = await this.prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 } },
      orderBy: { name: 'asc' },
    });
    return list.map((p) => this.toResponse(p));
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
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }
    return this.toResponse(product);
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
        photoUrl: dto.photoUrl ?? null,
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
        ...(dto.stock != null && { stock: dto.stock }),
        ...(dto.category !== undefined && { category: dto.category || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    return this.toResponse(product);
  }

  private toResponse(p: {
    id: string;
    name: string;
    price: Decimal;
    photoUrl: string | null;
    stock: number;
    category: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      name: p.name,
      price: Number(p.price),
      photoUrl: p.photoUrl,
      stock: p.stock,
      category: p.category,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
