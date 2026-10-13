import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalServiceDialog } from "@/components/admin/service/internal-service-dialog";
import { createInternalService, updateInternalService } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/service-admin", () => ({ createInternalService: vi.fn(), updateInternalService: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const CATEGORIES = [
  { id: "c1", name: "Facial Treatment" },
  { id: "c2", name: "Laser Treatment" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createInternalService).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateInternalService).mockResolvedValue({ ok: true, data: undefined });
});

describe("InternalServiceDialog (spec layanan situs 5.1)", () => {
  it("menambah layanan internal dengan isian lengkap", async () => {
    const user = userEvent.setup();
    renderAdmin(<InternalServiceDialog categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan internal" }));
    const dialog = screen.getByRole("dialog", { name: "Tambah layanan internal" });
    await user.type(screen.getByLabelText("Nama"), "Add-on Masker");
    await user.selectOptions(screen.getByLabelText("Kategori"), "c2");
    await user.type(screen.getByLabelText("Harga berlaku"), "75000");
    await user.clear(screen.getByLabelText("Durasi (menit)"));
    await user.type(screen.getByLabelText("Durasi (menit)"), "45");
    await user.click(screen.getByLabelText("Perlu dokter"));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(createInternalService).toHaveBeenCalledWith({ name: "Add-on Masker", categoryId: "c2", promoPrice: 75_000, normalPrice: null, durationMin: 45, requiresDoctor: true }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan galat validasi tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderAdmin(<InternalServiceDialog categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: "+ Layanan internal" }));
    await user.type(screen.getByLabelText("Nama"), "Add-on");
    await user.type(screen.getByLabelText("Harga berlaku"), "75000");
    await user.clear(screen.getByLabelText("Durasi (menit)"));
    await user.type(screen.getByLabelText("Durasi (menit)"), "20");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Durasi 15–480 menit, kelipatan 15.")).toBeInTheDocument();
    expect(createInternalService).not.toHaveBeenCalled();
  });

  it("mengubah layanan yang ada; galat server tampil", async () => {
    vi.mocked(updateInternalService).mockResolvedValue({ ok: false, error: "Nama layanan sudah dipakai layanan lain." });
    const user = userEvent.setup();
    renderAdmin(
      <InternalServiceDialog
        categories={CATEGORIES}
        service={{ id: "s1", name: "Relaxing Facial", categoryId: "c1", normalPrice: 189_000, promoPrice: 149_000, durationMin: 60, requiresDoctor: false }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ubah Relaxing Facial" }));
    expect(screen.getByRole("dialog", { name: "Ubah — Relaxing Facial" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama")).toHaveValue("Relaxing Facial");
    expect(screen.getByLabelText("Harga coret (opsional)")).toHaveValue("Rp 189.000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateInternalService).toHaveBeenCalledWith({ id: "s1", name: "Relaxing Facial", categoryId: "c1", promoPrice: 149_000, normalPrice: 189_000, durationMin: 60, requiresDoctor: false }),
    );
    expect(await screen.findByText("Nama layanan sudah dipakai layanan lain.")).toBeInTheDocument();
  });
});
