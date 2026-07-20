-- AlterTable
ALTER TABLE "Participation"
ADD COLUMN "pickupStoreId" TEXT,
ADD COLUMN "menuId" TEXT,
ADD COLUMN "menu" TEXT;

-- CreateIndex
CREATE INDEX "Participation_pickupStoreId_idx" ON "Participation"("pickupStoreId");
CREATE INDEX "Participation_menuId_idx" ON "Participation"("menuId");

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_pickupStoreId_fkey" FOREIGN KEY ("pickupStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;
