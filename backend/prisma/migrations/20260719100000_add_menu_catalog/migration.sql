-- CreateEnum
CREATE TYPE "MenuCategory" AS ENUM ('DRINK', 'FOOD', 'PRODUCT');

-- CreateEnum
CREATE TYPE "MenuAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '메가MGC커피',
    "name" TEXT NOT NULL,
    "englishName" TEXT,
    "category" "MenuCategory" NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'NONE',
    "description" TEXT,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreMenu" (
    "storeId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "availability" "MenuAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreMenu_pkey" PRIMARY KEY ("storeId", "menuId")
);

-- AlterTable
ALTER TABLE "PurchaseRequest"
ADD COLUMN "storeId" TEXT,
ADD COLUMN "menuId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Menu_externalId_key" ON "Menu"("externalId");
CREATE UNIQUE INDEX "Menu_brand_category_name_variant_key" ON "Menu"("brand", "category", "name", "variant");
CREATE INDEX "Menu_isActive_category_name_idx" ON "Menu"("isActive", "category", "name");
CREATE INDEX "Menu_name_idx" ON "Menu"("name");
CREATE INDEX "StoreMenu_menuId_availability_idx" ON "StoreMenu"("menuId", "availability");
CREATE INDEX "StoreMenu_storeId_availability_idx" ON "StoreMenu"("storeId", "availability");
CREATE INDEX "StoreMenu_verifiedById_idx" ON "StoreMenu"("verifiedById");
CREATE INDEX "PurchaseRequest_storeId_idx" ON "PurchaseRequest"("storeId");
CREATE INDEX "PurchaseRequest_menuId_idx" ON "PurchaseRequest"("menuId");

-- AddForeignKey
ALTER TABLE "StoreMenu" ADD CONSTRAINT "StoreMenu_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreMenu" ADD CONSTRAINT "StoreMenu_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreMenu" ADD CONSTRAINT "StoreMenu_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;
