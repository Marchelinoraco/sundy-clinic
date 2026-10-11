// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-accounts";
import {
  changeStaffEmail,
  createAccountForStaff,
  createStaffWithAccount,
  listStaffAccounts,
  resetStaffPassword,
  setStaffActive,
  updateStaff,
} from "@/server/staff";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u-aktor", staffId: "", name: "Pemilik Uji", role: "SUPER_ADMIN" as Role, email: "aktor@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return { ...actor };
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "kelola";
const mail = (name: string) => `${SLUG}-${name}@sundy.test`;
const PASSWORD = "kataSandiPanjang123";

describe("pengelolaan akun staf", () => {
  let actorStaffId: string;
  let othersToRestore: string[] = [];

  async function clean() {
    const users = await prisma.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entity: "Staff", actorName: "Pemilik Uji" } });
    // Staf yang dibuat lewat aksi memakai slug dari nama, jadi dikenali dari awalan nama "Kelola ".
    await prisma.staff.deleteMany({ where: { OR: [{ slug: { startsWith: SLUG } }, { name: { startsWith: "Kelola " } }] } });
  }

  /** Staf + akun langsung lewat Better Auth (di luar aksi yang diuji). */
  async function seedAccount(name: string, role: "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS" | "APOTEKER" = "RESEPSIONIS") {
    const staff = await prisma.staff.create({ data: { slug: `${SLUG}-${name}`, name: `Staf ${name}`, role } });
    const created = await auth.api.signUpEmail({ body: { email: mail(name), password: PASSWORD, name: `Staf ${name}` } });
    await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });
    // signUpEmail ikut membuat satu sesi; buang agar hitungan sesi di uji tepat.
    await prisma.session.deleteMany({ where: { userId: created.user.id } });
    return { staff, userId: created.user.id };
  }
  const login = (name: string, password = PASSWORD) => auth.api.signInEmail({ body: { email: mail(name), password } });

  beforeAll(async () => {
    await clean();
    // Penghitungan "Super Admin terakhir" memakai seluruh tabel Staff: matikan sementara yang lain di basis data uji, pulihkan di afterAll.
    const others = await prisma.staff.findMany({ where: { role: "SUPER_ADMIN", isActive: true, user: { isNot: null } }, select: { id: true } });
    othersToRestore = others.map((s) => s.id);
    await prisma.staff.updateMany({ where: { id: { in: othersToRestore } }, data: { isActive: false } });
  });
  beforeEach(async () => {
    await clean();
    actor.role = "SUPER_ADMIN";
    const owner = await seedAccount("pemilik", "SUPER_ADMIN");
    actorStaffId = owner.staff.id;
    actor.staffId = actorStaffId;
  });
  afterAll(async () => {
    await clean();
    await prisma.staff.updateMany({ where: { id: { in: othersToRestore } }, data: { isActive: true } });
    await prisma.$disconnect();
  });

  it("memastikan aturan panjang kata sandi sama dengan konfigurasi Better Auth", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(auth.options.emailAndPassword?.minPasswordLength);
  });

  it("menambah staf dengan akun: kata sandi sementara bisa dipakai masuk, tanda wajib ganti menyala, tanpa sesi tersisa", async () => {
    const { staffId, credentials } = await unwrap(createStaffWithAccount({ name: `  Kelola   Rina Uji `, role: "RESEPSIONIS", email: ` ${mail("rina").toUpperCase()} ` }));
    expect(credentials).not.toBeNull();
    expect(credentials!.email).toBe(mail("rina"));
    expect(credentials!.tempPassword).toHaveLength(16);

    const staff = await prisma.staff.findUniqueOrThrow({ where: { id: staffId }, include: { user: true } });
    expect(staff).toMatchObject({ name: "Kelola Rina Uji", role: "RESEPSIONIS", isActive: true, showOnWebsite: false });
    expect(staff.user).toMatchObject({ email: mail("rina"), mustChangePassword: true, staffId });
    expect(await prisma.session.count({ where: { userId: staff.user!.id } })).toBe(0);
    expect((await login("rina", credentials!.tempPassword)).user.email).toBe(mail("rina"));
  });

  it("kata sandi sementara tidak pernah masuk ke jejak audit (seluruh tabel dipindai)", async () => {
    const { credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Audit Uji", role: "DOKTER", email: mail("audit") }));
    const reset = await unwrap(resetStaffPassword((await prisma.staff.findFirstOrThrow({ where: { name: "Kelola Audit Uji" } })).id));
    const rows = await prisma.auditLog.findMany();
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain(credentials!.tempPassword);
    expect(everything).not.toContain(reset.credentials.tempPassword);
    const actions = rows.filter((r) => r.actorName === "Pemilik Uji").map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["staff.create", "staff.account.create", "staff.account.reset"]));
  });

  it("Terapis ditambah tanpa akun dan tanpa kata sandi", async () => {
    const { staffId, credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Terapis Uji", role: "TERAPIS", email: mail("abaikan") }));
    expect(credentials).toBeNull();
    expect(await prisma.user.count({ where: { staffId } })).toBe(0);
    expect(await prisma.user.count({ where: { email: mail("abaikan") } })).toBe(0);
  });

  it("menolak email tidak sah, nama kosong, dan peran tak dikenal tanpa meninggalkan staf", async () => {
    const before = await prisma.staff.count();
    expect(await createStaffWithAccount({ name: "Salah Email", role: "DOKTER", email: "bukan-email" })).toEqual({ ok: false, error: "Email tidak valid." });
    expect(await createStaffWithAccount({ name: "Tanpa Email", role: "DOKTER" })).toEqual({ ok: false, error: "Isi email login." });
    expect(await createStaffWithAccount({ name: "  ", role: "DOKTER", email: mail("x") })).toEqual({ ok: false, error: "Isi nama staf." });
    expect(await createStaffWithAccount({ name: "Peran Salah", role: "PEMILIK" as never, email: mail("y") })).toEqual({ ok: false, error: "Pilih peran." });
    expect(await prisma.staff.count()).toBe(before);
  });

  it("email dobel ditolak (huruf besar dan spasi dinormalkan), dan staf yang sempat dibuat dibersihkan", async () => {
    await seedAccount("ada");
    const before = await prisma.staff.count();
    expect(await createStaffWithAccount({ name: "Kelola Dobel Uji", role: "DOKTER", email: `  ${mail("ada").toUpperCase()}` })).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await prisma.staff.count()).toBe(before);
  });

  it("bila pembuatan akun gagal di tengah, staf yang sempat dibuat dibersihkan dan tidak ada akun tersisa", async () => {
    const before = await prisma.staff.count();
    const spy = vi.spyOn(auth.api, "signUpEmail").mockRejectedValueOnce(new Error("boom"));
    await expect(createStaffWithAccount({ name: "Kelola Gagal Tengah", role: "DOKTER", email: mail("gagal") })).rejects.toThrow("boom");
    spy.mockRestore();
    expect(await prisma.staff.count()).toBe(before);
    expect(await prisma.user.count({ where: { email: mail("gagal") } })).toBe(0);
  });

  it("membuat akun untuk staf yang sudah ada; menolak yang sudah punya akun, Terapis, dan staf nonaktif", async () => {
    const dokter = await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "Dokter Tanpa Akun", role: "DOKTER" } });
    const { credentials } = await unwrap(createAccountForStaff({ staffId: dokter.id, email: mail("dokter") }));
    expect((await login("dokter", credentials.tempPassword)).user.email).toBe(mail("dokter"));
    expect((await prisma.user.findFirstOrThrow({ where: { staffId: dokter.id } })).mustChangePassword).toBe(true);

    expect(await createAccountForStaff({ staffId: dokter.id, email: mail("lain") })).toEqual({ ok: false, error: "Staf ini sudah punya akun." });
    const terapis = await prisma.staff.create({ data: { slug: `${SLUG}-terapis`, name: "Terapis", role: "TERAPIS" } });
    expect(await createAccountForStaff({ staffId: terapis.id, email: mail("terapis") })).toEqual({ ok: false, error: "Staf berperan Terapis tidak bisa punya akun." });
    const off = await prisma.staff.create({ data: { slug: `${SLUG}-off`, name: "Nonaktif", role: "DOKTER", isActive: false } });
    expect(await createAccountForStaff({ staffId: off.id, email: mail("off") })).toEqual({ ok: false, error: "Aktifkan staf dulu sebelum membuat akunnya." });
    expect(await createAccountForStaff({ staffId: "tidak-ada", email: mail("z") })).toEqual({ ok: false, error: "Staf tidak ditemukan." });
  });

  it("mengubah nama, peran, dan tampil di situs; nama akun ikut berubah, dan peran berlaku seketika", async () => {
    const { staff, userId } = await seedAccount("ubah", "RESEPSIONIS");
    await unwrap(updateStaff({ id: staff.id, name: "  Nama   Baru ", role: "APOTEKER", showOnWebsite: true }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ name: "Nama Baru", role: "APOTEKER", showOnWebsite: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe("Nama Baru");
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.update", entityId: staff.id } })).summary).toContain("Resepsionis → Apoteker");
  });

  it("pengaman perubahan peran: tidak ke Terapis bila punya akun, tidak menurunkan diri sendiri, tidak menghabiskan Super Admin", async () => {
    const { staff } = await seedAccount("peran", "DOKTER");
    expect(await updateStaff({ id: staff.id, name: "Staf peran", role: "TERAPIS", showOnWebsite: false })).toEqual({
      ok: false,
      error: "Staf yang punya akun tidak bisa berperan Terapis. Nonaktifkan akunnya atau pilih peran lain.",
    });
    expect(await updateStaff({ id: actorStaffId, name: "Pemilik Uji", role: "DOKTER", showOnWebsite: false })).toEqual({ ok: false, error: "Anda tidak bisa menurunkan peran Anda sendiri." });

    // Super Admin kedua: menurunkannya boleh selama pemilik masih ada; setelah pemilik berhenti jadi Super Admin aktif, yang terakhir terlindungi.
    const second = await seedAccount("kedua", "SUPER_ADMIN");
    await unwrap(updateStaff({ id: second.staff.id, name: "Staf kedua", role: "DOKTER", showOnWebsite: false }));
    await prisma.staff.update({ where: { id: second.staff.id }, data: { role: "SUPER_ADMIN" } });
    await prisma.staff.update({ where: { id: actorStaffId }, data: { isActive: false } }); // pemilik (aktor) tidak lagi dihitung
    actor.staffId = "orang-lain";
    expect(await updateStaff({ id: second.staff.id, name: "Staf kedua", role: "DOKTER", showOnWebsite: false })).toEqual({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." });
  });

  it("menonaktifkan mencabut semua sesi dan langsung menolak masuk; mengaktifkan kembali memulihkan akses", async () => {
    const { staff, userId } = await seedAccount("henti");
    await login("henti");
    await login("henti");
    expect(await prisma.session.count({ where: { userId } })).toBe(2);

    await unwrap(setStaffActive(staff.id, false));
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).isActive).toBe(false);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.deactivate", entityId: staff.id } })).summary).toBe("Staf henti");

    await unwrap(setStaffActive(staff.id, true));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).isActive).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "staff.activate", entityId: staff.id } })).toBe(1);
  });

  it("pengaman nonaktifkan: tidak diri sendiri, tidak Super Admin terakhir", async () => {
    expect(await setStaffActive(actorStaffId, false)).toEqual({ ok: false, error: "Anda tidak bisa menonaktifkan akun Anda sendiri." });
    const second = await seedAccount("kedua", "SUPER_ADMIN");
    actor.staffId = "orang-lain"; // seolah pemilik lain yang bertindak
    await unwrap(setStaffActive(second.staff.id, false)); // masih ada pemilik aktif lain: boleh
    await prisma.staff.update({ where: { id: second.staff.id }, data: { isActive: true } });
    await prisma.staff.update({ where: { id: actorStaffId }, data: { isActive: false } });
    expect(await setStaffActive(second.staff.id, false)).toEqual({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." });
  });

  it("reset kata sandi: kata sandi baru berlaku, yang lama tidak, sesi dicabut, tanda wajib ganti menyala; boleh untuk diri sendiri", async () => {
    const { staff, userId } = await seedAccount("lupa");
    await login("lupa");
    const { credentials } = await unwrap(resetStaffPassword(staff.id));
    expect(credentials.email).toBe(mail("lupa"));
    expect(credentials.tempPassword).toHaveLength(16);
    expect((await login("lupa", credentials.tempPassword)).user.email).toBe(mail("lupa"));
    await expect(login("lupa", PASSWORD)).rejects.toThrow();
    expect(await prisma.session.count({ where: { userId } })).toBe(1); // hanya sesi dari masuk dengan kata sandi baru di atas
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true);

    const self = await unwrap(resetStaffPassword(actorStaffId));
    expect((await login("pemilik", self.credentials.tempPassword)).user.email).toBe(mail("pemilik"));
    const noAccount = await prisma.staff.create({ data: { slug: `${SLUG}-noacc`, name: "Tanpa Akun", role: "DOKTER" } });
    expect(await resetStaffPassword(noAccount.id)).toEqual({ ok: false, error: "Staf ini belum punya akun." });
    expect(await resetStaffPassword("tidak-ada")).toEqual({ ok: false, error: "Staf tidak ditemukan." });
  });

  it("ganti email: dinormalkan, sesi dicabut, email lama tidak lagi bisa masuk; menolak dobel dan yang sama", async () => {
    const { staff, userId } = await seedAccount("surel");
    await seedAccount("lain");
    await login("surel");
    await unwrap(changeStaffEmail({ staffId: staff.id, email: `  ${mail("baru").toUpperCase()} ` }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(mail("baru"));
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    await expect(login("surel")).rejects.toThrow();
    expect((await auth.api.signInEmail({ body: { email: mail("baru"), password: PASSWORD } })).user.id).toBe(userId);

    expect(await changeStaffEmail({ staffId: staff.id, email: mail("lain") })).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await changeStaffEmail({ staffId: staff.id, email: mail("baru") })).toEqual({ ok: false, error: "Email baru sama dengan yang sekarang." });
    expect(await changeStaffEmail({ staffId: staff.id, email: "salah" })).toEqual({ ok: false, error: "Email tidak valid." });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.account.email", entityId: staff.id } })).summary).toContain(`${mail("surel")} → ${mail("baru")}`);
  });

  it("daftar staf memuat email dan tanda wajib ganti", async () => {
    const { credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Daftar Uji", role: "DOKTER", email: mail("daftar") }));
    expect(credentials).not.toBeNull();
    await prisma.staff.create({ data: { slug: `${SLUG}-tanpa`, name: "Tanpa Akun Daftar", role: "TERAPIS" } });
    const rows = await listStaffAccounts();
    expect(rows.find((r) => r.name === "Kelola Daftar Uji")).toMatchObject({ email: mail("daftar"), mustChangePassword: true, role: "DOKTER", isActive: true });
    expect(rows.find((r) => r.name === "Tanpa Akun Daftar")).toMatchObject({ email: null, mustChangePassword: false });
  });

  it("semua aksi hanya untuk Super Admin", async () => {
    actor.role = "DOKTER";
    await expect(listStaffAccounts()).rejects.toThrow("forbidden: staff:manage");
    await expect(createStaffWithAccount({ name: "X", role: "DOKTER", email: mail("x") })).rejects.toThrow("forbidden: staff:manage");
    await expect(createAccountForStaff({ staffId: "a", email: mail("x") })).rejects.toThrow("forbidden: staff:manage");
    await expect(updateStaff({ id: "a", name: "X", role: "DOKTER", showOnWebsite: false })).rejects.toThrow("forbidden: staff:manage");
    await expect(setStaffActive("a", false)).rejects.toThrow("forbidden: staff:manage");
    await expect(resetStaffPassword("a")).rejects.toThrow("forbidden: staff:manage");
    await expect(changeStaffEmail({ staffId: "a", email: mail("x") })).rejects.toThrow("forbidden: staff:manage");
  });

  it("dua permintaan membuat email yang sama bersamaan: satu berhasil, yang lain mendapat pesan jelas dan tidak meninggalkan staf", async () => {
    const before = await prisma.staff.count();
    const results = await Promise.all([
      createStaffWithAccount({ name: "Kelola Balap A", role: "DOKTER", email: mail("balap") }),
      createStaffWithAccount({ name: "Kelola Balap B", role: "DOKTER", email: mail("balap") }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await prisma.staff.count()).toBe(before + 1);
    expect(await prisma.user.count({ where: { email: mail("balap") } })).toBe(1);
  });

  it("user yatim lama (tanpa akun dan tanpa staf) dibersihkan sehingga emailnya bisa dipakai; user yang punya akun tetap dianggap terpakai", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    await prisma.user.create({ data: { id: `${SLUG}-yatim-id`, name: "Yatim", email: mail("yatim"), createdAt: old, updatedAt: old } });
    const { credentials } = await unwrap(createStaffWithAccount({ name: "Kelola Pengganti Yatim", role: "DOKTER", email: mail("yatim") }));
    expect(credentials?.email).toBe(mail("yatim"));
    expect(await prisma.user.count({ where: { email: mail("yatim") } })).toBe(1);

    // Baru dibuat (mungkin masih berjalan di permintaan lain): tidak disentuh.
    await prisma.user.create({ data: { id: `${SLUG}-baru-id`, name: "Baru", email: mail("baru-yatim"), updatedAt: new Date() } });
    expect(await createStaffWithAccount({ name: "Kelola Tidak Boleh", role: "DOKTER", email: mail("baru-yatim") })).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await prisma.user.count({ where: { email: mail("baru-yatim") } })).toBe(1);
  });

  it("bila langkah setelah pembuatan akun gagal (transaksi penautan), akun dan staf yang sempat dibuat dibersihkan", async () => {
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION kelola_gagal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."email" = '${mail("gagaltx")}' THEN RAISE EXCEPTION 'kelola_gagal'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER kelola_gagal BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION kelola_gagal()`);
    try {
      const before = await prisma.staff.count();
      await expect(createStaffWithAccount({ name: "Kelola Gagal Tx", role: "DOKTER", email: mail("gagaltx") })).rejects.toThrow();
      expect(await prisma.staff.count()).toBe(before);
      expect(await prisma.user.count({ where: { email: mail("gagaltx") } })).toBe(0);
      expect(await prisma.account.count({ where: { user: { email: mail("gagaltx") } } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS kelola_gagal ON "user"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS kelola_gagal()`);
    }
  });

  it("reset kata sandi atomik: bila pencabutan sesi gagal, kata sandi lama tetap berlaku dan tanda tidak menyala", async () => {
    const { staff, userId } = await seedAccount("atomik");
    await login("atomik");
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION kelola_tolak_sesi() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'kelola_tolak_sesi'; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER kelola_tolak_sesi BEFORE DELETE ON "session" FOR EACH ROW EXECUTE FUNCTION kelola_tolak_sesi()`);
    try {
      await expect(resetStaffPassword(staff.id)).rejects.toThrow();
      expect((await login("atomik")).user.email).toBe(mail("atomik")); // kata sandi lama masih berlaku
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(false);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS kelola_tolak_sesi ON "session"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS kelola_tolak_sesi()`);
    }
  });

  it("dua pemilik saling menonaktifkan bersamaan: pengaman 'minimal satu' berlaku dan tepat satu yang lolos", async () => {
    const a = await seedAccount("serentak-a", "SUPER_ADMIN");
    const b = await seedAccount("serentak-b", "SUPER_ADMIN");
    await prisma.staff.update({ where: { id: actorStaffId }, data: { isActive: false } }); // pemilik awal tidak dihitung
    actor.staffId = a.staff.id;
    const first = setStaffActive(b.staff.id, false);
    actor.staffId = b.staff.id;
    const second = setStaffActive(a.staff.id, false);
    const results = await Promise.all([first, second]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." });
    expect(await prisma.staff.count({ where: { role: "SUPER_ADMIN", isActive: true, user: { isNot: null }, slug: { startsWith: "kelola-serentak" } } })).toBe(1);
  });

  it("aksi yang bisa mengurangi Super Admin menunggu kunci baris Super Admin (nonaktifkan dan ubah peran), lalu jalan setelah dilepas", async () => {
    const target = await seedAccount("tunggu-kunci", "SUPER_ADMIN");
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let taken: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => (taken = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        // Hanya baris Super Admin LAIN yang ditahan (bukan target): yang diukur adalah kunci seluruh Super Admin, bukan kunci baris target.
        await tx.$queryRaw`SELECT "id" FROM "Staff" WHERE "id" = ${actorStaffId} FOR UPDATE`;
        taken();
        await held;
      },
      { timeout: 20_000 },
    );
    await lockTaken;

    let deactivated = false;
    let changed = false;
    const deactivate = setStaffActive(target.staff.id, false).then((r) => ((deactivated = true), r));
    const change = updateStaff({ id: target.staff.id, name: "Staf tunggu-kunci", role: "DOKTER", showOnWebsite: false }).then((r) => ((changed = true), r));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect({ deactivated, changed }).toEqual({ deactivated: false, changed: false });

    release();
    await holder;
    const [first, second] = await Promise.all([deactivate, change]);
    expect([first.ok, second.ok]).toEqual([true, true]);
  });

  it("reset diri sendiri tidak me-refresh halaman (sesinya baru dicabut); reset staf lain me-refresh", async () => {
    const { staff } = await seedAccount("lain-refresh");
    vi.mocked(safeRevalidatePath).mockClear();
    await unwrap(resetStaffPassword(actorStaffId));
    expect(safeRevalidatePath).not.toHaveBeenCalled();
    await unwrap(resetStaffPassword(staff.id));
    expect(safeRevalidatePath).toHaveBeenCalledWith("/admin/staf");
  });
});
