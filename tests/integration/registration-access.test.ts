// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getPublicSlots, holdSlot, submitOnlineBooking, submitSiteBooking, type OnlineBookingInput, type SiteBookingInput } from "@/server/public-booking";

const { session } = vi.hoisted(() => ({ session: { staff: null as null | { name: string } } }));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => session.staff) }));
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const CLOSED = { ok: false, error: "Pendaftaran online sedang ditutup." };
const slots = () => getPublicSlots({ serviceId: "x", staffId: null, branchId: "x", date: "2000-01-01", holdToken: null });
const all = () => [
  slots(),
  holdSlot({ serviceId: "x", staffId: "x", branchId: "x", startAt: "2000-01-01T00:00:00Z", previousToken: null }),
  submitSiteBooking({ holdToken: "x".repeat(20) } as SiteBookingInput),
  submitOnlineBooking({ submissionKey: "x".repeat(20) } as OnlineBookingInput),
];

afterEach(() => {
  vi.unstubAllEnvs();
  session.staff = null;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("akses pendaftaran online (REGISTRATION_CLOSED)", () => {
  it("mode staff: aksi booking ditolak bagi pengunjung tanpa login, walau dipanggil langsung", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "staff");
    for (const result of await Promise.all(all())) expect(result).toEqual(CLOSED);
  });

  it("mode staff: staf yang login melewati penjaga (lalu diperiksa seperti biasa)", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "staff");
    session.staff = { name: "Staf Uji" };
    expect(await slots()).toEqual({ ok: false, error: "Pilih tanggal antara hari ini dan 30 hari ke depan." });
  });

  it("mode true: tertutup untuk semua orang, termasuk staf", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "true");
    session.staff = { name: "Staf Uji" };
    for (const result of await Promise.all(all())) expect(result).toEqual(CLOSED);
  });

  it("tanpa pengaturan: terbuka untuk umum", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "");
    expect(await slots()).toEqual({ ok: false, error: "Pilih tanggal antara hari ini dan 30 hari ke depan." });
  });
});
