-- Kelola kategori layanan (spec kategori layanan): foto kategori (KL9), sakelar pilih sendiri di situs (KL14),
-- nama unik tanpa membedakan huruf besar-kecil (KL3), dan kategori berisi tidak bisa dihapus (KL7).
-- Konstrain relasi dibuang lalu dibuat lagi di berkas yang sama; tidak ada kolom atau tabel yang dihapus.

-- Lebih dulu, supaya nama kembar menggagalkan migrasi sebelum ada perubahan lain. Tidak bisa dinyatakan di schema.prisma.
CREATE UNIQUE INDEX service_category_name_lower ON "ServiceCategory" (lower("name"));

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "SiteService" DROP CONSTRAINT "SiteService_categoryId_fkey";

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "selfBookable" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteService" ADD CONSTRAINT "SiteService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Layanan Slimming tidak ditawarkan untuk dipilih sendiri oleh pasien Aesthetic lama (aturan yang sebelumnya memakai slug).
UPDATE "ServiceCategory" SET "selfBookable" = false WHERE "slug" = 'slimming';
