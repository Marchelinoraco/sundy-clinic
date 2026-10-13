import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicePriceTable, type PriceCategory } from "@/components/admin/service-price-table";
import { updateServicePrice } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/service-admin", () => ({ updateServicePrice: vi.fn(), updateServiceCost: vi.fn(), createInternalService: vi.fn(), updateInternalService: vi.fn(), setServiceActive: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NO_COST = { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0, slug: "x", categoryId: "c1", durationMin: 60, requiresDoctor: false, isActive: true, siteCount: 1 };

const CATEGORIES: PriceCategory[] = [
  {
    id: "c1",
    name: "Facial Treatment",
    services: [
      { id: "s1", name: "Relaxing Facial", normalPrice: 189000, promoPrice: 149000, ...NO_COST },
      { id: "s2", name: "Facial Acne", normalPrice: 289000, promoPrice: 249000, ...NO_COST },
    ],
  },
  { id: "c2", name: "Laser Treatment", services: [{ id: "s3", name: "Lip Laser", normalPrice: null, promoPrice: 99000, ...NO_COST }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateServicePrice).mockResolvedValue({ ok: true, data: undefined });
});

describe("ServicePriceTable (spec D 5.4)", () => {
  it("harga dalam rupiah; Simpan dan Batal hanya di baris yang diubah", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServicePriceTable categories={CATEGORIES} categoryOptions={[]} />);
    const card = screen.getByRole("region", { name: "Facial Treatment" });
    expect(card).toHaveTextContent("2 layanan");
    const promo = within(card).getByRole("textbox", { name: "Harga berlaku Relaxing Facial" });
    expect(promo).toHaveValue("Rp 149.000");
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();

    await user.clear(promo);
    await user.type(promo, "159000");
    const row = within(card).getByRole("row", { name: /Relaxing Facial/ });
    expect(within(row).getByRole("button", { name: "Batal" })).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(updateServicePrice).toHaveBeenCalledWith({ id: "s1", normalPrice: 189000, promoPrice: 159000 }));
    await waitFor(() => expect(within(row).queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument());
  });

  it("Batal mengembalikan nilai tersimpan", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServicePriceTable categories={CATEGORIES} categoryOptions={[]} />);
    const promo = screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" });
    await user.type(promo, "1");
    await user.click(within(screen.getByRole("row", { name: /Facial Acne/ })).getByRole("button", { name: "Batal" }));
    expect(promo).toHaveValue("Rp 249.000");
    expect(updateServicePrice).not.toHaveBeenCalled();
  });

  it("harga coret yang dikosongkan dikirim sebagai null (Review Focus 4)", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServicePriceTable categories={CATEGORIES} categoryOptions={[]} />);
    await user.clear(screen.getByRole("textbox", { name: "Harga coret Relaxing Facial" }));
    await user.click(within(screen.getByRole("row", { name: /Relaxing Facial/ })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServicePrice).toHaveBeenCalledWith({ id: "s1", normalPrice: null, promoPrice: 149000 }));
  });

  it("galat server tampil dan baris tetap berubah", async () => {
    const { toast } = await import("sonner");
    vi.mocked(updateServicePrice).mockResolvedValue({ ok: false, error: "Harga coret harus lebih tinggi dari harga berlaku." });
    const user = userEvent.setup();
    renderAdmin(<ServicePriceTable categories={CATEGORIES} categoryOptions={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Harga berlaku Lip Laser" }), "0");
    await user.click(within(screen.getByRole("row", { name: /Lip Laser/ })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Harga coret harus lebih tinggi dari harga berlaku."));
    expect(within(screen.getByRole("row", { name: /Lip Laser/ })).getByRole("button", { name: "Simpan" })).toBeInTheDocument();
  });

  it("cari dan chip kategori menyaring tanpa membuang perubahan", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServicePriceTable categories={CATEGORIES} categoryOptions={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" }), "1");
    await user.click(screen.getByRole("button", { name: "Laser Treatment" }));
    expect(screen.getByRole("button", { name: "Laser Treatment" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: "Facial Treatment" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Semua" }));
    expect(screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" })).toHaveValue("Rp 2.490.001");

    await user.type(screen.getByRole("searchbox", { name: "Cari layanan" }), "relax");
    expect(screen.getByRole("row", { name: /Relaxing Facial/ })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Laser Treatment" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Cari layanan" }));
    await user.type(screen.getByRole("searchbox", { name: "Cari layanan" }), "zzz");
    expect(screen.getByText("Tidak ada layanan yang cocok.")).toBeInTheDocument();
  });

  it("menampilkan durasi, status di situs, dan tombol status; layanan khusus internal ditandai (spec layanan situs 5.1)", async () => {
    const categories: PriceCategory[] = [
      {
        id: "c1",
        name: "Facial Treatment",
        services: [
          { id: "s1", name: "Relaxing Facial", normalPrice: null, promoPrice: 149000, ...NO_COST, durationMin: 45, requiresDoctor: true },
          { id: "s9", name: "Add-on Masker", normalPrice: null, promoPrice: 50000, ...NO_COST, siteCount: 0, isActive: false },
        ],
      },
    ];
    renderAdmin(<ServicePriceTable categories={categories} categoryOptions={[{ id: "c1", name: "Facial Treatment" }]} />);
    const facial = screen.getByRole("row", { name: /Relaxing Facial/ });
    expect(facial).toHaveTextContent("45 menit · perlu dokter");
    expect(facial).toHaveTextContent("1 layanan situs");
    expect(within(facial).getByRole("button", { name: "Nonaktifkan Relaxing Facial" })).toBeInTheDocument();
    expect(within(facial).getByRole("button", { name: "Ubah Relaxing Facial" })).toBeInTheDocument();
    const addon = screen.getByRole("row", { name: /Add-on Masker/ });
    expect(addon).toHaveTextContent("Hanya internal");
    expect(addon).toHaveTextContent("Nonaktif");
    expect(within(addon).getByRole("button", { name: "Aktifkan Add-on Masker" })).toBeInTheDocument();
  });
});
