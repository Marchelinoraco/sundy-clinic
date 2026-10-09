import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BiaUploadDialog } from "@/components/admin/bia/bia-upload-dialog";
import { sendBiaFile } from "@/components/admin/bia/send-files";
import { listBiaUploads, voidBiaFile } from "@/server/bia-actions";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/bia-actions", () => ({ listBiaUploads: vi.fn(), voidBiaFile: vi.fn() }));
vi.mock("@/components/admin/bia/send-files", () => ({ sendBiaFile: vi.fn() }));

const target = { appointmentId: "a1", code: "SDY-8F3K", patientName: "Siti Rahayu" };
const summary = (files: { id: string; originalName: string; canVoid: boolean }[], canUpload = true) => ({
  ok: true as const,
  data: { canUpload, files: files.map((f) => ({ ...f, uploadedAt: new Date("2026-10-09T02:42:00Z"), uploadedByName: "Rina" })) },
});

beforeEach(() => {
  vi.mocked(listBiaUploads).mockReset();
  vi.mocked(sendBiaFile).mockReset();
  vi.mocked(voidBiaFile).mockReset();
});

describe("dialog unggah hasil BIA", () => {
  it("mengunggah berkas satu per satu, menampilkan hasil per berkas, lalu memuat ulang daftar", async () => {
    vi.mocked(listBiaUploads).mockResolvedValueOnce(summary([])).mockResolvedValueOnce(summary([{ id: "f1", originalName: "hasil.png", canVoid: true }]));
    vi.mocked(sendBiaFile)
      .mockResolvedValueOnce({ name: "hasil.png", ok: true })
      .mockResolvedValueOnce({ name: "palsu.jpg", ok: false, error: "Jenis berkas tidak didukung." });
    renderAdmin(<BiaUploadDialog target={target} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" });
    expect(await within(dialog).findByText("Belum ada berkas BIA untuk booking ini.")).toBeInTheDocument();
    await userEvent.upload(within(dialog).getByLabelText("Berkas hasil BIA"), [
      new File(["x"], "hasil.png", { type: "image/png" }),
      new File(["y"], "palsu.jpg", { type: "image/jpeg" }),
    ]);
    expect(await within(dialog).findByText("hasil.png: terunggah")).toBeInTheDocument();
    expect(within(dialog).getByText("palsu.jpg: Jenis berkas tidak didukung.")).toBeInTheDocument();
    expect(vi.mocked(sendBiaFile).mock.calls.map(([id, file]) => [id, file.name])).toEqual([["a1", "hasil.png"], ["a1", "palsu.jpg"]]);
    await waitFor(() => expect(listBiaUploads).toHaveBeenCalledTimes(2));
    expect(within(dialog).getByRole("listitem", { name: /hasil\.png/ })).toHaveTextContent("Rina");
    // Resepsionis tidak mendapat tautan ke berkas.
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("membatalkan berkas dengan alasan; tombol Batalkan hanya untuk berkas yang boleh", async () => {
    vi.mocked(listBiaUploads).mockResolvedValue(summary([{ id: "f1", originalName: "milik-saya.png", canVoid: true }, { id: "f2", originalName: "milik-lain.png", canVoid: false }]));
    vi.mocked(voidBiaFile).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<BiaUploadDialog target={target} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" });
    await within(dialog).findByText("milik-saya.png");
    expect(within(dialog).getAllByRole("button", { name: /^Batalkan / })).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Batalkan milik-saya.png" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Batalkan berkas milik-saya.png?" });
    await userEvent.type(within(confirm).getByLabelText("Alasan pembatalan"), "Foto buram");
    await userEvent.click(within(confirm).getByRole("button", { name: "Batalkan berkas" }));
    await waitFor(() => expect(voidBiaFile).toHaveBeenCalledWith({ fileId: "f1", reason: "Foto buram" }));
  });

  it("tanpa hak mengunggah (kunjungan final untuk resepsionis): kotak pilih berkas tidak tampil dan alasannya ditulis", async () => {
    vi.mocked(listBiaUploads).mockResolvedValue(summary([], false));
    renderAdmin(<BiaUploadDialog target={target} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Hasil BIA — SDY-8F3K" });
    expect(await within(dialog).findByText("Unggahan sudah ditutup untuk booking ini. Minta dokter menambahkan hasil BIA.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Berkas hasil BIA")).toBeNull();
  });
});
