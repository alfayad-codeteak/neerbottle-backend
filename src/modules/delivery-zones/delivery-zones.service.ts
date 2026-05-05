import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: { name: string; centerLat: number; centerLng: number; radiusKm: number; isActive?: boolean }) {
    return this.prisma.deliveryZone.create({
      data: {
        name: dto.name,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusKm: dto.radiusKm,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllAdmin() {
    return this.prisma.deliveryZone.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOneAdmin(id: string) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zone not found');
    return zone;
  }

  async update(id: string, dto: Partial<{ name: string; centerLat: number; centerLng: number; radiusKm: number; isActive: boolean }>) {
    await this.findOneAdmin(id);
    return this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.centerLat !== undefined ? { centerLat: dto.centerLat } : {}),
        ...(dto.centerLng !== undefined ? { centerLng: dto.centerLng } : {}),
        ...(dto.radiusKm !== undefined ? { radiusKm: dto.radiusKm } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { success: true };
  }

  async checkAvailability(lat: number, lng: number) {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const results = zones.map((z) => {
      const distanceKm = haversineKm(
        { lat, lng },
        { lat: Number(z.centerLat), lng: Number(z.centerLng) },
      );
      const radiusKm = Number(z.radiusKm);
      return {
        id: z.id,
        name: z.name,
        centerLat: Number(z.centerLat),
        centerLng: Number(z.centerLng),
        radiusKm,
        distanceKm,
        isWithin: distanceKm <= radiusKm,
      };
    });

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    const nearest = results[0] ?? null;
    const available = results.some((r) => r.isWithin);

    return {
      available,
      nearest,
      matches: results.filter((r) => r.isWithin),
    };
  }
}

