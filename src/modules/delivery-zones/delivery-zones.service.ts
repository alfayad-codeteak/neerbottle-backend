import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  private activeZonesCache: { expiresAt: number; rows: Awaited<ReturnType<PrismaService['deliveryZone']['findMany']>> } | null =
    null;
  private static readonly ZONES_TTL_MS = 20_000;

  private invalidateZoneCache() {
    this.activeZonesCache = null;
  }

  private async loadActiveZones() {
    const now = Date.now();
    if (this.activeZonesCache && this.activeZonesCache.expiresAt > now) {
      return this.activeZonesCache.rows;
    }
    const rows = await this.prisma.deliveryZone.findMany({ where: { isActive: true } });
    this.activeZonesCache = { rows, expiresAt: now + DeliveryZonesService.ZONES_TTL_MS };
    return rows;
  }

  async create(dto: { name: string; centerLat: number; centerLng: number; radiusKm: number; isActive?: boolean }) {
    const zone = await this.prisma.deliveryZone.create({
      data: {
        name: dto.name,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusKm: dto.radiusKm,
        isActive: dto.isActive ?? true,
      },
    });
    this.invalidateZoneCache();
    return this.toZone(zone);
  }

  async findAllAdmin() {
    const rows = await this.prisma.deliveryZone.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((z) => this.toZone(z));
  }

  async findAllPublic() {
    const rows = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((z) => this.toZone(z));
  }

  async findOneAdmin(id: string) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zone not found');
    return this.toZone(zone);
  }

  async update(id: string, dto: Partial<{ name: string; centerLat: number; centerLng: number; radiusKm: number; isActive: boolean }>) {
    await this.findOneAdmin(id);
    const zone = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.centerLat !== undefined ? { centerLat: dto.centerLat } : {}),
        ...(dto.centerLng !== undefined ? { centerLng: dto.centerLng } : {}),
        ...(dto.radiusKm !== undefined ? { radiusKm: dto.radiusKm } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    this.invalidateZoneCache();
    return this.toZone(zone);
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.deliveryZone.delete({ where: { id } });
    this.invalidateZoneCache();
    return { success: true };
  }

  async checkAvailability(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('lat and lng are required');
    }
    const zones = await this.loadActiveZones();

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
      configured: zones.length > 0,
    };
  }

  /**
   * When at least one active zone exists, the pin must fall inside a circle.
   * With no zones configured, delivery is not restricted.
   */
  async assertLocationServed(lat: number | null | undefined, lng: number | null | undefined) {
    const zones = await this.loadActiveZones();
    if (zones.length === 0) return;

    if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      throw new BadRequestException(
        'Pin this address on the map. We only deliver inside marked zones.',
      );
    }

    const pin = { lat: Number(lat), lng: Number(lng) };
    const inside = zones.some((z) => {
      const distanceKm = haversineKm(pin, {
        lat: Number(z.centerLat),
        lng: Number(z.centerLng),
      });
      return distanceKm <= Number(z.radiusKm);
    });
    if (!inside) {
      throw new BadRequestException(
        'This location is outside our delivery area. Move the pin into a marked zone.',
      );
    }
  }

  private toZone(z: {
    id: string;
    name: string;
    centerLat: unknown;
    centerLng: unknown;
    radiusKm: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: z.id,
      name: z.name,
      centerLat: Number(z.centerLat),
      centerLng: Number(z.centerLng),
      radiusKm: Number(z.radiusKm),
      isActive: z.isActive,
      createdAt: z.createdAt.toISOString(),
      updatedAt: z.updatedAt.toISOString(),
    };
  }
}

