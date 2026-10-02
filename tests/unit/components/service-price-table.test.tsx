import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicePriceTable, type PriceCategory } from "@/components/admin/service-price-table";
import { updateServicePrice } from "@/server/service-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/service-admin", () => ({ updateServicePrice: vi.fn() }));

const CATEGORIES: PriceCategory[] = [
  {
    id: "c1",
    name: "Facial Treatment",
    services: [
      { id: "s1", name: "Relaxing Facial", normalPrice: 189000, promoPrice: 149000 },
      { id: "s2", name: "Facial Acne", normalPrice: 289000, promoPrice: 249000 },
    ],
  },
  { id: "c2", name: "Laser Treatment", services: [{ id: "s3", name: "Lip Laser", normalPrice: null, promoPrice: 99000 }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateServicePrice).mockResolvedValue({ ok: true, data: undefined });
});

describe("ServicePriceTable (spec D 5.4)", () => {
  it("harga dalam rupiah; Simpan dan Batal hanya di baris yang diubah", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
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
    render(<ServicePriceTable categories={CATEGORIES} />);
    const promo = screen.getByRole("textbox", { name: "Harga berlaku Facial Acne" });
    await user.type(promo, "1");
    await user.click(within(screen.getByRole("row", { name: /Facial Acne/ })).getByRole("button", { name: "Batal" }));
    expect(promo).toHaveValue("Rp 249.000");
    expect(updateServicePrice).not.toHaveBeenCalled();
  });

  it("harga coret yang dikosongkan dikirim sebagai null (Review Focus 4)", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    await user.clear(screen.getByRole("textbox", { name: "Harga coret Relaxing Facial" }));
    await user.click(within(screen.getByRole("row", { name: /Relaxing Facial/ })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServicePrice).toHaveBeenCalledWith({ id: "s1", normalPrice: null, promoPrice: 149000 }));
  });

  it("galat server tampil dan baris tetap berubah", async () => {
    const { toast } = await import("sonner");
    vi.mocked(updateServicePrice).mockResolvedValue({ ok: false, error: "Harga coret harus lebih tinggi dari harga berlaku." });
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
    await user.type(screen.getByRole("textbox", { name: "Harga berlaku Lip Laser" }), "0");
    await user.click(within(screen.getByRole("row", { name: /Lip Laser/ })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Harga coret harus lebih tinggi dari harga berlaku."));
    expect(within(screen.getByRole("row", { name: /Lip Laser/ })).getByRole("button", { name: "Simpan" })).toBeInTheDocument();
  });

  it("cari dan chip kategori menyaring tanpa membuang perubahan", async () => {
    const user = userEvent.setup();
    render(<ServicePriceTable categories={CATEGORIES} />);
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
});
