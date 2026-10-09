import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncounterFoodRecallTab, type SubjectiveCopy } from "@/components/admin/encounter-food-recall-tab";
import type { FoodRecallView } from "@/lib/food-recall";
import { saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/food-recall-admin", () => ({
  saveFoodRecallByStaff: vi.fn(),
  getFoodRecallLink: vi.fn().mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } }),
  offerFoodRecall: vi.fn(),
}));

const FILLED: FoodRecallView = {
  appointmentId: "a1",
  state: "FILLED",
  recallDate: "2026-09-30",
  recallDateLabel: "Rabu, 30 September",
  entries: [
    { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" },
    { hour: 9, kind: "OLAHRAGA", text: "Senam", by: "DOKTER" },
  ],
  submittedAt: new Date("2026-10-01T02:30:00Z"),
  completedAt: new Date("2026-10-01T03:00:00Z"),
  completedByName: "dr. Diane",
};

function copyStub(has = false, append = true): SubjectiveCopy {
  return { has: vi.fn().mockReturnValue(has), append: vi.fn().mockReturnValue(append) };
}

function renderTab(props: Partial<Parameters<typeof EncounterFoodRecallTab>[0]> = {}) {
  return renderAdmin(
    <EncounterFoodRecallTab foodRecall={FILLED} appointmentCode="SDY-8F3K" patientName="Siti Rahayu" editable copy={copyStub()} {...props} />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("EncounterFoodRecallTab", () => {
  it("menampilkan tabel per jam dengan tanda baris dokter", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Kemarin, Rabu, 30 September" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Food recall Rabu, 30 September" });
    expect(within(table).getByText("Nasi kuning")).toBeInTheDocument();
    expect(within(table).getByText("dilengkapi dokter")).toBeInTheDocument();
    expect(screen.getByText(/Dilengkapi dr\. Diane/)).toBeInTheDocument();
  });

  it("Salin ke S menambahkan ringkasan; salinan kedua meminta konfirmasi", async () => {
    const user = userEvent.setup();
    const copy = copyStub(false);
    const { unmount } = renderTab({ copy });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(copy.append).toHaveBeenCalledWith(
      "Food recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi kuning\n09.00 Olahraga — Senam",
    );
    expect(toast.success).toHaveBeenCalledWith("Food recall disalin ke S.");
    unmount();

    const again = copyStub(true);
    renderTab({ copy: again });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(again.append).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Salin lagi" }));
    expect(again.append).toHaveBeenCalledTimes(1);
  });

  it("tidak memotong S diam-diam bila akan melebihi batas", async () => {
    const user = userEvent.setup();
    renderTab({ copy: copyStub(false, false) });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(toast.error).toHaveBeenCalledWith("Kolom S akan melebihi 5.000 karakter. Ringkas S dulu, lalu salin lagi.");
  });

  it("catatan final: tabel saja, tanpa Salin ke S dan Lengkapi", () => {
    renderTab({ editable: false, copy: undefined });
    expect(screen.getByText("Nasi kuning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salin ke S" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lengkapi" })).not.toBeInTheDocument();
  });

  it("Lengkapi: baris customer tetap, baris baru dikirim tanpa penanda lalu disimpan", async () => {
    const user = userEvent.setup();
    vi.mocked(saveFoodRecallByStaff).mockResolvedValue({ ok: true, data: undefined });
    renderTab({ foodRecall: { ...FILLED, entries: [FILLED.entries[0]] } });
    await user.click(screen.getByRole("button", { name: "Lengkapi" }));
    await user.type(screen.getByLabelText("Isi catatan"), "Teh tawar");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Simpan food recall" }));
    await waitFor(() =>
      expect(saveFoodRecallByStaff).toHaveBeenCalledWith({
        appointmentId: "a1",
        entries: [FILLED.entries[0], { hour: 7, kind: "MAKAN_MINUM", text: "Teh tawar" }],
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("belum diisi: pesan, buka QR dan link, atau isi sendiri", async () => {
    const user = userEvent.setup();
    renderTab({ foodRecall: { ...FILLED, state: "WAITING", entries: [], submittedAt: null, completedAt: null } });
    expect(screen.getByText("Customer belum mengisi food recall.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi sendiri" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Buka QR dan link" }));
    expect(await screen.findByRole("dialog", { name: "Food recall — SDY-8F3K" })).toBeInTheDocument();
  });

  it("tidak ditawarkan saat check-in: bisa ditawarkan sekarang", () => {
    renderTab({ foodRecall: { ...FILLED, state: "NOT_OFFERED", entries: [], submittedAt: null, completedAt: null } });
    expect(screen.getByText("Food recall tidak ditawarkan saat check-in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tawarkan sekarang" })).toBeInTheDocument();
  });
});
