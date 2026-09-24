// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

describe("autentikasi staf", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
    await prisma.staff.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createStaffUser(email: string, password: string) {
    const staff = await prisma.staff.create({
      data: { slug: `staf-${Date.now()}`, name: "Staf Uji", role: "RESEPSIONIS" },
    });
    const created = await auth.api.signUpEmail({
      body: { email, password, name: "Staf Uji" },
    });
    await prisma.user.update({
      where: { id: created.user.id },
      data: { staffId: staff.id },
    });
    return { staff, userId: created.user.id };
  }

  it("menerima kata sandi yang benar", async () => {
    await createStaffUser("resepsionis@sundy.test", "kataSandiPanjang123");

    const result = await auth.api.signInEmail({
      body: { email: "resepsionis@sundy.test", password: "kataSandiPanjang123" },
    });

    expect(result.user.email).toBe("resepsionis@sundy.test");
  });

  it("menolak kata sandi yang salah", async () => {
    await createStaffUser("resepsionis@sundy.test", "kataSandiPanjang123");

    await expect(
      auth.api.signInEmail({
        body: { email: "resepsionis@sundy.test", password: "kataSandiSalah999" },
      }),
    ).rejects.toThrow();
  });

  it("tidak pernah menyimpan kata sandi dalam bentuk terbaca", async () => {
    await createStaffUser("dokter@sundy.test", "kataSandiPanjang123");

    const accounts = await prisma.account.findMany();
    const stored = accounts.map((a) => a.password).join(" ");
    expect(stored).not.toContain("kataSandiPanjang123");
    expect(stored.length).toBeGreaterThan(0);
  });

  it("menolak kata sandi yang lebih pendek dari 12 karakter", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "pendek@sundy.test", password: "pendek", name: "Pendek" },
      }),
    ).rejects.toThrow();
  });
});
