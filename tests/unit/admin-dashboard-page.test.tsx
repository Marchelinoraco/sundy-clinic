import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboardPage from "@/app/(admin)/admin/page";
import { getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { listDoctorWorklist } from "@/server/encounter-read";
import { requireStaff } from "@/server/session";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => <button type="button">Sidebar</button> }));
vi.mock("@/server/encounter", () => ({ openEncounter: vi.fn() }));
vi.mock("@/server/session", () => ({ requireStaff: vi.fn() }));
vi.mock("@/server/encounter-read", () => ({ listDoctorWorklist: vi.fn() }));
vi.mock("@/server/dashboard", () => ({ getTodayWork: vi.fn(), getTodaySchedule: vi.fn(), getDashboardNumbers: vi.fn() }));

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
});
