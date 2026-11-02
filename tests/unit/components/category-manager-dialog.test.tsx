import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryManagerDialog } from "@/components/admin/service/category-manager-dialog";
import type { ServiceCategoryRow } from "@/server/catalog-admin-read";
import { createServiceCategory, deleteServiceCategory, moveServiceCategory, updateServiceCategory } from "@/server/service-category-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/service-category-admin", () => ({
  createServiceCategory: vi.fn(),
  updateServiceCategory: vi.fn(),
  moveServiceCategory: vi.fn(),
  deleteServiceCategory: vi.fn(),
  removeServiceCategoryPhoto: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const HELP =
  "Bila tidak dicentang, layanan di kategori ini tidak ditawarkan saat pasien lama Aesthetic memilih treatment sendiri di situs. Layanan tetap bisa dipakai di Booking Baru, tagihan, resep, dan paket.";
const ROWS: ServiceCategoryRow[] = [
  { id: "c1", name: "Facial Treatment", description: null, imageUrl: "/foto-kategori/c1-0123abcd.webp", selfBookable: true, serviceCount: 3, siteServiceCount: 2, locked: false },
  { id: "c2", name: "Konsultasi & Jasa", description: "Jasa", imageUrl: null, selfBookable: false, serviceCount: 0, siteServiceCount: 0, locked: false },
  { id: "c3", name: "Slimming & Wellness", description: null, imageUrl: null, selfBookable: false, serviceCount: 4, siteServiceCount: 3, locked: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServiceCategory).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateServiceCategory).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(moveServiceCategory).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(deleteServiceCategory).mockResolvedValue({ ok: true, data: undefined });
});

async function openManager() {
  const user = userEvent.setup();
  renderAdmin(<CategoryManagerDialog categories={ROWS} />);
  await user.click(screen.getByRole("button", { name: "Kelola kategori" }));
  return { user, manager: screen.getByRole("dialog", { name: "Kelola kategori" }) };
}

