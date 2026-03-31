-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "ifCanRefund" BOOLEAN NOT NULL DEFAULT false;
