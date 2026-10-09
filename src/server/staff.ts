"use server";

import type { Prisma, StaffRole } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { slugify } from "@/lib/slug";
import { roleCanHaveLogin, staffChangeBlock, validateLoginEmail, validateStaffName } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL, isStaffRole } from "@/lib/staff-role";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";
import { generateTempPassword } from "@/server/temp-password";

export type StaffRow = {
  id: string;
  name: string;
  role: StaffRole;
  showOnWebsite: boolean;
  isActive: boolean;
  email: string | null;
  mustChangePassword: boolean;
};

/** Kata sandi sementara hanya dikembalikan ke browser pemilik; tidak pernah disimpan, dicatat, atau dimasukkan ke audit. */
export type Credentials = { email: string; tempPassword: string };

/**
 * Slug yang belum dipakai staf lain.
 *
 * Berkas ini menyandang "use server", sehingga setiap ekspornya WAJIB berupa
 * fungsi async — Next.js menolak ekspor sinkron dari server action. Karena itu
 * `slugify` yang murni tinggal di src/lib/slug.ts, bukan di sini.
 */
export async function uniqueStaffSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await prisma.staff.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

function revalidateStaff() {
  safeRevalidatePath("/admin/staf");
  safeRevalidatePath("/tentang");
}

export async function listStaffAccounts(): Promise<StaffRow[]> {
  await requireCapability("staff:manage");
  const rows = await prisma.staff.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { user: { select: { email: true, mustChangePassword: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    showOnWebsite: row.showOnWebsite,
    isActive: row.isActive,
    email: row.user?.email ?? null,
    mustChangePassword: row.user?.mustChangePassword ?? false,
  }));
}

const NOT_FOUND = "Staf tidak ditemukan.";
const EMAIL_TAKEN = "Email ini sudah dipakai akun lain.";

/** User tanpa akun dan tanpa staf yang lebih lama dari ini dianggap sisa kegagalan, bukan permintaan lain yang masih berjalan. */
const ORPHAN_AFTER_MS = 5 * 60_000;

/**
 * Memastikan email belum dipakai. User yatim lama (pembuatan akun yang gagal di tengah, tanpa akun dan tanpa staf) dibersihkan
 * supaya emailnya tidak "terpakai" selamanya tanpa terlihat di panel; yang baru atau yang punya akun tetap dianggap terpakai.
 */
async function assertEmailFree(email: string): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { email }, include: { accounts: { select: { id: true } } } });
  if (!existing) return;
  const orphan = !existing.staffId && existing.accounts.length === 0 && Date.now() - existing.createdAt.getTime() > ORPHAN_AFTER_MS;
  if (!orphan) throw new UserFacingError(EMAIL_TAKEN);
  await prisma.session.deleteMany({ where: { userId: existing.id } });
  await prisma.user.delete({ where: { id: existing.id } });
}

/**
 * Membuat akun login untuk staf dan menautkannya. Akun baru wajib mengganti kata sandi. `signUpEmail` ikut membuat satu sesi
 * (tanpa cookie, tidak bisa dipakai siapa pun); dihapus agar tidak tersisa. Bila langkah setelah pembuatan akun gagal, akun
 * itu dibersihkan sehingga tidak ada akun tanpa staf.
 */
async function createLogin(staff: { id: string; name: string }, email: string): Promise<Credentials> {
  await assertEmailFree(email);
  const tempPassword = generateTempPassword();
  let created: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
  try {
    created = await auth.api.signUpEmail({ body: { email, password: tempPassword, name: staff.name } });
  } catch (error) {
    // Dua permintaan memakai email yang sama bersamaan: yang kalah ditolak indeks unik dengan galat umum Better Auth.
    if (await prisma.user.findFirst({ where: { email } })) throw new UserFacingError(EMAIL_TAKEN);
    throw error;
  }
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id, mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: created.user.id } }),
    ]);
  } catch (error) {
    await prisma.session.deleteMany({ where: { userId: created.user.id } }).catch(() => undefined);
    await prisma.account.deleteMany({ where: { userId: created.user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: created.user.id } }).catch(() => undefined);
    throw error;
  }
  return { email, tempPassword };
}

