import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { FEATURES, isValidFeature } from '../../common/constants/features';

const SALT_ROUNDS = 10;

@Injectable()
export class OwnerService {
  constructor(private readonly prisma: PrismaService) {}

  private filterPermissions(permissions: string[]): string[] {
    return permissions.filter((p) => isValidFeature(p));
  }

  async createAdmin(dto: CreateAdminDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('User already registered with this phone');
    }
    const permissions = this.filterPermissions(dto.permissions);
    if (permissions.length === 0) {
      throw new BadRequestException('At least one valid permission required. Valid: ' + FEATURES.join(', '));
    }
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        passwordHash,
        role: 'admin',
        permissions: permissions as unknown as object,
      },
    });
    return this.toAdminResponse(user);
  }

  async findAllAdmins() {
    const users = await this.prisma.user.findMany({
      where: { role: 'admin' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });
    return users.map((u) => this.toAdminResponse(u));
  }

  async updateAdmin(id: string, dto: UpdateAdminDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'admin' },
    });
    if (!user) {
      throw new NotFoundException('Admin not found');
    }
    const data: { name?: string; passwordHash?: string; permissions?: string[] } = {};
    if (dto.name != null) data.name = dto.name;
    if (dto.password != null) data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    if (dto.permissions != null) {
      const filtered = this.filterPermissions(dto.permissions);
      if (filtered.length === 0) {
        throw new BadRequestException('At least one valid permission required. Valid: ' + FEATURES.join(', '));
      }
      data.permissions = filtered;
    }
    const updateData: { name?: string; passwordHash?: string; permissions?: object } = {};
    if (data.name != null) updateData.name = data.name;
    if (data.passwordHash != null) updateData.passwordHash = data.passwordHash;
    if (data.permissions != null) updateData.permissions = data.permissions as unknown as object;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    return this.toAdminResponse(updated);
  }

  private toAdminResponse(u: {
    id: string;
    phone: string;
    name: string | null;
    role: string;
    permissions: unknown;
    createdAt: Date;
  }) {
    const permissions = Array.isArray(u.permissions) ? u.permissions : [];
    return {
      id: u.id,
      phone: u.phone,
      name: u.name,
      role: u.role,
      permissions,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
