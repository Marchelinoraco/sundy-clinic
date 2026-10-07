import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DispensingEditor } from "@/components/admin/dispensing/dispensing-editor";
import { DispensingLabel } from "@/components/admin/dispensing/dispensing-label";
import { DispensingSummary } from "@/components/admin/dispensing/dispensing-summary";
import { DispensingTable } from "@/components/admin/dispensing/dispensing-table";
import { DispensingTiles } from "@/components/admin/dispensing/dispensing-tiles";
import { ReopenDispensingButton } from "@/components/admin/dispensing/reopen-dispensing-button";
import type { DispenseItem, DispensingDetail, DispensingRow } from "@/server/dispensing-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  addDispensingLine: vi.fn(),
  updateDispensingLine: vi.fn(),
  removeDispensingLine: vi.fn(),
  completeDispensing: vi.fn(),
  markNoDispensing: vi.fn(),
  reopenDispensing: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/dispensing-drafts", () => ({
  addDispensingLine: mocks.addDispensingLine,
  updateDispensingLine: mocks.updateDispensingLine,
  removeDispensingLine: mocks.removeDispensingLine,
}));
vi.mock("@/server/dispensing-lifecycle", () => ({
  completeDispensing: mocks.completeDispensing,
  markNoDispensing: mocks.markNoDispensing,
  reopenDispensing: mocks.reopenDispensing,
}));

const items: DispenseItem[] = [
  { id: "it1", code: "AMX", name: "Amoxicillin", unit: "kapsul", available: 40 },
  { id: "it2", code: "VITC", name: "Vitamin C", unit: "tablet", available: 0 },
];

