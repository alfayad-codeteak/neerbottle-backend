import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto';
import { UpdateMyDeliveryPartnerDto } from './dto/update-my-delivery-partner.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class DeliveryPartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDeliveryPartnerDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        passwordHash,
        role: 'deliveryPartner',
      },
    });
    const partner = await this.prisma.deliveryPartner.create({
      data: {
        userId: user.id,
        name: dto.name,
        phone: dto.phone,
        vehicleType: dto.vehicleType ?? null,
        vehicleNumber: dto.vehicleNumber ?? null,
      },
    });
    return this.toResponse(partner);
  }

  async findAll() {
    const list = await this.prisma.deliveryPartner.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return list.map((p) => this.toResponse(p));
  }

  async findOne(id: string) {
    const p = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Delivery partner not found');
    return this.toResponse(p);
  }

  async update(id: string, dto: UpdateDeliveryPartnerDto) {
    const existing = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery partner not found');
    const partner = await this.prisma.deliveryPartner.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType || null }),
        ...(dto.vehicleNumber !== undefined && { vehicleNumber: dto.vehicleNumber || null }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.currentLat !== undefined && { currentLat: dto.currentLat }),
        ...(dto.currentLng !== undefined && { currentLng: dto.currentLng }),
      },
    });
    if (dto.name != null) {
      await this.prisma.user.update({
        where: { id: partner.userId },
        data: { name: dto.name },
      });
    }
    return this.toResponse(partner);
  }

  async remove(id: string) {
    const existing = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery partner not found');
    await this.prisma.user.delete({ where: { id: existing.userId } });
    return { success: true, id };
  }

  async getProfileByUserId(userId: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { userId },
    });
    if (!partner) throw new NotFoundException('Delivery partner profile not found');
    return this.toResponse(partner);
  }

  async updateMyProfile(userId: string, dto: UpdateMyDeliveryPartnerDto) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { userId },
    });
    if (!partner) throw new NotFoundException('Delivery partner profile not found');
    if (dto.isAvailable === false && partner.isAvailable) {
      const assigned = await this.prisma.order.count({
        where: {
          deliveryPartnerId: partner.id,
          deliveryStatus: { in: ['ASSIGNED', 'PICKED_UP', 'DELIVERED'] },
        },
      });
      if (assigned > 0) {
        throw new BadRequestException('Finish or hand off active deliveries before going offline');
      }
    }
    const updated = await this.prisma.deliveryPartner.update({
      where: { userId },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType || null }),
        ...(dto.vehicleNumber !== undefined && { vehicleNumber: dto.vehicleNumber || null }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.currentLat !== undefined && { currentLat: dto.currentLat }),
        ...(dto.currentLng !== undefined && { currentLng: dto.currentLng }),
      },
    });
    if (dto.name != null) {
      await this.prisma.user.update({ where: { id: userId }, data: { name: dto.name } });
    }
    return this.toResponse(updated);
  }

  private toResponse(p: {
    id: string;
    userId: string;
    name: string;
    phone: string;
    vehicleType: string | null;
    vehicleNumber: string | null;
    isAvailable: boolean;
    currentLat: { toString(): string } | null;
    currentLng: { toString(): string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      phone: p.phone,
      vehicleType: p.vehicleType,
      vehicleNumber: p.vehicleNumber,
      isAvailable: p.isAvailable,
      currentLat: p.currentLat != null ? Number(p.currentLat) : null,
      currentLng: p.currentLng != null ? Number(p.currentLng) : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
