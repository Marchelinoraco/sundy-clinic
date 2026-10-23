import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { invoiceTotals } from "@/lib/invoice";
import type { InvoiceDetail } from "@/server/invoice-read";
import { renderAdmin } from "./helpers/render-admin";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  updateInvoiceLine: vi.fn(),
  removeInvoiceLine: vi.fn(),
  setInvoiceDiscount: vi.fn(),
  finalizeInvoice: vi.fn(),
  addInvoiceItem: vi.fn(),
  addFreeLine: vi.fn(),
  refreshCatalogPrices: vi.fn(),
  restorePrescriptionLine: vi.fn(),
  cancelInvoice: vi.fn(),
  takePackageItem: vi.fn(),
  applyPackageVisit: vi.fn(),
  declineDoctorPackage: vi.fn(),
  restoreDoctorPackage: vi.fn(),
}));
vi.mock("@/server/invoice-notes", () => ({ updateInvoiceNotes: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("@/server/approval-pin", () => ({ listApprovers: vi.fn().mockResolvedValue({ ok: true, data: [] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/invoice-drafts", () => ({
  updateInvoiceLine: mocks.updateInvoiceLine,
  removeInvoiceLine: mocks.removeInvoiceLine,
  setInvoiceDiscount: mocks.setInvoiceDiscount,
  addInvoiceItem: mocks.addInvoiceItem,
  addFreeLine: mocks.addFreeLine,
  refreshCatalogPrices: mocks.refreshCatalogPrices,
  setLineDiscount: vi.fn(),
  addPackageLine: vi.fn(),
  applyPackageSession: vi.fn(),
  setLinePerformer: vi.fn(),
  releasePackageSession: vi.fn(),
  clearLineDiscount: vi.fn(),
  reducePrescriptionLine: vi.fn(),
  restorePrescriptionLine: mocks.restorePrescriptionLine,
  takePackageItem: mocks.takePackageItem,
  applyPackageVisit: mocks.applyPackageVisit,
  declineDoctorPackage: mocks.declineDoctorPackage,
  restoreDoctorPackage: mocks.restoreDoctorPackage,
}));
vi.mock("@/server/invoice-lifecycle", () => ({ finalizeInvoice: mocks.finalizeInvoice, cancelInvoice: mocks.cancelInvoice }));
vi.mock("@/server/restock", () => ({ createRestockRequest: vi.fn() }));

describe("penyetuju di draf (spec PIN P11)", () => {
  it("baris yang harganya disetujui menulis 'Harga diubah · disetujui Rina'", () => {
    const base = detail();
    renderAdmin(
      <InvoiceDraftEditor
        detail={{ ...base, lines: base.lines.map((line, index) => (index === 0 ? { ...line, priceNote: "Harga teman", priceApprovedByName: "Rina" } : line)) }}
        items={[]}
        canExceedDiscount={false}
      />,
    );
    expect(screen.getByText("Harga diubah · disetujui Rina")).toBeInTheDocument();
  });

  it("baris bebas yang disetujui menulis 'Baris bebas · disetujui Rina' (spec PIN P13)", () => {
    const base = detail();
    renderAdmin(
      <InvoiceDraftEditor
        detail={{ ...base, lines: base.lines.map((line, index) => (index === 0 ? { ...line, catalogLinked: false, serviceId: null, priceApprovedByName: "Rina" } : line)) }}
        items={[]}
        canExceedDiscount={false}
      />,
    );
    expect(screen.getByText("Baris bebas · disetujui Rina")).toBeInTheDocument();
  });
});

function detail(patch: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const lines: InvoiceDetail["lines"] = [
    { id: "l1", kind: "LAYANAN", name: "Konsultasi Gizi", quantity: 1, unitPrice: 150000, gross: 150000, amount: 150000, discountAmount: 0, discountReason: null, discountSource: null, discountApprovedByName: null, priceNote: null, priceApprovedByName: null, serviceId: "s1", itemId: null, catalogLinked: true, fromDispensing: false, fromDoctorPackage: false, prescription: null, performerId: null, performerName: null, treatmentPackageId: null, packageUse: null, packageNote: null, costing: null },
    { id: "l2", kind: "BARANG", name: "Vitamin C", quantity: 2, unitPrice: 25000, gross: 50000, amount: 50000, discountAmount: 0, discountReason: null, discountSource: null, discountApprovedByName: null, priceNote: null, priceApprovedByName: null, serviceId: null, itemId: "it1", catalogLinked: true, fromDispensing: false, fromDoctorPackage: false, prescription: null, performerId: null, performerName: null, treatmentPackageId: null, packageUse: null, packageNote: null, costing: null },
  ];
  const base = { status: "DRAF" as const, discountKind: null, discountValue: 0, lines, payments: [] };
  return {
    id: "inv1",
    number: null,
    status: "DRAF",
    version: 3,
    patient: { id: "p1", name: "Ani Uji", medicalRecordNumber: "RM-001" },
    branchId: "b1",
    branchName: "Manado",
    appointmentId: "a1",
    dispensing: null,
    visitDate: new Date("2026-10-07T03:00:00Z"),
    discountKind: null,
    discountValue: 0,
    discountReason: null,
    discountByName: null,
    discountApprovedByName: null,
    totals: invoiceTotals(base),
    notes: null,
    createdByName: "Resepsionis Uji",
    createdAt: new Date("2026-10-07T03:00:00Z"),
    finalizedAt: null,
    finalizedByName: null,
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    cancelApprovedByName: null,
    lines,
    payments: [],
    everPaid: false,
    hasPrescription: false,
    dispensingSource: null,
    droppedPrescriptions: [],
    declinedPackages: [],
    margin: null,
    deposit: { booking: 0, saldo: 0, estimate: true },
    depositNotes: [],
    ...patch,
  };
}

const items = [{ id: "it1", code: "VIT-C", name: "Vitamin C", unit: "tablet", sellPrice: 25000, available: 40 }];

beforeEach(() => vi.clearAllMocks());

describe("perkiraan deposit di draf (spec deposit D9)", () => {
  it("deposit booking dan saldo deposit bertanda perkiraan, lalu sisa tagihan", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail({ deposit: { booking: 100000, saldo: 30000, estimate: true } })} items={items} canExceedDiscount={false} />);
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(within(summary).getByText("Deposit booking (perkiraan)").parentElement).toHaveTextContent("-Rp 100.000");
    expect(within(summary).getByText("Saldo deposit (perkiraan)").parentElement).toHaveTextContent("-Rp 30.000");
    expect(within(summary).getByText("Sisa tagihan").parentElement).toHaveTextContent("Rp 70.000");
  });

  it("tanpa deposit tidak ada baris deposit dan sisa tagihan", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(within(summary).queryByText(/Deposit booking/)).toBeNull();
    expect(within(summary).queryByText("Sisa tagihan")).toBeNull();
  });
});

describe("editor draf tagihan", () => {
  it("menampilkan baris, subtotal, dan total", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.getByText("Konsultasi Gizi")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ringkasan tagihan" })).toHaveTextContent("Rp 200.000");
  });

  it("menyimpan perubahan jumlah dengan nomor versi tagihan", async () => {
    mocks.updateInvoiceLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const qty = screen.getByLabelText("Jumlah Vitamin C");
    await userEvent.clear(qty);
    await userEvent.type(qty, "3");
    await userEvent.click(screen.getByRole("button", { name: "Simpan baris Vitamin C" }));
    await waitFor(() =>
      expect(mocks.updateInvoiceLine).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, lineId: "l2", quantity: 3, unitPrice: 25000, priceNote: "" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("harga katalog yang diubah tanpa catatan ditolak di layar sebelum dikirim", async () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const price = screen.getByLabelText("Harga Konsultasi Gizi");
    await userEvent.clear(price);
    await userEvent.type(price, "100000");
    await userEvent.click(screen.getByRole("button", { name: "Simpan baris Konsultasi Gizi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/catatan/i);
    expect(mocks.updateInvoiceLine).not.toHaveBeenCalled();
  });

  it("pesan versi usang dari server ditampilkan", async () => {
    mocks.removeInvoiceLine.mockResolvedValue({ ok: false, error: "Tagihan ini baru diubah orang lain. Muat ulang halaman." });
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Hapus Vitamin C" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Muat ulang halaman");
  });

  it("diskon resepsionis di atas 20% ditolak di layar; Admin Keuangan boleh", async () => {
    mocks.setInvoiceDiscount.mockResolvedValue({ ok: true, data: { version: 4 } });
    const { unmount } = renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.selectOptions(screen.getByLabelText("Jenis diskon"), "PERSEN");
    await userEvent.type(screen.getByLabelText("Nilai diskon"), "30");
    await userEvent.type(screen.getByLabelText("Alasan diskon"), "Kompensasi");
    await userEvent.click(screen.getByRole("button", { name: "Terapkan diskon" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/20%/);
    expect(mocks.setInvoiceDiscount).not.toHaveBeenCalled();
    unmount();

    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount />);
    await userEvent.selectOptions(screen.getByLabelText("Jenis diskon"), "PERSEN");
    await userEvent.type(screen.getByLabelText("Nilai diskon"), "30");
    await userEvent.type(screen.getByLabelText("Alasan diskon"), "Kompensasi");
    await userEvent.click(screen.getByRole("button", { name: "Terapkan diskon" }));
    await waitFor(() =>
      expect(mocks.setInvoiceDiscount).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, kind: "PERSEN", value: 30, reason: "Kompensasi" }),
    );
  });

  it("finalkan: konfirmasi dulu, lalu memanggil server dengan versi", async () => {
    mocks.finalizeInvoice.mockResolvedValue({ ok: true, data: { number: "TG-2026-0001" } });
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Finalkan tagihan" }));
    const dialog = await screen.findByRole("dialog", { name: "Finalkan tagihan?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Finalkan" }));
    await waitFor(() => expect(mocks.finalizeInvoice).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3 }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("tagihan tanpa baris tidak bisa difinalkan", () => {
    const empty = detail({ lines: [], totals: invoiceTotals({ status: "DRAF", discountKind: null, discountValue: 0, lines: [], payments: [] }) });
    renderAdmin(<InvoiceDraftEditor detail={empty} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeDisabled();
  });

  it("selama penyerahan Menunggu: pita status tampil dan Finalkan nonaktif", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail({ dispensing: "MENUNGGU" })} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Menunggu Apoteker menyerahkan obat.");
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeDisabled();
  });

  it("penyerahan Selesai: pita 'Obat sudah diserahkan' dan Finalkan aktif; tanpa penyerahan: tanpa pita", () => {
    const { unmount } = renderAdmin(<InvoiceDraftEditor detail={detail({ dispensing: "SELESAI" })} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Obat sudah diserahkan.");
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeEnabled();
    unmount();
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("baris dari penyerahan: ada tanda, jumlah terkunci, tanpa tombol Hapus; baris lain tetap bisa diubah", () => {
    const base = detail();
    const lines = base.lines.map((line) => (line.id === "l2" ? { ...line, fromDispensing: true } : line));
    renderAdmin(<InvoiceDraftEditor detail={{ ...base, lines }} items={items} canExceedDiscount={false} />);
    expect(screen.getByLabelText("Dari penyerahan Apoteker")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Vitamin C")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Hapus Vitamin C" })).toBeNull();
    expect(screen.getByLabelText("Harga Vitamin C")).toBeEnabled();
    expect(screen.getByLabelText("Jumlah Konsultasi Gizi")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Hapus Konsultasi Gizi" })).toBeInTheDocument();
  });

  it("resep dokter: tanpa pita 'Obat sudah diserahkan' karena tidak ada penyerahan Apoteker", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail({ dispensing: "SELESAI", dispensingSource: "DOKTER" })} items={items} canExceedDiscount={false} />);
    expect(screen.queryByText("Obat sudah diserahkan.")).toBeNull();
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeEnabled();
  });

  it("obat resep yang dijadikan 0 tampil di 'Obat resep tidak ditagih' dan bisa dikembalikan", async () => {
    mocks.restorePrescriptionLine.mockResolvedValue({ ok: true, data: { version: 8 } });
    const base = detail({ dispensing: "SELESAI", dispensingSource: "DOKTER" });
    renderAdmin(
      <InvoiceDraftEditor
        detail={{ ...base, droppedPrescriptions: [{ dispensingLineId: "dl1", name: "Amoxicillin", prescribedQuantity: 10, reason: "Pasien menolak" }] }}
        items={items}
        canExceedDiscount={false}
      />,
    );
    const region = screen.getByRole("region", { name: "Obat resep tidak ditagih" });
    expect(region).toHaveTextContent("Amoxicillin");
    expect(region).toHaveTextContent("resep 10");
    expect(region).toHaveTextContent("Pasien menolak");
    await userEvent.click(within(region).getByRole("button", { name: "Kembalikan Amoxicillin" }));
    await waitFor(() => expect(mocks.restorePrescriptionLine).toHaveBeenCalledWith({ invoiceId: "inv1", version: base.version, dispensingLineId: "dl1" }));
  });

  it("tanpa obat yang dijadikan 0 tidak ada bagian 'Obat resep tidak ditagih'", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.queryByRole("region", { name: "Obat resep tidak ditagih" })).toBeNull();
  });

  it("baris dari resep dokter: label, aturan pakai, tombol Kurangi, dan tautan Cetak etiket (spec resep dokter 4–5)", () => {
    const base = detail();
    const lines = base.lines.map((line) =>
      line.id === "l2" ? { ...line, fromDispensing: true, fromDoctorPackage: false, prescription: { prescribedQuantity: 2, usage: "3 x 1 sesudah makan" } } : line,
    );
    renderAdmin(<InvoiceDraftEditor detail={{ ...base, lines, hasPrescription: true }} items={items} canExceedDiscount={false} />);
    expect(screen.getByLabelText("Dari resep dokter")).toBeInTheDocument();
    expect(screen.getByText(/Dari resep dokter · 3 x 1 sesudah makan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kurangi Vitamin C" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus Vitamin C" })).toBeNull();
    expect(screen.getByRole("link", { name: "Cetak etiket" })).toHaveAttribute("href", "/admin/tagihan/inv1/etiket");
  });

  it("tanpa baris resep dokter tidak ada Cetak etiket", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.queryByRole("link", { name: "Cetak etiket" })).toBeNull();
  });

  it("ringkasan memisahkan Diskon item; setiap baris punya tombol Diskon dan catatan diskonnya", () => {
    const discounted = detail();
    discounted.lines[0] = { ...discounted.lines[0], discountAmount: 10_000, amount: 140_000, discountReason: "Pelanggan lama", discountSource: "MANUAL" };
    discounted.totals = invoiceTotals({ status: "DRAF", discountKind: null, discountValue: 0, lines: discounted.lines, payments: [] });
    renderAdmin(<InvoiceDraftEditor detail={discounted} items={items} canExceedDiscount={false} />);
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(summary).toHaveTextContent("SubtotalRp 200.000");
    expect(summary).toHaveTextContent("Diskon item-Rp 10.000");
    expect(summary).toHaveTextContent("TotalRp 190.000");
    expect(screen.getByRole("button", { name: "Diskon Konsultasi Gizi" })).toBeInTheDocument();
    expect(screen.getByText(/Diskon −Rp 10\.000 · Pelanggan lama/)).toBeInTheDocument();
  });
  it("customer berpaket: kotak info; baris sesi tampil Rp 0 tanpa tombol diskon", () => {
    const withPackage = detail();
    withPackage.lines[0] = {
      ...withPackage.lines[0],
      kind: "TREATMENT",
      unitPrice: 0,
      gross: 0,
      amount: 0,
      packageUse: { patientPackageItemId: "i1", purchaseLineId: null, packageName: "Facial 5x" },
      packageNote: "Sesi paket Facial 5x · sisa 2 dari 5",
    };
    const options = [
      {
        patientPackageItemId: "i1",
        purchaseLineId: null,
        patientPackageId: "p1",
        packageName: "Facial 5x",
        serviceId: "s1",
        itemId: null,
        serviceName: "Konsultasi Gizi",
        unit: null,
        sessions: 5,
        remaining: 2,
        startsOn: "2026-10-01",
        expiresOn: "2027-03-30",
      },
    ];
    renderAdmin(<InvoiceDraftEditor detail={withPackage} items={items} canExceedDiscount={false} packageOptions={options} />);
    expect(screen.getByRole("alert", { name: "Paket customer" })).toHaveTextContent("Customer punya paket aktif: Facial 5x (sisa 2 Konsultasi Gizi; berlaku s.d. 30 Mar 2027).");
    expect(screen.getByText("Sesi paket Facial 5x · sisa 2 dari 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Lepas paket ${withPackage.lines[0].name}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Diskon ${withPackage.lines[0].name}` })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`Harga ${withPackage.lines[0].name}`)).not.toBeInTheDocument();
  });

  it("jatah barang paket: Ambil barang paket membuat baris dari paket yang dibeli di tagihan ini (spec paket barang PB3–PB4)", async () => {
    mocks.takePackageItem.mockResolvedValue({ ok: true, data: { version: 2 } });
    const goods = {
      patientPackageItemId: null,
      purchaseLineId: "pl1",
      patientPackageId: "baru:pl1",
      packageName: "Lux",
      serviceId: null,
      itemId: "it9",
      serviceName: "Slimming",
      unit: "kapsul",
      sessions: 30,
      remaining: 30,
      startsOn: "2026-10-21",
      expiresOn: "2027-04-18",
    };
    const user = userEvent.setup();
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} packageOptions={[goods]} />);
    expect(screen.getByRole("alert", { name: "Paket customer" })).toHaveTextContent("Lux (dibeli di tagihan ini: 30 kapsul Slimming)");
    await user.click(screen.getByRole("button", { name: "Ambil barang paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Ambil barang paket" });
    expect(within(dialog).getByLabelText("Barang")).toHaveValue("baru:pl1:it9");
    await user.clear(within(dialog).getByLabelText("Jumlah"));
    await user.type(within(dialog).getByLabelText("Jumlah"), "31");
    await user.click(within(dialog).getByRole("button", { name: "Ambil" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Jumlah 1–30.");
    await user.clear(within(dialog).getByLabelText("Jumlah"));
    await user.type(within(dialog).getByLabelText("Jumlah"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Ambil" }));
    await waitFor(() =>
      expect(mocks.takePackageItem).toHaveBeenCalledWith({ invoiceId: detail().id, version: detail().version, quantity: 10, itemId: "it9", purchaseLineId: "pl1" }),
    );
  });

  it("rencana kunjungan paket: kotak info menyebut isinya dan tombol Pakai sesuai rencana mengisi draf (spec jadwal paket JP8)", async () => {
    mocks.applyPackageVisit.mockResolvedValue({ ok: true, data: { version: 2 } });
    const plan = {
      patientPackageId: "pp1",
      packageName: "Glowing 3 Bulan",
      visit: {
        number: 2,
        date: "2026-10-29",
        contents: [
          { name: "Facial Brightening", unit: null, quantity: 1 },
          { name: "Slimming Capsule", unit: "kapsul", quantity: 7 },
        ],
      },
    };
    const user = userEvent.setup();
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} visitPlans={[plan]} />);
    const box = screen.getByRole("alert", { name: "Paket customer" });
    expect(box).toHaveTextContent("Glowing 3 Bulan — Rencana kunjungan 2 (29 Okt 2026): Facial Brightening, 7 kapsul Slimming Capsule");
    await user.click(within(box).getByRole("button", { name: "Pakai sesuai rencana Glowing 3 Bulan" }));
    await waitFor(() => expect(mocks.applyPackageVisit).toHaveBeenCalledWith({ invoiceId: detail().id, version: detail().version, patientPackageId: "pp1" }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("paket dari dokter: Tidak dibeli menggantikan Hapus; yang tidak dibeli bisa dikembalikan (spec vital perawat PR2, PR3)", async () => {
    mocks.restoreDoctorPackage.mockResolvedValue({ ok: true, data: { version: 4 } });
    const withPackage = detail();
    withPackage.lines[1] = { ...withPackage.lines[1], id: "l3", kind: "PAKET", name: "Glowing 3 Bulan", fromDoctorPackage: true };
    const user = userEvent.setup();
    renderAdmin(
      <InvoiceDraftEditor
        detail={{ ...withPackage, declinedPackages: [{ encounterPackageId: "ep2", name: "Slim Start", reason: "Mahal" }] }}
        items={items}
        canExceedDiscount={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Tidak dibeli Glowing 3 Bulan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus Glowing 3 Bulan" })).toBeNull();
    expect(screen.getByText("Paket dari dokter")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Paket dari dokter yang tidak dibeli" });
    expect(section).toHaveTextContent("Slim Start · Mahal");
    await user.click(within(section).getByRole("button", { name: "Kembalikan Slim Start" }));
    await waitFor(() => expect(mocks.restoreDoctorPackage).toHaveBeenCalledWith({ invoiceId: detail().id, version: detail().version, encounterPackageId: "ep2" }));
  });

  it("stok meja kurang: baris ditandai dan tombol Minta restock tampil (spec stok meja 4.1)", async () => {
    const base = detail();
    const lines = base.lines.map((line) => (line.id === "l2" ? { ...line, quantity: 5 } : line));
    const counter = [{ id: "it1", code: "VC", name: "Vitamin C", unit: "tablet", kind: "PRODUK" as const, available: 2, expired: 0, counterMinStock: 0, flag: null, requested: false }];
    renderAdmin(
      <InvoiceDraftEditor
        detail={{ ...base, lines }}
        items={items.map((item) => (item.id === "it1" ? { ...item, available: 2 } : item))}
        canExceedDiscount={false}
        restock={{ branchId: "b1", options: counter }}
      />,
    );
    expect(screen.getByText("Stok meja kurang (tersedia 2)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Minta restock" }));
    expect(screen.getByLabelText("Jumlah 1")).toHaveValue(3);
  });

  it("stok meja cukup: tanpa tanda dan tanpa tombol", () => {
    renderAdmin(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} restock={{ branchId: "b1", options: [] }} />);
    expect(screen.queryByText(/Stok meja kurang/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Minta restock" })).toBeNull();
  });
});