function detail(patch: Partial<DispensingDetail> = {}): DispensingDetail {
  return {
    id: "d1",
    version: 3,
    status: "MENUNGGU",
    appointmentId: "a1",
    branchId: "b1",
    branchName: "Manado",
    startAt: new Date("2026-10-07T03:00:00Z"),
    patientName: "Ani Uji",
    note: "Amoxicillin 3x1 selama 5 hari",
    completedAt: null,
    completedByName: null,
    lines: [{ id: "l1", itemId: "it1", itemName: "Amoxicillin", quantity: 15, usage: "3 x 1 sesudah makan" }],
    invoiceState: "NONE",
    canReopen: false,
    ...patch,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("antrean resep", () => {
  const row: DispensingRow = {
    id: "d1",
    status: "MENUNGGU",
    patientName: "Ani Uji",
    branchName: "Manado",
    startAt: new Date("2026-10-07T03:00:00Z"),
    createdAt: new Date("2026-10-07T03:30:00Z"),
    completedAt: null,
    lineCount: 0,
  };

  it("menampilkan pasien, cabang, dan tautan ke rincian", () => {
    render(<DispensingTable rows={[row]} />);
    expect(screen.getByRole("link", { name: "Ani Uji" })).toHaveAttribute("href", "/admin/resep/d1");
    expect(screen.getByText("Manado")).toBeInTheDocument();
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
  });

  it("kosong menampilkan keterangan", () => {
    render(<DispensingTable rows={[]} />);
    expect(screen.getByText("Tidak ada resep di tampilan ini.")).toBeInTheDocument();
  });

  it("kotak dasbor Resep menunggu", () => {
    render(<DispensingTiles pending={3} />);
    const tile = screen.getByRole("link", { name: /Resep menunggu/ });
    expect(tile).toHaveAttribute("href", "/admin/resep");
    expect(tile).toHaveTextContent("3");
  });
});

describe("editor penyerahan", () => {
  it("menampilkan Catatan untuk Apoteker (hanya baca) dan daftar obat", () => {
    render(<DispensingEditor detail={detail()} items={items} />);
    expect(screen.getByText("Amoxicillin 3x1 selama 5 hari")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Amoxicillin")).toHaveValue(15);
    expect(screen.getByLabelText("Aturan pakai Amoxicillin")).toHaveValue("3 x 1 sesudah makan");
  });

  it("menambah obat dengan nomor versi; aturan pakai kosong ditolak di layar", async () => {
    mocks.addDispensingLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    render(<DispensingEditor detail={detail({ lines: [] })} items={items} />);
    await userEvent.selectOptions(screen.getByLabelText("Obat"), "it1");
    await userEvent.clear(screen.getByLabelText("Jumlah"));
    await userEvent.type(screen.getByLabelText("Jumlah"), "10");
    await userEvent.click(screen.getByRole("button", { name: "+ Tambah obat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Isi aturan pakai.");
    expect(mocks.addDispensingLine).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Aturan pakai"), "2 x 1");
    await userEvent.click(screen.getByRole("button", { name: "+ Tambah obat" }));
    await waitFor(() =>
      expect(mocks.addDispensingLine).toHaveBeenCalledWith({ dispensingId: "d1", version: 3, itemId: "it1", quantity: 10, usage: "2 x 1" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("obat yang stoknya habis tidak bisa dipilih", () => {
    render(<DispensingEditor detail={detail()} items={items} />);
    expect(screen.getByRole("option", { name: /Vitamin C/ })).toBeDisabled();
  });

  it("menyimpan dan menghapus baris dengan nomor versi", async () => {
    mocks.updateDispensingLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    mocks.removeDispensingLine.mockResolvedValue({ ok: true, data: { version: 5 } });
    render(<DispensingEditor detail={detail()} items={items} />);
    const quantity = screen.getByLabelText("Jumlah Amoxicillin");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "20");
    await userEvent.click(screen.getByRole("button", { name: "Simpan Amoxicillin" }));
    await waitFor(() =>
      expect(mocks.updateDispensingLine).toHaveBeenCalledWith({ dispensingId: "d1", version: 3, lineId: "l1", quantity: 20, usage: "3 x 1 sesudah makan" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus Amoxicillin" }));
    await waitFor(() => expect(mocks.removeDispensingLine).toHaveBeenCalledWith({ dispensingId: "d1", version: 3, lineId: "l1" }));
  });

  it("Selesai memanggil server dengan versi; pesan stok kurang dari server ditampilkan", async () => {
    mocks.completeDispensing.mockResolvedValue({ ok: false, error: "Stok Amoxicillin tidak cukup (tersedia 8)." });
    render(<DispensingEditor detail={detail()} items={items} />);
    await userEvent.click(screen.getByRole("button", { name: "Selesai" }));
    await waitFor(() => expect(mocks.completeDispensing).toHaveBeenCalledWith({ dispensingId: "d1", version: 3 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stok Amoxicillin tidak cukup (tersedia 8).");
  });

  it("Selesai nonaktif tanpa obat; Tanpa obat nonaktif bila ada obat", async () => {
    mocks.markNoDispensing.mockResolvedValue({ ok: true, data: undefined });
    const { rerender } = render(<DispensingEditor detail={detail({ lines: [] })} items={items} />);
    expect(screen.getByRole("button", { name: "Selesai" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Tanpa obat" }));
    await waitFor(() => expect(mocks.markNoDispensing).toHaveBeenCalledWith({ dispensingId: "d1", version: 3 }));
    rerender(<DispensingEditor detail={detail()} items={items} />);
    expect(screen.getByRole("button", { name: "Tanpa obat" })).toBeDisabled();
  });
});

describe("ringkasan, buka kembali, dan etiket", () => {
  const done = detail({
    status: "SELESAI",
    completedAt: new Date("2026-10-07T04:00:00Z"),
    completedByName: "Apoteker Uji",
    canReopen: true,
  });

  it("ringkasan menampilkan obat, tautan etiket, dan Buka kembali bila boleh", () => {
    render(<DispensingSummary detail={done} />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cetak etiket" })).toHaveAttribute("href", "/admin/resep/d1/etiket");
    expect(screen.getByRole("button", { name: "Buka kembali" })).toBeInTheDocument();
  });

  it("tanpa hak buka kembali (tagihan final) tombolnya tidak ada dan alasannya ditulis", () => {
    render(<DispensingSummary detail={{ ...done, canReopen: false, invoiceState: "FINAL" }} />);
    expect(screen.queryByRole("button", { name: "Buka kembali" })).toBeNull();
    expect(screen.getByText(/tagihan sudah final/i)).toBeInTheDocument();
  });

  it("Buka kembali memanggil server", async () => {
    mocks.reopenDispensing.mockResolvedValue({ ok: true, data: undefined });
    render(<ReopenDispensingButton dispensingId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Buka kembali" }));
    await waitFor(() => expect(mocks.reopenDispensing).toHaveBeenCalledWith({ dispensingId: "d1" }));
  });

  it("etiket memuat klinik, pasien, obat, jumlah, dan aturan pakai, tanpa harga", () => {
    render(<DispensingLabel detail={done} clinicName="SunDY Clinic" />);
    expect(screen.getByText("SunDY Clinic")).toBeInTheDocument();
    expect(screen.getByText("Ani Uji")).toBeInTheDocument();
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText("3 x 1 sesudah makan")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Rp");
    expect(document.body.textContent).not.toContain("Amoxicillin 3x1 selama 5 hari");
  });
});
