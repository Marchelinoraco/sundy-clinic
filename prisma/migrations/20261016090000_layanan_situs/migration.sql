-- CreateTable
CREATE TABLE "SiteService" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceNote" TEXT,
    "isSignature" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteService_slug_key" ON "SiteService"("slug");

-- CreateIndex
CREATE INDEX "SiteService_categoryId_sortOrder_idx" ON "SiteService"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "SiteService_serviceId_idx" ON "SiteService"("serviceId");

-- CreateIndex
CREATE INDEX "SiteService_isSignature_idx" ON "SiteService"("isSignature");

-- AddForeignKey
ALTER TABLE "SiteService" ADD CONSTRAINT "SiteService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteService" ADD CONSTRAINT "SiteService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Salin katalog situs dari layanan yang ada (spec layanan situs 2.3): situs tampil sama persis sesudah deploy.
-- Id hanya huruf kecil dan angka, cocok dengan pola nama berkas foto layanan.
INSERT INTO "SiteService" ("id", "slug", "name", "description", "imageUrl", "priceNote", "isSignature", "isActive", "sortOrder", "categoryId", "serviceId", "createdAt", "updatedAt")
SELECT 'ss' || md5(random()::text || "id"), "slug", "name", "description", "imageUrl", "priceNote", "isSignature", "isActive", "sortOrder", "categoryId", "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Service"
WHERE "slug" <> 'konsultasi-online';
