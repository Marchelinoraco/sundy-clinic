// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getOnlineServiceSettings, updateOnlineService } from "@/server/service-admin";
import { setOnlineService } from "./public-booking-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Pemilik Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("pengaturan layanan Konsultasi Online", () => {
  beforeEach(async () => {
    await setOnlineService({ price: 0, active: false });
  });

  afterAll(async () => {
    await setOnlineService({ price: 0, active: false });
    await prisma.$disconnect();
  });

  it("membaca harga, durasi, dan status aktif", async () => {
    expect(await getOnlineServiceSettings()).toEqual({ price: 0, durationMin: 30, active: false });
  });

  it("menyimpan harga, durasi, dan aktif, lalu mencatatnya di jejak audit", async () => {
    await unwrap(updateOnlineService({ price: 250000, durationMin: 45, active: true }));
    expect(await getOnlineServiceSettings()).toEqual({ price: 250000, durationMin: 45, active: true });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "service.online.update" }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).toBe("Konsultasi Online: Rp 250.000, 45 menit, aktif");
  });

  it("menolak harga 0 saat diaktifkan dan durasi di luar pilihan", async () => {
    expect(await updateOnlineService({ price: 0, durationMin: 30, active: true })).toEqual({
      ok: false,
      error: "Isi harga Konsultasi Online sebelum mengaktifkannya.",
    });
    expect(await updateOnlineService({ price: 250000, durationMin: 20, active: true })).toEqual({
      ok: false,
      error: "Durasi harus 15, 30, 45, atau 60 menit.",
    });
    expect((await updateOnlineService({ price: 0, durationMin: 30, active: false })).ok).toBe(true);
  });
});
