import type { PublicReceipt } from "@/lib/receipt";

/** Struk contoh untuk uji komponen (Task 5, 6, 9). */
export const RECEIPT: PublicReceipt = {
  clinicName: "SunDY Clinic",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret 1, Manado",
  number: "TG-2026-0123",
  finalizedAt: new Date("2026-10-12T10:46:00Z"),
  cashierName: "Mey",
  customerName: "Priscillya Jenitha",
  lines: [{ name: "Paket Lux", quantity: 2, unitPrice: 750_000, amount: 1_500_000 }],
  subtotal: 1_500_000,
  discount: 100_000,
  total: 1_400_000,
  paid: 1_000_000,
  balance: 400_000,
  payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 1_000_000 }],
  status: "SEBAGIAN",
};
