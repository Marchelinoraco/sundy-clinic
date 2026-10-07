import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboardPage from "@/app/(admin)/admin/page";
import { getDashboardNumbers, getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { countPendingDispensings } from "@/server/dispensing-read";
import { countBillable, unpaidOverview } from "@/server/invoice-read";
import { payablesOverview } from "@/server/payable-read";
import { countStockAlerts } from "@/server/stock-read";
import { listDoctorWorklist, listOnlineWork } from "@/server/encounter-read";
import { requireStaff } from "@/server/session";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => <button type="button">Sidebar</button> }));
vi.mock("@/server/encounter", () => ({ openEncounter: vi.fn() }));
vi.mock("@/server/session", () => ({ requireStaff: vi.fn() }));
vi.mock("@/server/encounter-read", () => ({ listDoctorWorklist: vi.fn(), listOnlineWork: vi.fn() }));
vi.mock("@/server/online-consultation", () => ({ startOnlineConsultation: vi.fn(), recordContactAttempt: vi.fn() }));
vi.mock("@/server/dashboard", () => ({ getTodayWork: vi.fn(), getTodaySchedule: vi.fn(), getDashboardNumbers: vi.fn() }));
vi.mock("@/server/stock-read", () => ({ countStockAlerts: vi.fn() }));
vi.mock("@/server/payable-read", () => ({ payablesOverview: vi.fn() }));
vi.mock("@/server/dispensing-read", () => ({ countPendingDispensings: vi.fn() }));
vi.mock("@/server/invoice-read", () => ({ countBillable: vi.fn(), unpaidOverview: vi.fn() }));

const WORK = {
  pending: 0,
  pendingOverdue: 0,
  messages: { confirm: 0, remind: 0 },
  today: { total: 0, unfilledIntakes: 0, attended: 0, noShow: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStaff).mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
    role: "DOKTER",
    email: "diane@sundy.test",
  } as never);
  vi.mocked(getTodayWork).mockResolvedValue(WORK);
  vi.mocked(getTodaySchedule).mockResolvedValue({ date: "2031-02-12", holidayName: null, lanes: [], offStaff: [] });
  vi.mocked(listDoctorWorklist).mockResolvedValue({ today: [], unfinished: [] });
  vi.mocked(listOnlineWork).mockResolvedValue([]);
  vi.mocked(countBillable).mockResolvedValue(0);
  vi.mocked(countPendingDispensings).mockResolvedValue(0);
  vi.mocked(unpaidOverview).mockResolvedValue({ count: 0, balance: 0 });
});

async function renderPage() {
  render(await AdminDashboardPage({ searchParams: Promise.resolve({}) }));
}

