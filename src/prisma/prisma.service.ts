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

    this.logger.log('Runtime schema check finished');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
