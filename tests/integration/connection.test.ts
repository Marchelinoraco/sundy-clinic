// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("koneksi basis data", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("dapat menjalankan kueri terhadap PostgreSQL", async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(result[0].ok).toBe(1);
  });

  it("terhubung ke basis data uji, bukan basis data utama", async () => {
    // Pengaman: uji integrasi mengosongkan tabel. Kalau variabel lingkungan
    // salah arah, uji ini gagal sebelum ada data yang terhapus.
    const url = process.env.DATABASE_URL ?? "";
    expect(url).toBe(process.env.TEST_DATABASE_URL);
  });
});
