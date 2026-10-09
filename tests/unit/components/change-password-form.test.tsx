import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { changeOwnPassword } from "@/server/own-password";
import { renderAdmin } from "../helpers/render-admin";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/server/own-password", () => ({ changeOwnPassword: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function fill(current = "SementaraAbc234xyz", next = "kataSandiBaruPanjang1", again = "kataSandiBaruPanjang1") {
  await userEvent.type(screen.getByLabelText("Kata sandi saat ini"), current);
  await userEvent.type(screen.getByLabelText("Kata sandi baru", { exact: true }), next);
  await userEvent.type(screen.getByLabelText("Ulangi kata sandi baru"), again);
}

describe("formulir ganti kata sandi", () => {
  it("menampilkan aturan 12 karakter dan tiga isian kata sandi", () => {
    renderAdmin(<ChangePasswordForm />);
    expect(screen.getByText("Minimal 12 karakter.")).toBeInTheDocument();
    for (const label of ["Kata sandi saat ini", "Kata sandi baru", "Ulangi kata sandi baru"]) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute("type", "password");
    }
  });

  it("mengirim isian, lalu masuk ke panel dan memuat ulang", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<ChangePasswordForm />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    await waitFor(() =>
      expect(changeOwnPassword).toHaveBeenCalledWith({ currentPassword: "SementaraAbc234xyz", newPassword: "kataSandiBaruPanjang1", confirmation: "kataSandiBaruPanjang1" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan galat dari server dan tidak berpindah halaman", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue({ ok: false, error: "Kata sandi saat ini salah." });
    renderAdmin(<ChangePasswordForm />);
    await fill("salah");
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kata sandi saat ini salah.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Simpan kata sandi baru" })).toBeEnabled();
  });

  it("galat tak terduga ditulis dengan pesan umum, bukan dibiarkan kosong", async () => {
    vi.mocked(changeOwnPassword).mockRejectedValue(new Error("jaringan putus"));
    renderAdmin(<ChangePasswordForm />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal menyimpan. Coba lagi.");
  });
});
