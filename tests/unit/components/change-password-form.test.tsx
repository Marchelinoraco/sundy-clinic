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
    renderAdmin(<ChangePasswordForm email="rina@sundy.test" />);
    expect(screen.getByText("Minimal 12 karakter.")).toBeInTheDocument();
    for (const label of ["Kata sandi saat ini", "Kata sandi baru", "Ulangi kata sandi baru"]) {
      expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute("type", "password");
    }
  });

  it("mengirim isian, lalu masuk ke panel dan memuat ulang", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<ChangePasswordForm email="rina@sundy.test" />);
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
    renderAdmin(<ChangePasswordForm email="rina@sundy.test" />);
    await fill("salah");
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kata sandi saat ini salah.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Simpan kata sandi baru" })).toBeEnabled();
  });

  it("galat tak terduga ditulis dengan pesan umum, bukan dibiarkan kosong", async () => {
    vi.mocked(changeOwnPassword).mockRejectedValue(new Error("jaringan putus"));
    renderAdmin(<ChangePasswordForm email="rina@sundy.test" />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal menyimpan. Coba lagi.");
  });

  it("memuat isian username tersembunyi supaya pengelola kata sandi menyimpan kata sandi baru bersama emailnya", () => {
    const { container } = renderAdmin(<ChangePasswordForm email="rina@sundy.test" />);
    const username = container.querySelector('input[autocomplete="username"]') as HTMLInputElement;
    expect(username).not.toBeNull();
    expect(username.value).toBe("rina@sundy.test");
    expect(username.readOnly).toBe(true);
    expect(username).toHaveAttribute("aria-hidden", "true");
    expect(username.tabIndex).toBe(-1);
  });

  it("menandai isian yang bermasalah (aria-invalid) dan menautkan galatnya, sesuai pesan", async () => {
    vi.mocked(changeOwnPassword).mockResolvedValueOnce({ ok: false, error: "Kata sandi saat ini salah." }).mockResolvedValueOnce({ ok: false, error: "Kata sandi baru dan ulangannya tidak sama." });
    renderAdmin(<ChangePasswordForm email="rina@sundy.test" />);
    const current = screen.getByLabelText("Kata sandi saat ini");
    const next = screen.getByLabelText("Kata sandi baru", { exact: true });
    const again = screen.getByLabelText("Ulangi kata sandi baru");
    expect([current, next, again].map((f) => f.getAttribute("aria-invalid"))).toEqual(["false", "false", "false"]);

    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    const alert = await screen.findByRole("alert");
    expect([current, next, again].map((f) => f.getAttribute("aria-invalid"))).toEqual(["true", "false", "false"]);
    expect(current).toHaveAttribute("aria-describedby", alert.id);

    await userEvent.click(screen.getByRole("button", { name: "Simpan kata sandi baru" }));
    await waitFor(() => expect([current, next, again].map((f) => f.getAttribute("aria-invalid"))).toEqual(["false", "true", "true"]));
  });
});
