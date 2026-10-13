-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('AKTIF', 'BERHENTI');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentKind" AS ENUM ('BONUS', 'POTONGAN');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "payrollItemId" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "branchId" TEXT,
    "joinedOn" DATE NOT NULL,
    "nik" TEXT,
    "npwp" TEXT,
    "whatsapp" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankHolder" TEXT,
    "notes" TEXT,
    "baseSalary" INTEGER NOT NULL DEFAULT 0,
    "allowance" INTEGER NOT NULL DEFAULT 0,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'AKTIF',
    "leftOn" DATE,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollItem" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "allowance" INTEGER NOT NULL,
    "amountNote" TEXT,
    "commission" INTEGER NOT NULL DEFAULT 0,
    "treatments" INTEGER NOT NULL DEFAULT 0,
    "bonusTotal" INTEGER NOT NULL DEFAULT 0,
    "deductionTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "paidAt" DATE,
    "paidById" TEXT,
    "paidByName" TEXT,
    "salaryExpenseId" TEXT,
    "commissionExpenseId" TEXT,
    "voidedPayments" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "PayrollAdjustmentKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_staffId_key" ON "Employee"("staffId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_month_key" ON "PayrollPeriod"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_salaryExpenseId_key" ON "PayrollItem"("salaryExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_commissionExpenseId_key" ON "PayrollItem"("commissionExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_periodId_employeeId_key" ON "PayrollItem"("periodId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAdjustment_invoiceLineId_key" ON "PayrollAdjustment"("invoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceLine_performerId_payrollItemId_idx" ON "InvoiceLine"("performerId", "payrollItemId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_salaryExpenseId_fkey" FOREIGN KEY ("salaryExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_commissionExpenseId_fkey" FOREIGN KEY ("commissionExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PayrollItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Penjaga nominal dan status (spec karyawan 2). Tiap ekspresi tidak pernah NULL.
ALTER TABLE "Employee" ADD CONSTRAINT employee_values CHECK (
  "baseSalary" >= 0 AND "allowance" >= 0
  AND (("status" = 'AKTIF' AND "leftOn" IS NULL) OR ("status" = 'BERHENTI' AND "leftOn" IS NOT NULL))
);
ALTER TABLE "PayrollItem" ADD CONSTRAINT payroll_item_values CHECK (
  "baseSalary" >= 0 AND "allowance" >= 0 AND "commission" >= 0 AND "treatments" >= 0
  AND "bonusTotal" >= 0 AND "deductionTotal" >= 0 AND "total" >= 0
  AND (("paidAt" IS NULL) = ("paidById" IS NULL))
);
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT payroll_adjustment_amount CHECK ("amount" > 0);
