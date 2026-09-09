import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      await this.ensureRuntimeSchema();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Prisma init: ${msg}`);
    }
  }

  /** Cloudflare deploys do not run migrate on boot — keep orderNumber TEXT in sync. */
  private async ensureRuntimeSchema() {
    const run = async (label: string, sql: string) => {
      try {
        await this.$executeRawUnsafe(sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Schema ${label}: ${msg}`);
      }
    };

    await run(
      'DispatchSettings table',
      `CREATE TABLE IF NOT EXISTS "DispatchSettings" (
        "id" TEXT PRIMARY KEY,
        "partnerSelfAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await run(
      'DispatchSettings row',
      `INSERT INTO "DispatchSettings" ("id", "partnerSelfAssignEnabled", "createdAt", "updatedAt")
       VALUES ('default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING`,
    );

    await run('orderNumber add', `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT`);

    await run(
      'orderNumber to text',
      `DO $mig$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Order'
            AND column_name = 'orderNumber'
            AND data_type IN ('integer', 'bigint', 'smallint', 'numeric')
        ) THEN
          ALTER TABLE "Order" ALTER COLUMN "orderNumber" DROP DEFAULT;
          ALTER TABLE "Order" ALTER COLUMN "orderNumber" TYPE TEXT USING "orderNumber"::text;
        END IF;
      END
      $mig$`,
    );

    await run('drop int sequence', `DROP SEQUENCE IF EXISTS "Order_orderNumber_seq"`);

    await run(
      'backfill orderNumber',
      `WITH numbered AS (
        SELECT
          id,
          to_char(("createdAt" AT TIME ZONE 'Asia/Kolkata'), 'DDMMYYYY') AS prefix,
          ROW_NUMBER() OVER (
            PARTITION BY to_char(("createdAt" AT TIME ZONE 'Asia/Kolkata'), 'DDMMYYYY')
            ORDER BY "createdAt" ASC, id ASC
          ) AS seq
        FROM "Order"
        WHERE "orderNumber" IS NULL OR length(btrim("orderNumber")) < 11
      )
      UPDATE "Order" o
      SET "orderNumber" = numbered.prefix || lpad(numbered.seq::text, 3, '0')
      FROM numbered
      WHERE o.id = numbered.id`,
    );

    await run(
      'fill empty orderNumber',
      `UPDATE "Order"
       SET "orderNumber" = replace(id, '_', '')
       WHERE "orderNumber" IS NULL OR btrim("orderNumber") = ''`,
    );

    await run('orderNumber not null', `ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL`);
    await run(
      'orderNumber unique',
      `CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber")`,
    );

    await run(
      'Banner table',
      `CREATE TABLE IF NOT EXISTS "Banner" (
        "id" TEXT PRIMARY KEY,
        "title" TEXT,
        "linkUrl" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "imageMime" TEXT NOT NULL,
        "imageBytes" BYTEA,
        "imageKey" TEXT,
        "imageUrl" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await run(
      'Banner isActive index',
      `CREATE INDEX IF NOT EXISTS "Banner_isActive_idx" ON "Banner"("isActive")`,
    );
    await run(
      'Banner sortOrder index',
      `CREATE INDEX IF NOT EXISTS "Banner_sortOrder_idx" ON "Banner"("sortOrder")`,
    );

    await run(
      'Banner productId',
      `ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "productId" TEXT`,
    );
    await run(
      'Banner productId index',
      `CREATE INDEX IF NOT EXISTS "Banner_productId_idx" ON "Banner"("productId")`,
    );
    await run(
      'Banner imageKey',
      `ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "imageKey" TEXT`,
    );
    await run(
      'Banner imageUrl',
      `ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
    );
    await run(
      'Banner imageBytes nullable',
      `ALTER TABLE "Banner" ALTER COLUMN "imageBytes" DROP NOT NULL`,
    );

    await run(
      'Address lat',
      `ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "lat" DECIMAL(10,7)`,
    );
    await run(
      'Address lng',
      `ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "lng" DECIMAL(10,7)`,
    );

    this.logger.log('Runtime schema check finished');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
