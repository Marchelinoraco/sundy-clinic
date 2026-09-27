// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeLoginEmail } from "@/server/account";

const SANDI = "kataSandiPanjang123";

describe("ganti email login staf", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function buatAkun(email: string): Promise<string> {
    const created = await auth.api.signUpEmail({ body: { email, password: SANDI, name: "Staf Uji" } });
    return created.user.id;
  }

  it("login berhasil dengan email baru dan gagal dengan email lama", async () => {
    await buatAkun("pemilik@sundyclinic.id");

    const hasil = await changeLoginEmail("pemilik@sundyclinic.id", " Pemilik@SundyClinic.com ");

    expect(hasil.email).toBe("pemilik@sundyclinic.com");
    const masuk = await auth.api.signInEmail({ body: { email: "pemilik@sundyclinic.com", password: SANDI } });
    expect(masuk.user.email).toBe("pemilik@sundyclinic.com");
    await expect(
      auth.api.signInEmail({ body: { email: "pemilik@sundyclinic.id", password: SANDI } }),
    ).rejects.toThrow();
  });

  it("menghapus semua sesi lama akun itu", async () => {
    const userId = await buatAkun("pemilik@sundyclinic.id");
    await auth.api.signInEmail({ body: { email: "pemilik@sundyclinic.id", password: SANDI } });
    expect(await prisma.session.count({ where: { userId } })).toBeGreaterThan(0);

    await changeLoginEmail("pemilik@sundyclinic.id", "pemilik@sundyclinic.com");

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("menolak email yang sudah dipakai akun lain", async () => {
    await buatAkun("pemilik@sundyclinic.id");
    await buatAkun("dokter@sundyclinic.com");

    await expect(
      changeLoginEmail("pemilik@sundyclinic.id", "dokter@sundyclinic.com"),
    ).rejects.toThrow("sudah dipakai");
  });

  it("menolak akun yang tidak ada", async () => {
    await expect(
      changeLoginEmail("tidak-ada@sundyclinic.id", "baru@sundyclinic.com"),
    ).rejects.toThrow("Tidak ada akun");
  });

  it("menolak email baru yang tidak valid", async () => {
    await buatAkun("pemilik@sundyclinic.id");

    await expect(changeLoginEmail("pemilik@sundyclinic.id", "bukan-email")).rejects.toThrow("tidak valid");
  });
});
