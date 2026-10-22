import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { createTreatmentPackage, setTreatmentPackageActive, updateTreatmentPackage, type CatalogPackage } from "@/server/treatment-package-catalog";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/treatment-package-catalog", () => ({ createTreatmentPackage: vi.fn(), updateTreatmentPackage: vi.fn(), setTreatmentPackageActive: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const services = [
  { id: "s1", name: "Relaxing Facial", categoryName: "Facial Treatment", price: 149_000, costPerSession: 50_000 },
  { id: "s2", name: "Peeling", categoryName: "Peeling", price: 99_000, costPerSession: 30_000 },
];
const slimming = { id: "it9", name: "Slimming", unit: "kapsul", kindLabel: "Obat", sellPrice: 5000, lastUnitCost: 2000 };
const glow: CatalogPackage = {
  id: "p1",
  name: "Facial Glow 5x",
  price: 1_500_000,
  validDays: 180,
  description: null,
  isActive: true,
  sortOrder: 0,
  visitIntervalDays: 7,
  items: [{ serviceId: "s1", itemId: null, serviceName: "Relaxing Facial", unit: null, sessions: 5, perVisit: null }],
  contents: "5× Relaxing Facial",
  soldCount: 2,
  cost: 250_000,
};

beforeEach(() => vi.clearAllMocks());