describe("CategoryManagerDialog (spec kategori layanan KL2–KL8, KL14)", { timeout: 15_000 }, () => {
  it("menampilkan setiap kategori dengan foto, isi, tanda sakelar, urutan, Ubah, dan Hapus; kategori terkunci tanpa Hapus", async () => {
    const { manager } = await openManager();
    const facial = within(manager).getByRole("listitem", { name: "Facial Treatment" });
    // Foto kecil hanya hiasan (alt kosong): nama kategori sudah tertulis di sebelahnya.
    expect(facial.querySelector("img")).toHaveAttribute("src", "/foto-kategori/c1-0123abcd.webp");
    expect(facial).toHaveTextContent("3 layanan internal · 2 layanan situs");
    expect(within(facial).getByRole("button", { name: "Naikkan Facial Treatment" })).toBeDisabled();
    expect(within(facial).getByRole("button", { name: "Turunkan Facial Treatment" })).toBeEnabled();
    expect(within(facial).getByRole("button", { name: "Ubah Facial Treatment" })).toBeInTheDocument();
    expect(within(facial).getByRole("button", { name: "Hapus Facial Treatment" })).toBeInTheDocument();
    expect(facial).not.toHaveTextContent("Tidak dipesan sendiri");

    const jasa = within(manager).getByRole("listitem", { name: "Konsultasi & Jasa" });
    expect(jasa).toHaveTextContent("Tidak dipesan sendiri");
    expect(jasa.querySelector("img")).toBeNull();

    const slimming = within(manager).getByRole("listitem", { name: "Slimming & Wellness" });
    expect(within(slimming).queryByRole("button", { name: "Hapus Slimming & Wellness" })).not.toBeInTheDocument();
    expect(slimming).toHaveTextContent("Berisi Konsultasi Online");
    expect(within(slimming).getByRole("button", { name: "Turunkan Slimming & Wellness" })).toBeDisabled();
  });

  it("menambah kategori: sakelar tercentang dengan teks bantuan; foto diunggah setelah disimpan", async () => {
    const { user, manager } = await openManager();
    await user.click(within(manager).getByRole("button", { name: "+ Kategori" }));
    const add = screen.getByRole("dialog", { name: "Tambah kategori" });
    const toggle = within(add).getByRole("checkbox", { name: "Pasien boleh memilih sendiri di situs" });
    expect(toggle).toBeChecked();
    expect(add).toHaveTextContent(HELP);
    expect(add).toHaveTextContent("Simpan dulu, lalu unggah foto lewat tombol Ubah.");

    await user.click(within(add).getByRole("button", { name: "Simpan" }));
    expect(within(add).getByRole("alert")).toHaveTextContent("Isi nama kategori.");
    expect(createServiceCategory).not.toHaveBeenCalled();

    await user.type(within(add).getByLabelText("Nama kategori"), "Hair Treatment");
    await user.click(toggle);
    await user.click(within(add).getByRole("button", { name: "Simpan" }));
    expect(createServiceCategory).toHaveBeenCalledWith({ name: "Hair Treatment", description: null, selfBookable: false });
  });

  it("mengubah kategori: isian terisi, ada isian foto, dan galat server tampil", async () => {
    const { user, manager } = await openManager();
    await user.click(within(manager).getByRole("button", { name: "Ubah Konsultasi & Jasa" }));
    const edit = screen.getByRole("dialog", { name: "Ubah — Konsultasi & Jasa" });
    expect(within(edit).getByLabelText("Nama kategori")).toHaveValue("Konsultasi & Jasa");
    expect(within(edit).getByLabelText("Deskripsi")).toHaveValue("Jasa");
    expect(within(edit).getByRole("checkbox", { name: "Pasien boleh memilih sendiri di situs" })).not.toBeChecked();
    expect(within(edit).getByLabelText("Berkas foto kategori")).toBeInTheDocument();

    vi.mocked(updateServiceCategory).mockResolvedValueOnce({ ok: false, error: "Kategori dengan nama ini sudah ada." });
    await user.click(within(edit).getByRole("button", { name: "Simpan" }));
    expect(updateServiceCategory).toHaveBeenCalledWith({ id: "c2", name: "Konsultasi & Jasa", description: "Jasa", selfBookable: false });
    expect(await within(edit).findByRole("alert")).toHaveTextContent("Kategori dengan nama ini sudah ada.");
  });

  it("menghapus lewat konfirmasi di dalam dialog; pesan penolakan server tampil", async () => {
    const { user, manager } = await openManager();
    await user.click(within(manager).getByRole("button", { name: "Hapus Facial Treatment" }));
    expect(manager).toHaveTextContent("Hapus kategori Facial Treatment?");
    await user.click(within(manager).getByRole("button", { name: "Batal" }));
    expect(manager).not.toHaveTextContent("Hapus kategori Facial Treatment?");
    expect(deleteServiceCategory).not.toHaveBeenCalled();

    const refusal = "Kategori ini masih berisi 3 layanan internal dan 2 layanan situs. Pindahkan dulu ke kategori lain lewat tombol Ubah pada layanannya.";
    vi.mocked(deleteServiceCategory).mockResolvedValueOnce({ ok: false, error: refusal });
    await user.click(within(manager).getByRole("button", { name: "Hapus Facial Treatment" }));
    await user.click(within(manager).getByRole("button", { name: "Ya, hapus" }));
    expect(deleteServiceCategory).toHaveBeenCalledWith("c1");
    expect(await within(manager).findByRole("alert")).toHaveTextContent(refusal);
  });

  it("naik dan turun memanggil aksi urutan", async () => {
    const { user, manager } = await openManager();
    await user.click(within(manager).getByRole("button", { name: "Naikkan Konsultasi & Jasa" }));
    expect(moveServiceCategory).toHaveBeenCalledWith({ id: "c2", direction: "up" });
    // Tombol urutan nonaktif selama aksi berjalan, supaya dua klik cepat tidak saling menimpa.
    const down = within(manager).getByRole("button", { name: "Turunkan Facial Treatment" });
    await waitFor(() => expect(down).toBeEnabled());
    await user.click(down);
    expect(moveServiceCategory).toHaveBeenCalledWith({ id: "c1", direction: "down" });
  });
});
