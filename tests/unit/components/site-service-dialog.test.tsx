import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteServiceDialog } from "@/components/admin/service/site-service-dialog";
import { createSiteService, updateSiteService } from "@/server/site-service-admin";
import type { SiteServiceRow } from "@/server/catalog-admin-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/site-service-admin", () => ({ createSiteService: vi.fn(), updateSiteService: vi.fn(), removeSiteServicePhoto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const CATEGORIES = [
  { id: "c1", name: "Facial Treatment" },
  { id: "c2", name: "Laser Treatment" },
];
const SERVICES = [
  { id: "s1", name: "Relaxing Facial", categoryId: "c1", price: 149_000, isActive: true },
  { id: "s2", name: "Lip Laser", categoryId: "c2", price: 99_000, isActive: true },
];
const ROW: SiteServiceRow = {
  id: "ss1",
  slug: "lip-laser",
  name: "Lip Laser",
  description: null,
  imageUrl: null,
  priceNote: null,
  isSignature: false,
  isActive: true,
  sortOrder: 3,
  categoryId: "c2",
  serviceId: "s2",
  serviceName: "Lip Laser",
  servicePrice: 99_000,
  serviceNormalPrice: null,
  serviceActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSiteService).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateSiteService).mockResolvedValue({ ok: true, data: undefined });
});

describe("SiteServiceDialog (spec layanan situs 5.2)", () => {
  it("memilih layanan internal mengisi nama, kategori, dan slug; harga ikut layanan internal", async () => {
    const user = userEvent.setup();
    renderAdmin(<SiteServiceDialog categories={CATEGORIES} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan situs" }));
    expect(screen.getByRole("dialog", { name: "Tambah layanan situs" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Layanan internal" }));
    await user.click(await screen.findByRole("option", { name: "Lip Laser — Rp 99.000" }));
    expect(screen.getByLabelText("Nama di situs")).toHaveValue("Lip Laser");
    expect(screen.getByLabelText("Kategori")).toHaveValue("c2");
    expect(screen.getByLabelText("Alamat (slug)")).toHaveValue("lip-laser");
    expect(screen.getByText("Harga di situs: Rp 99.000 (ikut layanan internal)")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Nama di situs"));
    await user.type(screen.getByLabelText("Nama di situs"), "Lip Laser Promo");
    expect(screen.getByLabelText("Alamat (slug)")).toHaveValue("lip-laser-promo");
    expect(screen.getByText("Simpan dulu, lalu unggah foto lewat tombol Ubah.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createSiteService).toHaveBeenCalledWith({
        serviceId: "s2",
        name: "Lip Laser Promo",
        slug: "lip-laser-promo",
        categoryId: "c2",
        description: null,
        priceNote: null,
        isSignature: false,
        sortOrder: 0,
      }),
    );
  });

  it("slug yang disentuh tidak lagi mengikuti nama; mengubah slug lama memberi peringatan", async () => {
    const user = userEvent.setup();
    renderAdmin(<SiteServiceDialog categories={CATEGORIES} services={SERVICES} row={ROW} />);
    await user.click(screen.getByRole("button", { name: "Ubah Lip Laser" }));
    expect(screen.getByRole("dialog", { name: "Ubah — Lip Laser" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nama di situs"), " Baru");
    expect(screen.getByLabelText("Alamat (slug)")).toHaveValue("lip-laser");
    expect(screen.queryByText("Tautan lama ke halaman ini akan rusak.")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Alamat (slug)"));
    await user.type(screen.getByLabelText("Alamat (slug)"), "lip-laser-baru");
    expect(screen.getByText("Tautan lama ke halaman ini akan rusak.")).toBeInTheDocument();
    expect(screen.getByLabelText("Berkas foto layanan")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateSiteService).toHaveBeenCalledWith({
        id: "ss1",
        serviceId: "s2",
        name: "Lip Laser Baru",
        slug: "lip-laser-baru",
        categoryId: "c2",
        description: null,
        priceNote: null,
        isSignature: false,
        sortOrder: 3,
      }),
    );
  });

  it("galat validasi tampil tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderAdmin(<SiteServiceDialog categories={CATEGORIES} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan situs" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Pilih layanan internal.")).toBeInTheDocument();
    expect(createSiteService).not.toHaveBeenCalled();
  });
});
