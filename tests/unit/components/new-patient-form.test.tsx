import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewPatientForm } from "@/components/admin/new-patient-form";
import type { ActionResult } from "@/lib/action-result";
import { checkPatientNik, createPatient, findPatientsByWhatsapp, type NikCheck, type PatientSummary } from "@/server/patient";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/patient", () => ({
  checkPatientNik: vi.fn(),
  createPatient: vi.fn(),
  findPatientsByWhatsapp: vi.fn(),
}));

const NIK = "7171015705900001"; // 17 Mei 1990, perempuan
const OWNER: PatientSummary = {
  id: "p-owner",
  medicalRecordNumber: "SDY-2026-0007",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  lastVisitAt: null,
  nextBookingAt: null,
};
const CREATED: PatientSummary = { ...OWNER, id: "p-new", medicalRecordNumber: "SDY-2026-0099", name: "Siti Rahayu" };

const FREE: ActionResult<NikCheck> = { ok: true, data: { status: "FREE" } };
const TAKEN: ActionResult<NikCheck> = { ok: true, data: { status: "TAKEN", patient: OWNER, birthDateLabel: "17/05/1990" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkPatientNik).mockResolvedValue(FREE);
  vi.mocked(findPatientsByWhatsapp).mockResolvedValue([]);
  vi.mocked(createPatient).mockResolvedValue({ ok: true, data: CREATED });
});

async function openDialog(props: Parameters<typeof NewPatientForm>[0] = {}) {
  const user = userEvent.setup();
  renderAdmin(<NewPatientForm {...props} />);
  await user.click(screen.getByRole("button", { name: "+ Pasien Baru" }));
  const dialog = await screen.findByRole("dialog", { name: "Pasien baru" });
  return { user, dialog };
}

async function fillRest(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText("Nama", { exact: true }), "Siti Rahayu");
  setDateField("Tanggal lahir", "1990-05-17", within(dialog));
  await user.type(within(dialog).getByLabelText("No. HP (WhatsApp)"), "081234567890");
  await user.type(within(dialog).getByLabelText("Nama kontak darurat"), "Budi Rahayu");
  await user.type(within(dialog).getByLabelText("Nomor kontak darurat"), "081298765432");
  await user.type(within(dialog).getByLabelText("Alamat"), "Jl. Sam Ratulangi 10");
}

