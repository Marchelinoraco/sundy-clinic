import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyPackageDialog } from "@/components/admin/package/legacy-package-dialog";
import type { LegacyCatalogPackage } from "@/lib/legacy-package";
import { createLegacyPackage, findLegacyDuplicates } from "@/server/legacy-packages";
import { findPatientsByWhatsapp, searchPatients, type PatientSummary } from "@/server/patient";
import { dateFieldValue, setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

// Dialog paket lama dari Kluto (spec paket lama bagian 4; rencana Task 6).
vi.mock("@/server/legacy-packages", () => ({ createLegacyPackage: vi.fn(), findLegacyDuplicates: vi.fn() }));
vi.mock("@/server/patient", () => ({ searchPatients: vi.fn(), findPatientsByWhatsapp: vi.fn(), checkPatientNik: vi.fn(), createPatient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TODAY = "2026-11-11";
const catalog: LegacyCatalogPackage[] = [
  {
    id: "lux",
    name: "Lux",
    isActive: true,
    visitIntervalDays: 7,
    items: [
      { id: "f", name: "Facial", unit: null, sessions: 4, perVisit: null },
      { id: "k", name: "Kapsul Slim", unit: "kapsul", sessions: 28, perVisit: 7 },
    ],
  },
  { id: "old", name: "Lawas", isActive: false, visitIntervalDays: 14, items: [{ id: "o", name: "Peeling", unit: null, sessions: 2, perVisit: null }] },
];
const ani: PatientSummary = { id: "p1", medicalRecordNumber: "RM-2026-0012", name: "Ani", whatsapp: "6281200001111", programStatus: "AKTIF", lastVisitAt: null, nextBookingAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchPatients).mockResolvedValue([ani]);
  vi.mocked(findLegacyDuplicates).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(findPatientsByWhatsapp).mockResolvedValue([]);
});

async function openWithAni() {
  const user = userEvent.setup();
  renderAdmin(<LegacyPackageDialog catalog={catalog} today={TODAY} />);
  await user.click(screen.getByRole("button", { name: "+ Paket lama (Kluto)" }));
  const dialog = await screen.findByRole("dialog", { name: "Paket lama (Kluto)" });
  await user.type(within(dialog).getByRole("combobox", { name: /Cari pasien/ }), "Ani");
  await user.click(await screen.findByRole("option", { name: /Ani/ }));
  await user.selectOptions(within(dialog).getByLabelText("Paket"), "lux");
  return { user, dialog };
}

describe("LegacyPackageDialog", () => {
  it("jumlah kunjungan mengisi otomatis yang sudah dipakai; angka ubahan tangan tidak ditimpa", async () => {
    const { user, dialog } = await openWithAni();
    expect(within(dialog).getByRole("option", { name: "Lawas · tidak dijual lagi" })).toBeInTheDocument();
    const visits = within(dialog).getByLabelText("Jumlah kunjungan di Kluto");
    await user.clear(visits);
    await user.type(visits, "3");
    expect(within(dialog).getByLabelText("Sudah dipakai Facial")).toHaveValue(3);
    expect(within(dialog).getByLabelText("Sudah diambil Kapsul Slim")).toHaveValue(21);
    expect(dialog).toHaveTextContent("Sisa 1");
    expect(dialog).toHaveTextContent("Sisa 7");

    const capsules = within(dialog).getByLabelText("Sudah diambil Kapsul Slim");
    await user.clear(capsules);
    await user.type(capsules, "20");
    await user.clear(visits);
    await user.type(visits, "2");
    expect(within(dialog).getByLabelText("Sudah dipakai Facial")).toHaveValue(2);
    expect(within(dialog).getByLabelText("Sudah diambil Kapsul Slim")).toHaveValue(20);
  });

  it("kunjungan berikutnya bawaan hari ini + jarak katalog, bisa dikosongkan", async () => {
    const { user, dialog } = await openWithAni();
    expect(dateFieldValue("Kunjungan berikutnya", within(dialog))).toBe("2026-11-18");
    await user.click(within(dialog).getByRole("button", { name: "Kosongkan" }));
    expect(dateFieldValue("Kunjungan berikutnya", within(dialog))).toBe("");
  });

  it("paket lama ganda: peringatan tampil dan Simpan terkunci sampai dicentang 'Ini paket yang berbeda'", async () => {
    vi.mocked(findLegacyDuplicates).mockResolvedValue({ ok: true, data: [{ patientPackageId: "pp0", enteredOn: "2026-11-10", staffName: "Rina", remainingLabel: "2× Facial" }] });
    const { user, dialog } = await openWithAni();
    await waitFor(() => expect(dialog).toHaveTextContent("Rina"));
    expect(dialog).toHaveTextContent("2× Facial");
    const save = within(dialog).getByRole("button", { name: "Simpan" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "Ini paket yang berbeda" }));
    expect(save).toBeEnabled();
  });

  it("menyimpan pasien terpilih dengan isian lengkap, lalu 'Tambah paket lama lain' mengosongkan dialog", async () => {
    vi.mocked(createLegacyPackage).mockResolvedValue({ ok: true, data: { patientPackageId: "pp1", patientId: "p1", summary: "Paket Lux untuk Ani (RM-2026-0012): sisa 1× Facial, 7 kapsul Kapsul Slim" } });
    const { user, dialog } = await openWithAni();
    const visits = within(dialog).getByLabelText("Jumlah kunjungan di Kluto");
    await user.clear(visits);
    await user.type(visits, "3");
    setDateField("Tanggal beli di Kluto", "2025-03-01", within(dialog));
    await user.type(within(dialog).getByLabelText("Catatan (opsional)"), "Nota 9");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createLegacyPackage).toHaveBeenCalledWith({
        patient: { id: "p1" },
        form: { packageId: "lux", boughtOn: "2025-03-01", priorVisits: 3, used: { f: 3, k: 21 }, nextVisitOn: "2026-11-18", note: "Nota 9", confirmDuplicate: false },
      }),
    );
    expect(await within(dialog).findByText(/Paket Lux untuk Ani/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Lihat paket" })).toHaveAttribute("href", "/admin/paket/pp1");
    await user.click(within(dialog).getByRole("button", { name: "Tambah paket lama lain" }));
    expect(within(dialog).getByRole("combobox", { name: /Cari pasien/ })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Paket")).not.toBeInTheDocument();
  });

  it("galat isian ditampilkan tanpa memanggil server", async () => {
    const { user, dialog } = await openWithAni();
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByText("Isi tanggal beli di Kluto.")).toBeInTheDocument();
    expect(createLegacyPackage).not.toHaveBeenCalled();
  });

  it("jumlah kunjungan di Kluto wajib diisi: dimulai kosong, simpan ditolak bila dilewati (temuan review akhir)", async () => {
    const { user, dialog } = await openWithAni();
    expect(within(dialog).getByLabelText("Jumlah kunjungan di Kluto")).toHaveValue(null);
    setDateField("Tanggal beli di Kluto", "2025-03-01", within(dialog));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByText("Jumlah kunjungan di Kluto 0–1000.")).toBeInTheDocument();
    expect(createLegacyPackage).not.toHaveBeenCalled();
  });

  it("'Ganti' pasien membersihkan peringatan paket ganda pasien sebelumnya (temuan review akhir)", async () => {
    vi.mocked(findLegacyDuplicates).mockResolvedValue({ ok: true, data: [{ patientPackageId: "pp0", enteredOn: "2026-11-10", staffName: "Rina", remainingLabel: "2× Facial" }] });
    const { user, dialog } = await openWithAni();
    await waitFor(() => expect(dialog).toHaveTextContent("Rina"));
    await user.click(within(dialog).getByRole("button", { name: "Ganti" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Pasien belum ada di SunDY" }));
    expect(dialog).not.toHaveTextContent("Pasien ini sudah punya paket lama ini");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeEnabled();
  });

  it("pasien belum ada: WA yang sudah terdaftar menawarkan 'Pakai pasien ini' (Review Focus 1)", async () => {
    vi.mocked(findPatientsByWhatsapp).mockResolvedValue([ani]);
    const user = userEvent.setup();
    renderAdmin(<LegacyPackageDialog catalog={catalog} today={TODAY} />);
    await user.click(screen.getByRole("button", { name: "+ Paket lama (Kluto)" }));
    const dialog = await screen.findByRole("dialog", { name: "Paket lama (Kluto)" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Pasien belum ada di SunDY" }));
    await user.type(within(dialog).getByLabelText("Nama pasien"), "Ani Baru");
    await user.type(within(dialog).getByLabelText("No. HP (WhatsApp)"), "081200001111");
    await user.tab();
    expect(await within(dialog).findByText(/Nomor ini sudah terdaftar/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Pakai pasien ini" }));
    expect(dialog).toHaveTextContent("Ani · RM-2026-0012");
    expect(within(dialog).queryByLabelText("Nama pasien")).not.toBeInTheDocument();
  });
});