describe("halaman Dasbor (spec D 4)", () => {
  it("dokter: sapaan tanpa gelar, tanpa Angka, dan daftar dokter selebar halaman", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Selamat (pagi|siang|sore|malam), Diane$/);
    expect(screen.queryByRole("region", { name: "Angka" })).not.toBeInTheDocument();
    const grid = screen.getByRole("region", { name: "Pasien hari ini" }).closest("div.grid");
    expect(grid?.className).not.toContain("xl:grid-cols-2");
  });

  it("satu bagian gagal dimuat: bagian lain tetap tampil (spec D 4.7)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getTodaySchedule).mockRejectedValue(new Error("putus"));
    await renderPage();
    expect(within(screen.getByRole("region", { name: "Jadwal hari ini" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Menunggu konfirmasi/ })).toBeInTheDocument();
    log.mockRestore();
  });

  it("dokter melihat bagian Konsultasi online di luar kisi daftar dokter", async () => {
    await renderPage();
    const online = screen.getByRole("region", { name: "Konsultasi online" });
    expect(online).toHaveTextContent("Tidak ada konsultasi online yang menunggu.");
    expect(online.closest("div.grid")).toBeNull();
  });

  it("resepsionis (tanpa record:write) tidak melihat bagian Konsultasi online", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u2", staffId: "s2", name: "Rina", role: "RESEPSIONIS", email: "r@sundy.test" } as never);
    await renderPage();
    expect(screen.queryByRole("region", { name: "Konsultasi online" })).not.toBeInTheDocument();
    expect(listOnlineWork).not.toHaveBeenCalled();
  });

  it("bagian Konsultasi online gagal dimuat: bagian lain tetap tampil", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listOnlineWork).mockRejectedValue(new Error("putus"));
    await renderPage();
    expect(within(screen.getByRole("region", { name: "Konsultasi online" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pasien hari ini" })).toBeInTheDocument();
    log.mockRestore();
  });

  it("Apoteker: kotak Stok saja, tanpa pekerjaan booking, hutang, atau angka (spec stok 7.2)", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u3", staffId: "s3", name: "Rina Apoteker", role: "APOTEKER", email: "a@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 2, expiringSoon: 1, expired: 0 });
    await renderPage();
    const stock = screen.getByRole("region", { name: "Stok" });
    expect(within(stock).getByRole("link", { name: /Stok menipis/ })).toHaveAttribute("href", "/admin/stok?tanda=MENIPIS");
    expect(within(stock).getByRole("link", { name: /Segera kedaluwarsa/ })).toHaveTextContent("1");
    expect(screen.queryByRole("region", { name: "Hutang" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pekerjaan hari ini" })).not.toBeInTheDocument();
    expect(getTodayWork).not.toHaveBeenCalled();
    expect(payablesOverview).not.toHaveBeenCalled();
    expect(getDashboardNumbers).not.toHaveBeenCalled();
  });

  it("Admin Keuangan: kotak Stok, Hutang, dan Angka; tanpa pekerjaan booking", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u4", staffId: "s4", name: "Budi Keuangan", role: "ADMIN_KEUANGAN", email: "k@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 0, expiringSoon: 0, expired: 0 });
    vi.mocked(payablesOverview).mockResolvedValue({
      totalBalance: 350000,
      overdueBalance: 100000,
      overdueCount: 1,
      dueSoonCount: 2,
      credit: 0,
      bySupplier: [],
    });
    vi.mocked(getDashboardNumbers).mockRejectedValue(new Error("tidak dimuat di uji ini"));
    await renderPage();
    const payables = screen.getByRole("region", { name: "Hutang" });
    expect(within(payables).getByRole("link", { name: /Hutang terlambat/ })).toHaveAttribute("href", "/admin/hutang?lihat=TERLAMBAT");
    expect(within(payables).getByRole("link", { name: /Sisa hutang/ })).toHaveTextContent("Rp 350.000");
    expect(screen.getByRole("region", { name: "Stok" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Angka" })).toBeInTheDocument();
    expect(getTodayWork).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("resepsionis melihat kotak Perlu ditagih, bukan Tagihan belum lunas", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u2", staffId: "s2", name: "Rina", role: "RESEPSIONIS", email: "r@sundy.test" } as never);
    vi.mocked(countBillable).mockResolvedValue(4);
    await renderPage();
    const tiles = screen.getByRole("region", { name: "Tagihan" });
    expect(within(tiles).getByRole("link", { name: /Perlu ditagih/ })).toHaveTextContent("4");
    expect(within(tiles).queryByText("Tagihan belum lunas")).not.toBeInTheDocument();
    expect(unpaidOverview).not.toHaveBeenCalled();
  });

  it("Admin Keuangan melihat Tagihan belum lunas; kegagalan memuatnya tidak menjatuhkan halaman", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u4", staffId: "s4", name: "Budi Keuangan", role: "ADMIN_KEUANGAN", email: "k@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 0, expiringSoon: 0, expired: 0 });
    vi.mocked(payablesOverview).mockResolvedValue({ totalBalance: 0, overdueBalance: 0, overdueCount: 0, dueSoonCount: 0, credit: 0, bySupplier: [] });
    vi.mocked(getDashboardNumbers).mockRejectedValue(new Error("tidak dimuat di uji ini"));
    vi.mocked(unpaidOverview).mockResolvedValue({ count: 2, balance: 170000 });
    await renderPage();
    expect(within(screen.getByRole("region", { name: "Tagihan" })).getByRole("link", { name: /Tagihan belum lunas/ })).toHaveTextContent("Rp 170.000");
    expect(countBillable).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("Apoteker melihat kotak Resep menunggu; resepsionis tidak memanggilnya", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u3", staffId: "s3", name: "Rina Apoteker", role: "APOTEKER", email: "a@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 0, expiringSoon: 0, expired: 0 });
    vi.mocked(countPendingDispensings).mockResolvedValue(2);
    await renderPage();
    const tile = within(screen.getByRole("region", { name: "Resep" })).getByRole("link", { name: /Resep menunggu/ });
    expect(tile).toHaveAttribute("href", "/admin/resep");
    expect(tile).toHaveTextContent("2");

    vi.mocked(countPendingDispensings).mockClear();
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u2", staffId: "s2", name: "Rina", role: "RESEPSIONIS", email: "r@sundy.test" } as never);
    document.body.innerHTML = "";
    await renderPage();
    expect(countPendingDispensings).not.toHaveBeenCalled();
  });

  it("bagian Hutang yang gagal dimuat tidak menjatuhkan halaman", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requireStaff).mockResolvedValue({ userId: "u4", staffId: "s4", name: "Budi Keuangan", role: "ADMIN_KEUANGAN", email: "k@sundy.test" } as never);
    vi.mocked(countStockAlerts).mockResolvedValue({ low: 0, expiringSoon: 0, expired: 0 });
    vi.mocked(payablesOverview).mockRejectedValue(new Error("putus"));
    vi.mocked(getDashboardNumbers).mockRejectedValue(new Error("tidak dimuat di uji ini"));
    await renderPage();
    expect(within(screen.getByRole("region", { name: "Hutang" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Stok" })).toBeInTheDocument();
    log.mockRestore();
  });
});