/** Jumlah Super Admin aktif yang punya akun; dipanggil setelah baris Super Admin dikunci dalam transaksi yang sama. */
async function countActiveSuperAdminsWithLogin(tx: Prisma.TransactionClient): Promise<number> {
  return tx.staff.count({ where: { role: "SUPER_ADMIN", isActive: true, user: { isNot: null } } });
}

/** Mengunci baris Super Admin supaya dua pemilik yang bertindak bersamaan tidak sama-sama lolos pengaman "minimal satu". */
async function lockSuperAdmins(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Staff" WHERE "role" = 'SUPER_ADMIN' ORDER BY "id" FOR UPDATE`;
}

export async function createStaffWithAccount(input: {
  name: string;
  role: StaffRole;
  showOnWebsite?: boolean;
  email?: string;
}): Promise<ActionResult<{ staffId: string; credentials: Credentials | null }>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = validateStaffName(input?.name);
    if (!name.ok) throw new UserFacingError(name.message);
    if (!isStaffRole(input?.role)) throw new UserFacingError("Pilih peran.");
    const role = input.role;

    let email: string | null = null;
    if (roleCanHaveLogin(role)) {
      const checked = validateLoginEmail(input.email);
      if (!checked.ok) throw new UserFacingError(checked.message);
      await assertEmailFree(checked.value);
      email = checked.value;
    }

    const staff = await prisma.staff.create({
      data: { slug: await uniqueStaffSlug(name.value), name: name.value, role, showOnWebsite: input.showOnWebsite ?? false },
    });
    let credentials: Credentials | null = null;
    if (email) {
      try {
        credentials = await createLogin(staff, email);
      } catch (error) {
        await prisma.staff.delete({ where: { id: staff.id } }).catch(() => undefined);
        throw error;
      }
    }

    await recordAudit({ actor, action: "staff.create", entity: "Staff", entityId: staff.id, summary: `${staff.name} (${STAFF_ROLE_LABEL[role]})` });
    if (credentials) {
      await recordAudit({ actor, action: "staff.account.create", entity: "Staff", entityId: staff.id, summary: `${staff.name} · ${credentials.email}` });
    }
    revalidateStaff();
    return { staffId: staff.id, credentials };
  });
}

export async function createAccountForStaff(input: { staffId: string; email: string }): Promise<ActionResult<{ credentials: Credentials }>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const staff = await prisma.staff.findUnique({ where: { id: String(input?.staffId ?? "") }, include: { user: { select: { id: true } } } });
    if (!staff) throw new UserFacingError(NOT_FOUND);
    if (staff.user) throw new UserFacingError("Staf ini sudah punya akun.");
    if (!roleCanHaveLogin(staff.role)) throw new UserFacingError("Staf berperan Terapis tidak bisa punya akun.");
    if (!staff.isActive) throw new UserFacingError("Aktifkan staf dulu sebelum membuat akunnya.");
    const email = validateLoginEmail(input.email);
    if (!email.ok) throw new UserFacingError(email.message);

    const credentials = await createLogin(staff, email.value);
    await recordAudit({ actor, action: "staff.account.create", entity: "Staff", entityId: staff.id, summary: `${staff.name} · ${credentials.email}` });
    revalidateStaff();
    return { credentials };
  });
}

export async function updateStaff(input: { id: string; name: string; role: StaffRole; showOnWebsite: boolean }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = validateStaffName(input?.name);
    if (!name.ok) throw new UserFacingError(name.message);
    if (!isStaffRole(input?.role)) throw new UserFacingError("Pilih peran.");
    const role = input.role;

    const summary = await prisma.$transaction(async (tx) => {
      await lockSuperAdmins(tx);
      const target = await tx.staff.findUnique({ where: { id: String(input.id ?? "") }, include: { user: { select: { id: true } } } });
      if (!target) throw new UserFacingError(NOT_FOUND);
      if (role !== target.role) {
        const block = staffChangeBlock({
          actorStaffId: actor.staffId,
          target: { id: target.id, role: target.role, isActive: target.isActive, hasLogin: target.user !== null },
          change: { kind: "role", to: role },
          activeSuperAdminsWithLogin: await countActiveSuperAdminsWithLogin(tx),
        });
        if (block) throw new UserFacingError(block);
      }
      await tx.staff.update({ where: { id: target.id }, data: { name: name.value, role, showOnWebsite: Boolean(input.showOnWebsite) } });
      if (target.user && name.value !== target.name) await tx.user.update({ where: { id: target.user.id }, data: { name: name.value } });
      return role === target.role ? name.value : `${name.value} (${STAFF_ROLE_LABEL[target.role]} → ${STAFF_ROLE_LABEL[role]})`;
    });

    await recordAudit({ actor, action: "staff.update", entity: "Staff", entityId: input.id, summary });
    revalidateStaff();
  });
}

