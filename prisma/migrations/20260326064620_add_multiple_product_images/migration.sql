-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