describe("NewPatientForm", () => {
  it("membuka dialog berisi semua isian", async () => {
    const { dialog } = await openDialog();
    for (const label of ["NIK (16 angka)", "No. HP (WhatsApp)", "Email (opsional)", "Nama kontak darurat", "Nomor kontak darurat", "Alamat", "Status pernikahan (opsional)"]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByLabelText("Nama", { exact: true })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Tanggal lahir" })).toBeInTheDocument();
  });

  describe("cek NIK", () => {
    it("memeriksa begitu 16 angka diketik dan menampilkan 'belum terdaftar'", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "7171 0157 0590 0001");
      expect(await within(dialog).findByText("NIK belum terdaftar.")).toBeInTheDocument();
      expect(checkPatientNik).toHaveBeenCalledTimes(1);
      expect(checkPatientNik).toHaveBeenCalledWith(NIK);
    });

    it("tidak memeriksa sebelum 16 angka lengkap", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "71710157");
      expect(checkPatientNik).not.toHaveBeenCalled();
    });

    it("NIK sudah terdaftar: kartu pasien, Simpan nonaktif, dan 'Pakai pasien ini'", async () => {
      vi.mocked(checkPatientNik).mockResolvedValue(TAKEN);
      const onPickExisting = vi.fn();
      const { user, dialog } = await openDialog({ onPickExisting });
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);

      expect(await within(dialog).findByText("NIK sudah terdaftar")).toBeInTheDocument();
      const card = within(dialog).getByText("NIK sudah terdaftar").closest("[role='alert']") as HTMLElement;
      expect(card).toHaveTextContent("Maria Wenas");
      expect(card).toHaveTextContent("SDY-2026-0007");
      expect(card).toHaveTextContent("17/05/1990");
      expect(card).toHaveTextContent("6281234567001");
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeDisabled();

      await user.click(within(card).getByRole("button", { name: "Pakai pasien ini" }));
      expect(onPickExisting).toHaveBeenCalledWith(OWNER);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pasien baru" })).not.toBeInTheDocument());
    });

    it("tanpa onPickExisting kartu menawarkan tautan ke data pasien", async () => {
      vi.mocked(checkPatientNik).mockResolvedValue(TAKEN);
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      const link = await within(dialog).findByRole("link", { name: "Buka data pasien" });
      expect(link).toHaveAttribute("href", "/admin/pasien/p-owner");
      expect(within(dialog).queryByRole("button", { name: "Pakai pasien ini" })).not.toBeInTheDocument();
    });

    it("peringatan (tidak menghalangi) bila tanggal lahir tidak cocok dengan kode di NIK", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      setDateField("Tanggal lahir", "1991-01-01", within(dialog));
      expect(await within(dialog).findByText("Tanggal lahir di NIK berbeda dengan data pasien — periksa KTP.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeEnabled();
    });

    it("hasil untuk NIK lama tidak menandai NIK baru sebagai terdaftar", async () => {
      let resolveFirst!: (value: ActionResult<NikCheck>) => void;
      vi.mocked(checkPatientNik)
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(FREE);
      const { user, dialog } = await openDialog();
      const input = within(dialog).getByLabelText("NIK (16 angka)");

      await user.type(input, NIK); // pemeriksaan pertama menggantung
      await user.clear(input);
      await user.type(input, "7171015705900002");
      expect(await within(dialog).findByText("NIK belum terdaftar.")).toBeInTheDocument();

      resolveFirst(TAKEN); // jawaban terlambat untuk NIK yang sudah diganti
      await waitFor(() => expect(checkPatientNik).toHaveBeenCalledTimes(2));
      expect(within(dialog).queryByText("NIK sudah terdaftar")).not.toBeInTheDocument();
      expect(within(dialog).getByText("NIK belum terdaftar.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeEnabled();
    });

    it("pemeriksaan yang gagal tidak menghalangi menyimpan", async () => {
      vi.mocked(checkPatientNik).mockRejectedValue(new Error("jaringan"));
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      expect(await within(dialog).findByText(/belum bisa diperiksa sekarang/)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Buat Pasien" })).toBeEnabled();
    });

    it("'Belum ada NIK' dengan alasan melewati pemeriksaan", async () => {
      const { user, dialog } = await openDialog();
      await user.click(within(dialog).getByRole("radio", { name: "Belum ada NIK" }));
      await user.selectOptions(within(dialog).getByLabelText("Alasan"), "ANAK");
      expect(checkPatientNik).not.toHaveBeenCalled();
    });
  });

  describe("menyimpan", () => {
    it("mengirim data lengkap, memanggil onCreated, dan menutup dialog", async () => {
      const onCreated = vi.fn();
      const { user, dialog } = await openDialog({ onCreated });
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "7171 0157 0590 0001");
      await fillRest(user, dialog);
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));

      await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
      expect(createPatient).toHaveBeenCalledWith({
        nik: "7171 0157 0590 0001",
        nikMissingReason: null,
        name: "Siti Rahayu",
        birthDate: "1990-05-17",
        whatsapp: "081234567890",
        email: "",
        emergencyContactName: "Budi Rahayu",
        emergencyContactPhone: "081298765432",
        address: "Jl. Sam Ratulangi 10",
        maritalStatus: null,
      });
      expect(onCreated).toHaveBeenCalledWith(CREATED);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pasien baru" })).not.toBeInTheDocument());
    });

    it("email dan status pernikahan yang diisi ikut terkirim", async () => {
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      await fillRest(user, dialog);
      await user.type(within(dialog).getByLabelText("Email (opsional)"), "siti@example.com");
      await user.selectOptions(within(dialog).getByLabelText("Status pernikahan (opsional)"), "MENIKAH");
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      await waitFor(() => expect(createPatient).toHaveBeenCalled());
      expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ email: "siti@example.com", maritalStatus: "MENIKAH" }));
    });

    it("alasan belum ada NIK dikirim tanpa NIK", async () => {
      const { user, dialog } = await openDialog();
      await user.click(within(dialog).getByRole("radio", { name: "Belum ada NIK" }));
      await user.selectOptions(within(dialog).getByLabelText("Alasan"), "ANAK");
      await fillRest(user, dialog);
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      await waitFor(() => expect(createPatient).toHaveBeenCalled());
      expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ nik: null, nikMissingReason: "ANAK" }));
    });

    it("isian wajib yang kosong menampilkan galat per isian dan tidak memanggil server", async () => {
      const { user, dialog } = await openDialog();
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      for (const message of [
        "Isi NIK 16 angka, atau pilih alasan belum ada NIK.",
        "Nama pasien wajib diisi.",
        "Tanggal lahir wajib diisi.",
        "Nomor HP (WhatsApp) wajib diisi.",
        "Nama kontak darurat wajib diisi.",
        "Nomor kontak darurat wajib diisi.",
        "Alamat wajib diisi.",
      ]) {
        expect(within(dialog).getByText(message)).toBeInTheDocument();
      }
      expect(createPatient).not.toHaveBeenCalled();
    });

    it("galat dari server tampil di dalam dialog dan dialog tetap terbuka", async () => {
      vi.mocked(createPatient).mockResolvedValue({ ok: false, error: "NIK ini sudah terdaftar atas nama Maria Wenas (SDY-2026-0007)." });
      const { user, dialog } = await openDialog();
      await user.type(within(dialog).getByLabelText("NIK (16 angka)"), NIK);
      await fillRest(user, dialog);
      await user.click(within(dialog).getByRole("button", { name: "Buat Pasien" }));
      expect(await within(dialog).findByText("NIK ini sudah terdaftar atas nama Maria Wenas (SDY-2026-0007).")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Pasien baru" })).toBeInTheDocument();
    });
  });

  it("peringatan nomor WhatsApp yang sama tetap ada, dengan 'Pakai pasien ini'", async () => {
    vi.mocked(findPatientsByWhatsapp).mockResolvedValue([OWNER]);
    const onPickExisting = vi.fn();
    const { user, dialog } = await openDialog({ onPickExisting });
    const phone = within(dialog).getByLabelText("No. HP (WhatsApp)");
    await user.type(phone, "081234567001");
    await user.tab();
    expect(await within(dialog).findByText("Nomor ini sudah terdaftar. Pastikan ini bukan pasien yang sama:")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Pakai pasien ini" }));
    expect(onPickExisting).toHaveBeenCalledWith(OWNER);
  });

  it("klik latar tidak menutup dialog, tombol Batal menutupnya", async () => {
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText("Nama", { exact: true }), "Terlanjur diketik");
    await user.click(document.querySelector(".MuiBackdrop-root") as HTMLElement);
    expect(screen.getByRole("dialog", { name: "Pasien baru" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pasien baru" })).not.toBeInTheDocument());
  });
});
