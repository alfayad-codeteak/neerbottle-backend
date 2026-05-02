import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      console.warn('Prisma: Could not connect to database. Running without DB. Set DATABASE_URL to enable.');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
