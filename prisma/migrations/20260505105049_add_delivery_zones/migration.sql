-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DECIMAL(10,7) NOT NULL,
    "centerLng" DECIMAL(10,7) NOT NULL,
    "radiusKm" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryZone_isActive_idx" ON "DeliveryZone"("isActive");

-- CreateIndex
CREATE INDEX "DeliveryZone_createdAt_idx" ON "DeliveryZone"("createdAt");
