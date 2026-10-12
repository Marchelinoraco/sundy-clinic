-- Tautan struk tagihan (spec struk WA bagian 3). Hanya menambah; rilis lama mengabaikannya.
ALTER TABLE "Invoice" ADD COLUMN     "receiptLinkVersion" INTEGER NOT NULL DEFAULT 0;
