import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BiaTab } from "@/components/admin/bia/bia-tab";
import { saveBiaNumbers, startBiaMeasurement, voidBiaMeasurement } from "@/server/bia-actions";
import { biaMeasurement, biaVisit } from "../../fixtures/bia";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/bia-actions", () => ({
  saveBiaNumbers: vi.fn(),
  startBiaMeasurement: vi.fn(),
  voidBiaMeasurement: vi.fn(),
  voidBiaFile: vi.fn(),
}));
vi.mock("@/components/admin/bia/send-files", () => ({ sendBiaFile: vi.fn() }));

const file = (patch: Record<string, unknown> = {}) => ({
  id: "f1",
  originalName: "hasil.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  uploadedByName: "Rina",
  uploadedAt: new Date("2026-10-09T02:42:00Z"),
  previewable: true,
  voided: null,
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("tab BIA halaman kunjungan", () => {
  it("tanpa pengukuran: keterangan kosong, pemilih berkas, dan tombol mengisi angka tanpa berkas", async () => {
    vi.mocked(startBiaMeasurement).mockResolvedValue({ ok: true, data: { measurementId: "m1" } });
    renderAdmin(<BiaTab bia={biaVisit()} appointmentId="a1" />);
    expect(screen.getByText("Belum ada hasil BIA untuk kunjungan ini.")).toBeInTheDocument();
    expect(screen.getByLabelText("Berkas hasil BIA")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Isi angka tanpa berkas" }));
    await waitFor(() => expect(startBiaMeasurement).toHaveBeenCalledWith("a1"));
    expect(refresh).toHaveBeenCalled();
  });

  it("berkas: gambar dibuka di dialog, PDF di tab baru, HEIC sebagai unduhan; berkas dibatalkan diberi tanda", async () => {
    const active = biaMeasurement({
      files: [
        file(),
        file({ id: "f2", originalName: "hasil.pdf", mimeType: "application/pdf" }),
        file({ id: "f3", originalName: "foto.heic", mimeType: "image/heic", previewable: false }),
        file({ id: "f4", originalName: "buram.jpg", voided: { at: new Date(), by: "dr. Diane", reason: "Buram" } }),
      ],
    });
    renderAdmin(<BiaTab bia={biaVisit({ active })} appointmentId="a1" />);
    expect(screen.getByRole("link", { name: "Buka hasil.pdf" })).toHaveAttribute("href", "/admin/bia/berkas/f2");
    expect(screen.getByRole("link", { name: "Buka hasil.pdf" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Unduh foto.heic" })).toHaveAttribute("href", "/admin/bia/berkas/f3?unduh=1");
    expect(screen.getByText("Dibatalkan: Buram")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buka hasil.png" }));
    const preview = await screen.findByRole("dialog", { name: "hasil.png" });
    expect(within(preview).getByRole("img", { name: "Hasil BIA hasil.png" })).toHaveAttribute("src", "/admin/bia/berkas/f1");
  });

  it("menyimpan angka dengan koma desimal, lalu memakai versi baru untuk simpan berikutnya", async () => {
    vi.mocked(saveBiaNumbers).mockResolvedValueOnce({ ok: true, data: { version: 2 } }).mockResolvedValueOnce({ ok: false, error: "Lemak tubuh harus 2–70 %." });
    renderAdmin(<BiaTab bia={biaVisit({ active: biaMeasurement() })} appointmentId="a1" />);
    await userEvent.type(screen.getByLabelText("Lemak tubuh (%)"), "28,5");
    await userEvent.type(screen.getByLabelText("Massa otot (kg)"), "41");
    await userEvent.click(screen.getByRole("button", { name: "Simpan angka BIA" }));
    await waitFor(() =>
      expect(saveBiaNumbers).toHaveBeenCalledWith({
        measurementId: "m1",
        version: 1,
        numbers: { bodyFatPercent: "28,5", muscleMassKg: "41", visceralFat: "", bmr: "", metabolicAge: "", bodyWaterPercent: "", boneMassKg: "" },
        note: "",
      }),
    );
    await userEvent.clear(screen.getByLabelText("Lemak tubuh (%)"));
    await userEvent.type(screen.getByLabelText("Lemak tubuh (%)"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Simpan angka BIA" }));
    await waitFor(() => expect(vi.mocked(saveBiaNumbers).mock.calls[1][0].version).toBe(2));
    expect(await screen.findByText("Lemak tubuh harus 2–70 %.")).toBeInTheDocument();
  });

  it("kunjungan final dengan angka tersimpan: baca-saja, tanpa pemilih berkas, dan hanya bisa dibatalkan", async () => {
    vi.mocked(voidBiaMeasurement).mockResolvedValue({ ok: true, data: undefined });
    const active = biaMeasurement({ numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: 9, bmr: null, metabolicAge: null, bodyWaterPercent: null, boneMassKg: null }, numbersAt: new Date(), numbersByName: "dr. Diane" });
    renderAdmin(<BiaTab bia={biaVisit({ active, final: true })} appointmentId="a1" />);
    expect(screen.queryByRole("button", { name: "Simpan angka BIA" })).toBeNull();
    expect(screen.queryByLabelText("Berkas hasil BIA")).toBeNull();
    expect(screen.getByText("Lemak tubuh")).toBeInTheDocument();
    expect(screen.getByText("28,5 %")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Batalkan pengukuran" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Batalkan pengukuran BIA ini?" });
    await userEvent.type(within(confirm).getByLabelText("Alasan pembatalan"), "Salah pasien");
    await userEvent.click(within(confirm).getByRole("button", { name: "Batalkan pengukuran" }));
    await waitFor(() => expect(voidBiaMeasurement).toHaveBeenCalledWith({ measurementId: "m1", reason: "Salah pasien" }));
  });

  it("tanpa hak menulis (mis. booking online): hanya tampilan, tanpa formulir dan tanpa pembatalan", () => {
    renderAdmin(
      <BiaTab bia={biaVisit({ active: biaMeasurement(), access: { upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view: true } })} appointmentId="a1" />,
    );
    expect(screen.queryByRole("button", { name: "Simpan angka BIA" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Batalkan pengukuran" })).toBeNull();
    expect(screen.getByText("Angka BIA belum diisi.")).toBeInTheDocument();
  });
});
