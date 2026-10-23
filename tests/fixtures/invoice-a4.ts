import type { InvoiceA4 } from "@/lib/invoice-a4";

/** Invoice A4 pembelian paket yang baru dibayar sebagian (contoh desain invoice A4). */
export const INVOICE_A4: InvoiceA4 = {
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
  number: "TG-2026-0123",
  finalizedAt: new Date("2026-10-22T02:15:00Z"),
  cashierName: "Rina",
  customerName: "Maria Sului",
  medicalRecordNumber: "SDY-2026-0007",
  lines: [
    { name: "Paket Glowing 3 Bulan", quantity: 1, unit: null, unitPrice: 1_200_000, gross: 1_200_000, discount: 0, amount: 1_200_000, note: "4× Facial Brightening, 28 kapsul Slimming Capsule · berlaku s.d. 19 Jan 2027" },
    { name: "Slimming Capsule", quantity: 7, unit: "kapsul", unitPrice: 0, gross: 0, discount: 0, amount: 0, note: "Jatah paket Glowing 3 Bulan" },
  ],
  subtotal: 1_200_000,
  itemDiscount: 0,
  discount: 0,
  total: 1_200_000,
  paid: 500_000,
  balance: 700_000,
  payments: [{ paidAt: "2026-10-22", text: "22 Okt 2026 · Transfer bank ke BCA 1234567890 a.n. SunDY Clinic", amount: 500_000 }],
  status: "DEPOSIT",
  bookingDeposit: 0,
  saldoDeposit: 0,
  depositNotes: [],
  packages: [
    {
      name: "Glowing 3 Bulan",
      expiresOn: "2027-01-19",
      items: [
        { name: "Facial Brightening", unit: null, total: 4, used: 1, remaining: 3 },
        { name: "Slimming Capsule", unit: "kapsul", total: 28, used: 7, remaining: 21 },
      ],
      nextVisitOn: "2026-10-29",
    },
  ],
};
