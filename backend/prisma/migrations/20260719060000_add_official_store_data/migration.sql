-- AlterTable
ALTER TABLE "Store"
ADD COLUMN "brand" TEXT NOT NULL DEFAULT '메가MGC커피',
ADD COLUMN "district" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "externalId" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- Remove the original screen-only sample stores when they are not referenced.
DELETE FROM "Store"
WHERE "address" IN (
  '서울 강남구 강남대로 1',
  '서울 마포구 양화로 1',
  '부산 금정구 부산대학로 1'
)
AND NOT EXISTS (SELECT 1 FROM "Post" WHERE "Post"."storeId" = "Store"."id");

-- CreateIndex
CREATE UNIQUE INDEX "Store_externalId_key" ON "Store"("externalId");
CREATE INDEX "Store_district_idx" ON "Store"("district");
CREATE INDEX "Store_isActive_region_name_idx" ON "Store"("isActive", "region", "name");
