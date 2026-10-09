// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST as uploadBia } from "@/app/(admin)/admin/bia/unggah/route";
import { getCurrentStaff, getPendingPasswordChange, requireStaff } from "@/server/session";

const { state } = vi.hoisted(() => ({ state: { headers: new Headers() } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => state.headers) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

const SLUG = "gerbang";
const PASSWORD = "kataSandiPanjang123";
const email = (name: string) => `${SLUG}-${name}@sundy.test`;

/** Membuat staf + akun dan mengembalikan header cookie sesi yang sah. */
async function login(name: string, patch: { mustChange?: boolean; active?: boolean } = {}) {
  const staff = await prisma.staff.create({ data: { slug: `${SLUG}-${name}`, name: `Staf ${name}`, role: "RESEPSIONIS", isActive: patch.active ?? true } });
  const created = await auth.api.signUpEmail({ body: { email: email(name), password: PASSWORD, name: `Staf ${name}` } });
  await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id, mustChangePassword: patch.mustChange ?? false } });
  // signUpEmail ikut membuat satu sesi; buang agar satu-satunya sesi adalah yang dibuat signInEmail di bawah.
  await prisma.session.deleteMany({ where: { userId: created.user.id } });
  const signedIn = await auth.api.signInEmail({ body: { email: email(name), password: PASSWORD }, returnHeaders: true });
  const cookie = signedIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  state.headers = new Headers({ cookie });
  return { staff, userId: created.user.id };
}

async function clean() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: `${SLUG}-` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.account.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: `${SLUG}-` } } });
}

describe("gerbang wajib ganti kata sandi", () => {
  beforeEach(async () => {
    state.headers = new Headers();
    await clean();
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("akun biasa: login, tidak menunggu ganti kata sandi", async () => {
    await login("biasa");
    expect(await getCurrentStaff()).toMatchObject({ email: email("biasa"), role: "RESEPSIONIS" });
    expect(await getPendingPasswordChange()).toBeNull();
    expect((await requireStaff()).email).toBe(email("biasa"));
  });

  it("akun yang wajib ganti tidak dianggap login, tetapi dikenali sebagai menunggu dan membawa id sesinya", async () => {
    const { userId } = await login("wajib", { mustChange: true });
    expect(await getCurrentStaff()).toBeNull();
    const pending = await getPendingPasswordChange();
    expect(pending).toMatchObject({ email: email("wajib"), role: "RESEPSIONIS", userId });
    const session = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(pending?.sessionId).toBe(session.id);
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/ganti-kata-sandi");
  });

  it("rute yang memakai getCurrentStaff menolak akun yang wajib ganti (unggah BIA 401)", async () => {
    await login("rute", { mustChange: true });
    const response = await uploadBia(new Request("https://sundyclinic.com/admin/bia/unggah", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("tanpa cookie atau staf nonaktif: tidak login dan tidak menunggu; requireStaff ke /masuk", async () => {
    expect(await getCurrentStaff()).toBeNull();
    expect(await getPendingPasswordChange()).toBeNull();
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/masuk");

    await login("nonaktif", { active: false });
    expect(await getCurrentStaff()).toBeNull();
    expect(await getPendingPasswordChange()).toBeNull();
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/masuk");
  });

  it("peran dibaca dari basis data tiap permintaan: perubahan peran berlaku seketika", async () => {
    const { staff } = await login("peran");
    expect((await getCurrentStaff())?.role).toBe("RESEPSIONIS");
    await prisma.staff.update({ where: { id: staff.id }, data: { role: "APOTEKER" } });
    expect((await getCurrentStaff())?.role).toBe("APOTEKER");
  });
});
