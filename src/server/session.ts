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

/** Akun yang wajib membuat kata sandi sendiri; membawa id sesi yang sedang dipakai (spec kelola staf 4). */
export type PendingPasswordStaff = CurrentStaff & { sessionId: string };

type LoadedStaff = CurrentStaff & { sessionId: string; mustChangePassword: boolean };

/**
 * Staf aktif pemilik sesi ini, atau null. Pengguna tanpa baris Staff yang aktif diperlakukan sebagai belum login:
 * menonaktifkan staf di panel langsung mencabut aksesnya, tanpa menunggu sesinya kedaluwarsa.
 */
async function loadStaff(): Promise<LoadedStaff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, mustChangePassword: true, staff: true },
  });

  if (!user?.staff || !user.staff.isActive) return null;

  return {
    userId: user.id,
    staffId: user.staff.id,
    name: user.staff.name,
    role: user.staff.role,
    email: user.email,
    sessionId: session.session.id,
    mustChangePassword: user.mustChangePassword,
  };
}

const toCurrent = ({ userId, staffId, name, role, email }: LoadedStaff): CurrentStaff => ({ userId, staffId, name, role, email });

/**
 * Mengambil staf yang sedang login, atau null. Akun yang wajib mengganti kata sandi TIDAK dianggap login di sini,
 * sehingga halaman, aksi server, dan rute yang memakai fungsi ini otomatis menolaknya; hanya halaman Ganti kata sandi
 * yang boleh memakai `getPendingPasswordChange`.
 */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const found = await loadStaff();
  if (!found || found.mustChangePassword) return null;
  return toCurrent(found);
}

/** Akun yang wajib mengganti kata sandi (akun baru atau yang baru direset), atau null. */
export async function getPendingPasswordChange(): Promise<PendingPasswordStaff | null> {
  const found = await loadStaff();
  if (!found || !found.mustChangePassword) return null;
  return { ...toCurrent(found), sessionId: found.sessionId };
}

export async function requireStaff(): Promise<CurrentStaff> {
  const found = await loadStaff();
  if (!found) redirect("/masuk");
  if (found.mustChangePassword) redirect("/ganti-kata-sandi");
  return toCurrent(found);
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
