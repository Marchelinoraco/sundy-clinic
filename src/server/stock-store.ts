// Tanpa "use server": pembantu server untuk stok dan hutang, tidak dipanggil browser.

/** Kolom faktur yang dibutuhkan payableSummary (src/lib/stock.ts). */
export const PAYABLE_SELECT = {
  total: true,
  cancelledAt: true,
  dueDate: true,
  payments: { select: { kind: true, amount: true, revokedAt: true } },
  returns: { select: { total: true } },
} as const;
