-- Indeks untuk laporan untung-rugi (tinjauan akhir): saringan tanggal final dan tanggal bayar.
-- Migrasi hanya menambah indeks.

-- CreateIndex
CREATE INDEX "Invoice_status_finalizedAt_idx" ON "Invoice"("status", "finalizedAt");

-- CreateIndex
CREATE INDEX "InvoicePayment_paidAt_idx" ON "InvoicePayment"("paidAt");

-- CreateIndex
CREATE INDEX "SupplierPayment_paidAt_idx" ON "SupplierPayment"("paidAt");

