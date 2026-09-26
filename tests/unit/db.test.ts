// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Konstruktor tiruan: uji ini memeriksa KONTRAK src/lib/db.ts (adapter apa
// yang dipakai dan connection string mana yang diberikan), bukan koneksi
// sungguhan — koneksi sungguhan diuji di tests/integration/connection.test.ts.
const { PrismaPg, PrismaClient } = vi.hoisted(() => ({
  PrismaPg: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
  PrismaClient: vi.fn(function (this: { config: unknown }, config: unknown) {
    this.config = config;
  }),
}));

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg }));
vi.mock("@prisma/client", () => ({ PrismaClient }));

describe("klien basis data (src/lib/db.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    PrismaPg.mockClear();
    PrismaClient.mockClear();
    // db.ts menyimpan klien di globalThis di luar produksi; buang agar setiap
    // uji membuat klien baru.
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("memakai adapter PostgreSQL biasa dengan DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://sundy:rahasia@127.0.0.1:5432/sundy");

    await import("@/lib/db");

    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: "postgresql://sundy:rahasia@127.0.0.1:5432/sundy",
    });
    const [config] = PrismaClient.mock.calls[0] as [{ adapter: unknown }];
    expect(config.adapter).toBe(PrismaPg.mock.instances[0]);
  });

  it("menolak berjalan tanpa DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("@/lib/db")).rejects.toThrow("DATABASE_URL belum diisi");
  });
});
