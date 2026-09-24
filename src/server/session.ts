import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import type { StaffRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Capability } from "@/lib/permissions";

export type CurrentStaff = {
  userId: string;
  staffId: string;
  name: string;
  role: StaffRole;
  email: string;
};

/**
 * Mengambil staf yang sedang login, atau null.
 *
 * Pengguna tanpa baris Staff yang aktif diperlakukan sebagai belum login.
 * Menonaktifkan staf di panel karena itu langsung mencabut aksesnya, tanpa
 * perlu menghapus akunnya atau menunggu sesinya kedaluwarsa.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, staff: true },
  });

  if (!user?.staff || !user.staff.isActive) return null;

  return {
    userId: user.id,
    staffId: user.staff.id,
    name: user.staff.name,
    role: user.staff.role,
    email: user.email,
  };
}

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/masuk");
  return staff;
}

/**
 * Dipanggil di awal setiap halaman admin dan setiap server action.
 * Menyembunyikan tombol di antarmuka bukan kontrol akses; ini kontrolnya.
 */
export async function requireCapability(capability: Capability): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!can(staff.role, capability)) forbidden();
  return staff;
}
