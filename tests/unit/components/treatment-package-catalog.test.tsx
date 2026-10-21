import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { createTreatmentPackage, setTreatmentPackageActive, updateTreatmentPackage, type TreatmentPackageView } from "@/server/treatment-package-catalog";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/treatment-package-catalog", () => ({ createTreatmentPackage: vi.fn(), updateTreatmentPackage: vi.fn(), setTreatmentPackageActive: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const services = [
  { id: "s1", name: "Relaxing Facial", categoryName: "Facial Treatment" },
  { id: "s2", name: "Peeling", categoryName: "Peeling" },
];
const glow: TreatmentPackageView = {
  id: "p1",
  name: "Facial Glow 5x",
  price: 1_500_000,
  validDays: 180,
  description: null,
  isActive: true,
  sortOrder: 0,
  items: [{ serviceId: "s1", itemId: null, serviceName: "Relaxing Facial", unit: null, sessions: 5 }],
  contents: "5× Relaxing Facial",
  soldCount: 2,
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

  it("menambah paket campuran", async () => {
    vi.mocked(createTreatmentPackage).mockResolvedValue({ ok: true, data: { id: "p9" } });
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Nama paket"), "Paket Glowing");
    await user.type(within(dialog).getByLabelText("Harga"), "900000");
    await user.clear(within(dialog).getByLabelText("Masa berlaku (hari)"));
    await user.type(within(dialog).getByLabelText("Masa berlaku (hari)"), "90");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.clear(within(dialog).getByLabelText("Sesi 1"));
    await user.type(within(dialog).getByLabelText("Sesi 1"), "3");
    await user.click(within(dialog).getByRole("button", { name: "+ Treatment" }));
    await user.selectOptions(within(dialog).getByLabelText("Treatment 2"), "s2");
    await user.clear(within(dialog).getByLabelText("Sesi 2"));
    await user.type(within(dialog).getByLabelText("Sesi 2"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createTreatmentPackage).toHaveBeenCalledWith({
        name: "Paket Glowing",
        price: 900_000,
        validDays: 90,
        description: "",
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
    const stockItems = [{ id: "it9", name: "Slimming", unit: "kapsul", kindLabel: "Obat" }];
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} stockItems={stockItems} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    await user.type(within(dialog).getByLabelText("Nama paket"), "Paket Lux");
    await user.type(within(dialog).getByLabelText("Harga"), "2000000");
    await user.selectOptions(within(dialog).getByLabelText("Treatment 1"), "s1");
    await user.click(within(dialog).getByRole("button", { name: "+ Barang" }));
    await user.selectOptions(within(dialog).getByLabelText("Barang 2"), "it9");
    expect(within(dialog).getByText("kapsul")).toBeInTheDocument();
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

  it("tanpa barang stok, tombol + Barang tidak tampil", async () => {
    const user = userEvent.setup();
    renderAdmin(<TreatmentPackageCatalog packages={[]} services={services} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah paket" });
    expect(within(dialog).queryByRole("button", { name: "+ Barang" })).not.toBeInTheDocument();
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
