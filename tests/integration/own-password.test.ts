// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeOwnPassword } from "@/server/own-password";

type Pending = { userId: string; staffId: string; name: string; role: "RESEPSIONIS"; email: string; sessionId: string } | null;
const { state } = vi.hoisted(() => ({ state: { pending: null as Pending } }));
vi.mock("@/server/session", () => ({ getPendingPasswordChange: vi.fn(async () => state.pending) }));

const SLUG = "gantisendiri";
const TEMP = "SementaraAbc234xyz";
const NEW = "kataSandiBaruPanjang1";
const email = `${SLUG}@sundy.test`;

describe("ganti kata sandi sendiri", () => {
  let userId: string;
  let staffId: string;

  async function clean() {
    const users = await prisma.user.findMany({ where: { email: { startsWith: SLUG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { action: "staff.password.change" } });
    await prisma.staff.deleteMany({ where: { slug: SLUG } });
  }
  const signIn = (password: string) => auth.api.signInEmail({ body: { email, password } });
  const input = (patch: Partial<Parameters<typeof changeOwnPassword>[0]> = {}) => ({ currentPassword: TEMP, newPassword: NEW, confirmation: NEW, ...patch });

  beforeEach(async () => {
    await clean();
    const staff = await prisma.staff.create({ data: { slug: SLUG, name: "Staf Ganti", role: "RESEPSIONIS" } });
    const created = await auth.api.signUpEmail({ body: { email, password: TEMP, name: "Staf Ganti" } });
    await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id, mustChangePassword: true } });
    await prisma.session.deleteMany({ where: { userId: created.user.id } }); // sesi bawaan signUpEmail
    userId = created.user.id;
    staffId = staff.id;
    await signIn(TEMP); // sesi yang sedang dipakai
    await signIn(TEMP); // sesi di perangkat lain
    const current = await prisma.session.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: "asc" } });
    state.pending = { userId, staffId, name: "Staf Ganti", role: "RESEPSIONIS", email, sessionId: current.id };
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("berhasil: kata sandi baru berlaku, yang sementara tidak; tanda mati; hanya sesi ini yang tersisa; audit tanpa kata sandi", async () => {
    const current = state.pending!.sessionId;
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
    expect(await changeOwnPassword(input())).toEqual({ ok: true, data: undefined });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(false);
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions.map((s) => s.id)).toEqual([current]);
    await expect(signIn(TEMP)).rejects.toThrow();
    expect((await signIn(NEW)).user.email).toBe(email);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.password.change", entityId: staffId } });
    expect(JSON.stringify(audit)).not.toContain(NEW);
    expect(JSON.stringify(audit)).not.toContain(TEMP);
  });

  it("kata sandi saat ini yang salah ditolak, tanda tetap menyala, tidak ada yang berubah", async () => {
    expect(await changeOwnPassword(input({ currentPassword: "salahSalahSalah1" }))).toEqual({ ok: false, error: "Kata sandi saat ini salah." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
    expect((await signIn(TEMP)).user.email).toBe(email);
  });

  it("aturan isian ditegakkan di server", async () => {
    expect(await changeOwnPassword(input({ newPassword: "pendek", confirmation: "pendek" }))).toEqual({ ok: false, error: "Kata sandi baru minimal 12 karakter." });
    expect(await changeOwnPassword(input({ confirmation: "berbeda1234567" }))).toEqual({ ok: false, error: "Kata sandi baru dan ulangannya tidak sama." });
    expect(await changeOwnPassword(input({ newPassword: TEMP, confirmation: TEMP }))).toEqual({ ok: false, error: "Kata sandi baru harus berbeda dari yang sementara." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);
  });

  it("akun yang tidak menunggu ganti kata sandi tidak bisa memakai aksi ini", async () => {
    state.pending = null;
    expect(await changeOwnPassword(input())).toEqual({ ok: false, error: "Anda tidak perlu mengganti kata sandi sekarang. Muat ulang halaman." });
    expect((await signIn(TEMP)).user.email).toBe(email);
  });

  it("atomik: bila pencabutan sesi gagal, kata sandi sementara tetap berlaku dan tanda tetap menyala", async () => {
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION gantisendiri_tolak_sesi() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'gantisendiri_tolak_sesi'; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER gantisendiri_tolak_sesi BEFORE DELETE ON "session" FOR EACH ROW EXECUTE FUNCTION gantisendiri_tolak_sesi()`);
    try {
      await expect(changeOwnPassword(input())).rejects.toThrow();
      expect((await signIn(TEMP)).user.email).toBe(email);
      await expect(signIn(NEW)).rejects.toThrow();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS gantisendiri_tolak_sesi ON "session"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS gantisendiri_tolak_sesi()`);
    }
  });

  it("kata sandi saat ini yang bukan string ditolak dengan pesan jelas, bukan galat umum", async () => {
    expect(await changeOwnPassword(input({ currentPassword: 12345 as never }))).toEqual({ ok: false, error: "Kata sandi saat ini salah." });
    expect(await changeOwnPassword(input({ currentPassword: undefined as never }))).toEqual({ ok: false, error: "Isi kata sandi saat ini." });
  });
});
