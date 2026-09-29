// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getClinicSetting, updateClinicSetting } from "@/server/clinic-setting";
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

const DEFAULTS = { bookingFee: 100000, bankName: null, bankAccountNumber: null, bankAccountHolder: null };

describe("pengaturan klinik", () => {
  beforeEach(async () => {
    await prisma.clinicSetting.update({ where: { id: 1 }, data: DEFAULTS });
    await prisma.auditLog.deleteMany({ where: { action: "clinic-setting.update" } });
  });

  afterAll(async () => {
    await prisma.clinicSetting.update({ where: { id: 1 }, data: DEFAULTS });
    await prisma.auditLog.deleteMany({ where: { action: "clinic-setting.update" } });
    await prisma.$disconnect();
  });

  it("membaca biaya booking awal", async () => {
    expect(await getClinicSetting()).toEqual(DEFAULTS);
  });

  it("menyimpan biaya dan rekening, lalu mencatatnya di audit", async () => {
    const saved = await unwrap(
      updateClinicSetting({
        bookingFee: 150000,
        bankName: " BCA ",
        bankAccountNumber: "1234567890",
        bankAccountHolder: "SunDY Clinic",
      }),
    );

    expect(saved).toEqual({
      bookingFee: 150000,
      bankName: "BCA",
      bankAccountNumber: "1234567890",
      bankAccountHolder: "SunDY Clinic",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "clinic-setting.update" } });
    expect(audit.actorName).toBe("Pemilik Uji");
  });

  it("mengosongkan rekening bila kolomnya dikosongkan", async () => {
    await unwrap(updateClinicSetting({ bookingFee: 100000, bankName: "BCA", bankAccountNumber: "1", bankAccountHolder: "X" }));
    const saved = await unwrap(
      updateClinicSetting({ bookingFee: 100000, bankName: "", bankAccountNumber: " ", bankAccountHolder: "" }),
    );
    expect(saved).toEqual(DEFAULTS);
  });

  it("menolak biaya yang bukan rupiah bulat", async () => {
    for (const bookingFee of [-1, 0, 1.5, Number.NaN, 20_000_000]) {
      const result = await updateClinicSetting({ bookingFee, bankName: "", bankAccountNumber: "", bankAccountHolder: "" });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("Biaya booking") });
    }
  });
});
