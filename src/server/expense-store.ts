import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentMonthOf, dueMonths, recurringDate } from "@/lib/expense";
import { dateOnly } from "@/lib/stock";

// Tanpa "use server": pembantu server untuk pengeluaran, tidak dipanggil browser.

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Membuat catatan pengeluaran bulan-bulan yang belum ada untuk templat aktif (spec laporan 5): dari bulan
 * mulai sampai bulan berjalan, atau bulan berakhir bila lebih awal. Aman dipanggil bersamaan dan berulang:
 * keunikan `(recurringId, recurringMonth)` di basis data membuat penyisipan ganda dilewati
 * (`skipDuplicates` = ON CONFLICT DO NOTHING). Catatan yang sudah dibatalkan tidak dibuat lagi.
 * Mengembalikan jumlah catatan baru.
 */
export async function ensureRecurringExpenses(today: string, db: Db = prisma, onlyTemplateId?: string): Promise<number> {
  const month = currentMonthOf(today);
  const templates = await db.recurringExpense.findMany({ where: { isActive: true, ...(onlyTemplateId ? { id: onlyTemplateId } : {}) } });
  let created = 0;
  for (const template of templates) {
    const rows = dueMonths(template, month).map((recurringMonth) => ({
      date: dateOnly(recurringDate(recurringMonth, template.dayOfMonth)),
      categoryId: template.categoryId,
      amount: template.amount,
      note: template.note,
      branchId: template.branchId,
      recurringId: template.id,
      recurringMonth,
      createdById: "sistem",
      createdByName: "Berulang (otomatis)",
    }));
    if (rows.length === 0) continue;
    created += (await db.expense.createMany({ data: rows, skipDuplicates: true })).count;
  }
  return created;
}
