-- PIN persetujuan (spec PIN P1–P11). Hanya menambah.
CREATE TABLE "ApprovalPin" (
    "staffId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "ApprovalPin_staffId_key" ON "ApprovalPin"("staffId");

ALTER TABLE "ApprovalPin" ADD CONSTRAINT "ApprovalPin_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD COLUMN "discountApprovedById" TEXT,
ADD COLUMN "discountApprovedByName" TEXT,
ADD COLUMN "cancelApprovedById" TEXT,
ADD COLUMN "cancelApprovedByName" TEXT;

ALTER TABLE "InvoiceLine" ADD COLUMN "priceApprovedById" TEXT,
ADD COLUMN "priceApprovedByName" TEXT,
ADD COLUMN "discountApprovedById" TEXT,
ADD COLUMN "discountApprovedByName" TEXT;
