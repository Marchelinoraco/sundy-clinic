import type { ApprovalInput } from "@/lib/approval";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const TEST_APPROVER_NAME = "Penyetuju Uji";
const SLUG = "penyetuju-uji";
const PIN = "135790";

/**
 * Admin Keuangan uji yang punya PIN (spec PIN P7), untuk tindakan tagihan yang kini menuntut persetujuan. Dibuat ulang
 * bila hilang (uji lain bisa menghapus semua staf), dan hitungan salah/kunci dikembalikan bersih setiap dipanggil.
 */
export async function testApproval(): Promise<ApprovalInput> {
  const staff = await prisma.staff.upsert({
    where: { slug: SLUG },
    update: { isActive: true, role: "ADMIN_KEUANGAN", name: TEST_APPROVER_NAME },
    create: { slug: SLUG, name: TEST_APPROVER_NAME, role: "ADMIN_KEUANGAN" },
  });
  const existing = await prisma.approvalPin.findUnique({ where: { staffId: staff.id } });
  if (existing) {
    await prisma.approvalPin.update({ where: { staffId: staff.id }, data: { failedCount: 0, lockedUntil: null } });
  } else {
    const pinHash = await (await auth.$context).password.hash(PIN);
    await prisma.approvalPin.create({ data: { staffId: staff.id, pinHash } });
  }
  return { approverId: staff.id, pin: PIN };
}
