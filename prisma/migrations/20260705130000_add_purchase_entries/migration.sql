-- CreateTable
CREATE TABLE "PurchaseEntry" (
    "id" TEXT NOT NULL,
    "supplierName" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseEntryItem" (
    "id" TEXT NOT NULL,
    "purchaseEntryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseEntryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseEntry_purchasedAt_idx" ON "PurchaseEntry"("purchasedAt");

-- CreateIndex
CREATE INDEX "PurchaseEntry_createdAt_idx" ON "PurchaseEntry"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseEntryItem_purchaseEntryId_idx" ON "PurchaseEntryItem"("purchaseEntryId");

-- CreateIndex
CREATE INDEX "PurchaseEntryItem_productId_idx" ON "PurchaseEntryItem"("productId");

-- AddForeignKey
ALTER TABLE "PurchaseEntry" ADD CONSTRAINT "PurchaseEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntryItem" ADD CONSTRAINT "PurchaseEntryItem_purchaseEntryId_fkey" FOREIGN KEY ("purchaseEntryId") REFERENCES "PurchaseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntryItem" ADD CONSTRAINT "PurchaseEntryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