export async function setStaffActive(id: string, isActive: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const name = await prisma.$transaction(async (tx) => {
      await lockSuperAdmins(tx);
      const target = await tx.staff.findUnique({ where: { id: String(id ?? "") }, include: { user: { select: { id: true } } } });
      if (!target) throw new UserFacingError(NOT_FOUND);
      if (!isActive && target.isActive) {
        const block = staffChangeBlock({
          actorStaffId: actor.staffId,
          target: { id: target.id, role: target.role, isActive: target.isActive, hasLogin: target.user !== null },
          change: { kind: "deactivate" },
          activeSuperAdminsWithLogin: await countActiveSuperAdminsWithLogin(tx),
        });
        if (block) throw new UserFacingError(block);
      }
      await tx.staff.update({ where: { id: target.id }, data: { isActive } });
      // Akses langsung berhenti walau sesi masih ada (getCurrentStaff menolak staf nonaktif); sesi dicabut juga agar bersih.
      if (!isActive && target.user) await tx.session.deleteMany({ where: { userId: target.user.id } });
      return target.name;
    });

    await recordAudit({ actor, action: isActive ? "staff.activate" : "staff.deactivate", entity: "Staff", entityId: id, summary: name });
    revalidateStaff();
  });
}

export async function resetStaffPassword(staffId: string): Promise<ActionResult<{ credentials: Credentials }>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const staff = await prisma.staff.findUnique({ where: { id: String(staffId ?? "") }, include: { user: { select: { id: true, email: true } } } });
    if (!staff) throw new UserFacingError(NOT_FOUND);
    if (!staff.user) throw new UserFacingError("Staf ini belum punya akun.");

    const ctx = await auth.$context;
    const tempPassword = generateTempPassword();
    const hash = await ctx.password.hash(tempPassword);
    const userId = staff.user.id;
    // Kata sandi, tanda wajib ganti, dan pencabutan sesi satu transaksi: kegagalan di tengah tidak boleh mengganti kata sandi
    // tanpa mencabut sesi lama.
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: hash } });
      if (count !== 1) throw new UserFacingError("Akun ini tidak memakai login email dan kata sandi.");
      await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
      await tx.session.deleteMany({ where: { userId } });
    });

    await recordAudit({ actor, action: "staff.account.reset", entity: "Staff", entityId: staff.id, summary: `${staff.name} · ${staff.user.email}` });
    // Mereset akun sendiri mencabut sesi ini; me-refresh rute sekarang akan melempar pemilik ke /masuk sebelum sempat menyalin kata sandi.
    // Layar memuat ulang sendiri saat dialog ditutup.
    if (staff.id !== actor.staffId) revalidateStaff();
    return { credentials: { email: staff.user.email, tempPassword } };
  });
}

export async function changeStaffEmail(input: { staffId: string; email: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("staff:manage");
    const email = validateLoginEmail(input?.email);
    if (!email.ok) throw new UserFacingError(email.message);
    const staff = await prisma.staff.findUnique({ where: { id: String(input.staffId ?? "") }, include: { user: { select: { id: true, email: true } } } });
    if (!staff) throw new UserFacingError(NOT_FOUND);
    if (!staff.user) throw new UserFacingError("Staf ini belum punya akun.");
    if (staff.user.email === email.value) throw new UserFacingError("Email baru sama dengan yang sekarang.");
    await assertEmailFree(email.value);

    await prisma.$transaction([
      prisma.user.update({ where: { id: staff.user.id }, data: { email: email.value } }),
      prisma.session.deleteMany({ where: { userId: staff.user.id } }),
    ]);
    await recordAudit({ actor, action: "staff.account.email", entity: "Staff", entityId: staff.id, summary: `${staff.name}: ${staff.user.email} → ${email.value}` });
    revalidateStaff();
  });
}