describe("TreatmentPackageCatalog", () => {
  it("menampilkan paket dengan isi, harga, masa berlaku, dan status", () => {
    renderAdmin(<TreatmentPackageCatalog packages={[glow, { ...glow, id: "p2", name: "Paket Lama", isActive: false }]} services={services} />);
    const list = screen.getByRole("table", { name: "Katalog paket" });
    expect(list).toHaveTextContent("Facial Glow 5x");
    expect(list).toHaveTextContent("5× Relaxing Facial");
    expect(list).toHaveTextContent("Rp 1.500.000");
    expect(list).toHaveTextContent("180 hari");
    expect(list).toHaveTextContent("Nonaktif");
  });

  it("tabel katalog: biaya isi dan selisih; paket yang jadi rugi atau harga belinya belum lengkap ditandai (spec paket informatif PI6)", () => {
    renderAdmin(
      <TreatmentPackageCatalog
        packages={[glow, { ...glow, id: "p2", name: "Paket Rugi", price: 200_000, cost: 250_000 }, { ...glow, id: "p3", name: "Paket Serum", cost: null }]}
        services={services}
      />,
    );
    const list = screen.getByRole("table", { name: "Katalog paket" });
    expect(within(list).getByRole("columnheader", { name: "Biaya isi" })).toBeInTheDocument();
    expect(within(list).getByRole("columnheader", { name: "Selisih" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Facial Glow 5x/ })).toHaveTextContent("Rp 250.000Rp 1.250.00083,3%");
    expect(screen.getByRole("row", { name: /Paket Rugi/ })).toHaveTextContent("-Rp 50.000Biaya naik, perbarui harga");
    expect(screen.getByRole("row", { name: /Paket Serum/ })).toHaveTextContent("Harga beli belum lengkap");
  });

  it("dialog: setiap isi menampilkan harga jual, biaya, satuan, nilai normal; ringkasan menghitung hemat dan selisih (PI1, PI2, PI5)", async () => {
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} stockItems={[slimming]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    expect(dialog).toHaveTextContent("Tampil di tagihan, struk, dan kartu paket customer.");
    expect(dialog).toHaveTextContent("Dibayar customer sekali untuk seluruh isi paket.");
    expect(dialog).toHaveTextContent(/Bila dibeli hari ini: s\.d\. \d{1,2} \S+ \d{4}\./);
    expect(dialog).toHaveTextContent("Catatan internal untuk staf; tidak tampil di tagihan atau struk.");
    await user.type(within(dialog).getByLabelText("Harga paket"), "600000");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.clear(within(dialog).getByLabelText("Jumlah sesi 1"));
    await user.type(within(dialog).getByLabelText("Jumlah sesi 1"), "4");
    const treatment = within(dialog).getByRole("group", { name: "Isi paket 1" });
    expect(treatment).toHaveTextContent("Harga jual Rp 149.000/sesi · biaya Rp 50.000/sesi");
    expect(treatment).toHaveTextContent("1–100 sesi");
    expect(treatment).toHaveTextContent("Nilai normal Rp 596.000");
    expect(treatment).toHaveTextContent("Biaya Rp 200.000");
    await user.click(within(dialog).getByRole("button", { name: "+ Obat / produk" }));
    await user.selectOptions(within(dialog).getByLabelText("Obat / produk 2"), "it9");
    await user.clear(within(dialog).getByLabelText("Jumlah 2"));
    await user.type(within(dialog).getByLabelText("Jumlah 2"), "30");
    const goods = within(dialog).getByRole("group", { name: "Isi paket 2" });
    expect(goods).toHaveTextContent("Harga jual Rp 5.000/kapsul · harga beli terakhir Rp 2.000/kapsul");
    expect(goods).toHaveTextContent("1–1.000 kapsul");
    expect(goods).toHaveTextContent("Nilai normal Rp 150.000");
    const summary = within(dialog).getByRole("region", { name: "Ringkasan paket" });
    expect(summary).toHaveTextContent("Nilai normal isi paketharga jual semua isi bila dibeli satuanRp 746.000");
    expect(summary).toHaveTextContent("Harga paketRp 600.000");
    expect(summary).toHaveTextContent("Customer hematRp 146.000 (19,6%)");
    expect(summary).toHaveTextContent("Total biaya isi paketbiaya treatment + harga beli barangRp 260.000");
    expect(summary).toHaveTextContent("Selisih harga paket − biayaRp 340.000 (56,7%)");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeEnabled();
  });

  it("rencana kunjungan: jarak, jumlah per kunjungan, ringkasan, dan peringatan masa berlaku (spec jadwal paket JP2, JP16)", async () => {
    vi.mocked(createTreatmentPackage).mockResolvedValue({ ok: true, data: { id: "p9" } });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} stockItems={[slimming]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    expect(within(dialog).getByLabelText("Jarak antar kunjungan (hari)")).toHaveValue(7);
    expect(dialog).toHaveTextContent("Kunjungan 1 hari pembelian, berikutnya tiap 7 hari.");
    await user.type(within(dialog).getByLabelText("Nama paket"), "Paket Lux");
    await user.type(within(dialog).getByLabelText("Harga paket"), "2000000");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.clear(within(dialog).getByLabelText("Jumlah sesi 1"));
    await user.type(within(dialog).getByLabelText("Jumlah sesi 1"), "4");
    await user.click(within(dialog).getByRole("button", { name: "+ Obat / produk" }));
    await user.selectOptions(within(dialog).getByLabelText("Obat / produk 2"), "it9");
    await user.clear(within(dialog).getByLabelText("Jumlah 2"));
    await user.type(within(dialog).getByLabelText("Jumlah 2"), "28");
    expect(within(dialog).getByRole("group", { name: "Isi paket 2" })).toHaveTextContent("Otomatis 7 kapsul bila dikosongkan");
    const summary = within(dialog).getByRole("region", { name: "Ringkasan paket" });
    expect(summary).toHaveTextContent("Rencana kunjungan4 kunjungan, ±21 hari");
    await user.type(within(dialog).getByLabelText("Per kunjungan 2"), "10");
    expect(summary).toHaveTextContent("Rencana kunjungan4 kunjungan, ±21 hari");
    await user.clear(within(dialog).getByLabelText("Jarak antar kunjungan (hari)"));
    await user.type(within(dialog).getByLabelText("Jarak antar kunjungan (hari)"), "60");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Rencana kunjungan melewati masa berlaku paket.");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createTreatmentPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          visitIntervalDays: 60,
          items: [
            { serviceId: "s1", sessions: 4 },
            { itemId: "it9", sessions: 28, perVisit: 10 },
          ],
        }),
      ),
    );
  });

  it("harga paket di bawah biaya: pesan dan Simpan nonaktif (PI3)", async () => {
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} stockItems={[slimming]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Harga paket"), "40000");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Harga paket Rp 40.000 di bawah total biaya isi Rp 50.000. Naikkan harga paket atau kurangi isinya.");
    expect(within(dialog).getByRole("region", { name: "Ringkasan paket" })).toHaveTextContent("Selisih harga paket − biaya-Rp 10.000");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("barang tanpa harga beli: ditandai di barisnya dan Simpan nonaktif (PI4)", async () => {
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} stockItems={[{ ...slimming, lastUnitCost: null }]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Harga paket"), "600000");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.click(within(dialog).getByRole("button", { name: "+ Obat / produk" }));
    await user.selectOptions(within(dialog).getByLabelText("Obat / produk 2"), "it9");
    expect(within(dialog).getByRole("group", { name: "Isi paket 2" })).toHaveTextContent("Harga beli belum diisi. Isi di Stok → Barang masuk.");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Harga beli Slimming belum diisi. Isi di Stok → Barang masuk.");
    expect(within(dialog).getByRole("region", { name: "Ringkasan paket" })).toHaveTextContent("Total biaya isi paketbiaya treatment + harga beli barangbelum lengkap");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("menambah paket campuran", async () => {
    vi.mocked(createTreatmentPackage).mockResolvedValue({ ok: true, data: { id: "p9" } });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Nama paket"), "Paket Glowing");
    await user.type(within(dialog).getByLabelText("Harga paket"), "900000");
    await user.clear(within(dialog).getByLabelText("Masa berlaku (hari)"));
    await user.type(within(dialog).getByLabelText("Masa berlaku (hari)"), "90");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.clear(within(dialog).getByLabelText("Jumlah sesi 1"));
    await user.type(within(dialog).getByLabelText("Jumlah sesi 1"), "3");
    await user.click(within(dialog).getByRole("button", { name: "+ Treatment" }));
    await user.selectOptions(within(dialog).getByLabelText("Treatment 2"), "s2");
    await user.clear(within(dialog).getByLabelText("Jumlah sesi 2"));
    await user.type(within(dialog).getByLabelText("Jumlah sesi 2"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createTreatmentPackage).toHaveBeenCalledWith({
        name: "Paket Glowing",
        price: 900_000,
        validDays: 90,
        description: "",
        visitIntervalDays: 7,
        items: [
          { serviceId: "s1", sessions: 3 },
          { serviceId: "s2", sessions: 2 },
        ],
      }),
    );
  });

  it("menambah paket berisi barang (spec paket barang PB1)", async () => {
    vi.mocked(createTreatmentPackage).mockResolvedValue({ ok: true, data: { id: "p9" } });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} stockItems={[slimming]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Nama paket"), "Paket Lux");
    await user.type(within(dialog).getByLabelText("Harga paket"), "2000000");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.click(within(dialog).getByRole("button", { name: "+ Obat / produk" }));
    await user.selectOptions(within(dialog).getByLabelText("Obat / produk 2"), "it9");
    await user.clear(within(dialog).getByLabelText("Jumlah 2"));
    await user.type(within(dialog).getByLabelText("Jumlah 2"), "30");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createTreatmentPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { serviceId: "s1", sessions: 1 },
            { itemId: "it9", sessions: 30 },
          ],
        }),
      ),
    );
  });

  it("tanpa barang stok, tombol + Obat / produk tidak tampil", async () => {
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    expect(within(dialog).queryByRole("button", { name: "+ Obat / produk" })).not.toBeInTheDocument();
  });

  it("galat isian tampil tanpa memanggil server; ubah dan nonaktifkan memanggil aksi dengan id", async () => {
    vi.mocked(updateTreatmentPackage).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(setTreatmentPackageActive).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[glow]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi nama paket.");
    expect(createTreatmentPackage).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tambah paket" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Ubah Facial Glow 5x" }));
    const edit = await screen.findByRole("dialog", { name: "Ubah paket" });
    expect(within(edit).getByLabelText("Nama paket")).toHaveValue("Facial Glow 5x");
    await user.click(within(edit).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateTreatmentPackage).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Facial Glow 5x", items: [{ serviceId: "s1", sessions: 5 }] })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ubah paket" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Nonaktifkan Facial Glow 5x" }));
    await waitFor(() => expect(setTreatmentPackageActive).toHaveBeenCalledWith("p1", false));
  });
});
