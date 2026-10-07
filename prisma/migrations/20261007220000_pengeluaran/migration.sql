-- Pengeluaran dan laporan untung-rugi (sub-proyek keuangan 4).
-- Spec: docs/superpowers/specs/2026-10-07-pengeluaran-laporan-untung-rugi-design.md bagian 4.
-- Migrasi ini hanya menambah: tabel, CHECK, indeks unik, dan kategori bawaan.


-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "branchId" TEXT,
    "recurringId" TEXT,
    "recurringMonth" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedByName" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "branchId" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringId_recurringMonth_key" ON "Expense"("recurringId", "recurringMonth");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Penjagaan nilai di basis data (spec laporan 4).
CREATE UNIQUE INDEX expense_category_name_lower ON "ExpenseCategory" (lower("name"));

ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_positive CHECK ("amount" > 0);

ALTER TABLE "Expense" ADD CONSTRAINT expense_void_fields CHECK (
  ("voidedAt" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
);

ALTER TABLE "RecurringExpense" ADD CONSTRAINT recurring_expense_values CHECK (
  "amount" > 0 AND "dayOfMonth" BETWEEN 1 AND 28 AND ("endMonth" IS NULL OR "endMonth" >= "startMonth")
);

-- Kategori bawaan (spec laporan 4.1).
INSERT INTO "ExpenseCategory" ("id", "name", "sortOrder") VALUES
  ('kat-gaji', 'Gaji', 1),
  ('kat-sewa', 'Sewa', 2),
  ('kat-listrik-air', 'Listrik dan air', 3),
  ('kat-internet-telepon', 'Internet dan telepon', 4),
  ('kat-perlengkapan', 'Perlengkapan', 5),
  ('kat-pemasaran', 'Pemasaran', 6),
  ('kat-lain-lain', 'Lain-lain', 7);
