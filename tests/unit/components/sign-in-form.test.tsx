import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/admin/sign-in-form";

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn().mockResolvedValue({ error: null }) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SignInForm", () => {
  it("menampilkan kolom email dan kata sandi", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kata sandi/i)).toBeInTheDocument();
  });

  it("menyembunyikan kata sandi yang diketik", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/kata sandi/i)).toHaveAttribute("type", "password");
  });

  it("meminta email diisi sebelum mengirim", async () => {
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: /masuk/i }));
    expect(await screen.findByText(/email wajib diisi/i)).toBeInTheDocument();
  });

  it("tidak menyebut kolom mana yang salah saat kredensial ditolak", async () => {
    const { signIn } = await import("@/lib/auth-client");
    vi.mocked(signIn.email).mockResolvedValueOnce({ error: { message: "Invalid" } } as never);

    render(<SignInForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "staf@sundy.test");
    await userEvent.type(screen.getByLabelText(/kata sandi/i), "kataSandiPanjang123");
    await userEvent.click(screen.getByRole("button", { name: /masuk/i }));

    // Pesan sengaja tidak membedakan "email tidak ada" dari "kata sandi salah":
    // membedakannya memberi tahu penyerang email mana yang terdaftar.
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent(/email atau kata sandi salah/i);
  });
});
