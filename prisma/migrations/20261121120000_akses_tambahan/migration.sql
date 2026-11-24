-- CreateTable
CREATE TABLE "StaffCapabilityGrant" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCapabilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffCapabilityGrant_staffId_capability_key" ON "StaffCapabilityGrant"("staffId", "capability");

-- AddForeignKey
ALTER TABLE "StaffCapabilityGrant" ADD CONSTRAINT "StaffCapabilityGrant_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

