-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SUPER_ADMIN', 'DOKTER', 'TERAPIS', 'RESEPSIONIS');

-- DropTable
-- Doctor hanya berisi data awal (seed), bukan data pasien. Digantikan Staff
-- yang membawa peran, dan seed dijalankan ulang setelah migrasi ini.
DROP TABLE "Doctor";

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "sipNumber" TEXT,
    "specialty" TEXT,
    "photoUrl" TEXT,
    "bio" TEXT,
    "showOnWebsite" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_slug_key" ON "Staff"("slug");

-- CreateIndex
CREATE INDEX "Staff_role_isActive_idx" ON "Staff"("role", "isActive");
