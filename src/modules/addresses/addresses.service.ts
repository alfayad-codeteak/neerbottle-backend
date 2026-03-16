import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const list = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return list.map((a) => this.toResponse(a));
  }

  async create(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }
    const address = await this.prisma.address.create({
      data: {
        userId,
        label: dto.label ?? null,
        line1: dto.line1,
        line2: dto.line2 ?? null,
        city: dto.city,
        state: dto.state ?? null,
        pincode: dto.pincode ?? null,
        phone: dto.phone ?? null,
        isDefault: dto.isDefault ?? false,
      },
    });
    return this.toResponse(address);
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    if (dto.isDefault === true) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }
    const updated = await this.prisma.address.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label || null }),
        ...(dto.line1 != null && { line1: dto.line1 }),
        ...(dto.line2 !== undefined && { line2: dto.line2 || null }),
        ...(dto.city != null && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state || null }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode || null }),
        ...(dto.phone !== undefined && { phone: dto.phone || null }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
    return this.toResponse(updated);
  }

  private toResponse(a: {
    id: string;
    userId: string;
    label: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string | null;
    pincode: string | null;
    phone: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: a.id,
      label: a.label,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      phone: a.phone,
      isDefault: a.isDefault,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}
