import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicBankAccounts } from "@/components/admin/clinic-bank-accounts";
import { createClinicBankAccount, setClinicBankAccountActive } from "@/server/clinic-bank";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/clinic-bank", () => ({
  createClinicBankAccount: vi.fn(),
  updateClinicBankAccount: vi.fn(),
  setClinicBankAccountActive: vi.fn(),
  moveClinicBankAccount: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ACCOUNTS = [
  { id: "a", bankName: "BCA", accountNumber: "1234567890", accountHolder: "SunDY", isActive: true, sortOrder: 0, label: "BCA 1234567890 a.n. SunDY" },
  { id: "b", bankName: "Mandiri", accountNumber: "9876543", accountHolder: "SunDY", isActive: false, sortOrder: 1, label: "Mandiri 9876543 a.n. SunDY" },
];

beforeEach(() => vi.clearAllMocks());

describe("ClinicBankAccounts", () => {
  it("menampilkan daftar dengan status", () => {
    renderAdmin(<ClinicBankAccounts accounts={ACCOUNTS} />);
    const list = screen.getByRole("list", { name: "Rekening klinik" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("BCA 1234567890 a.n. SunDY");
    expect(list).toHaveTextContent("Nonaktif");
  });

  it("menambah rekening", async () => {
    vi.mocked(createClinicBankAccount).mockResolvedValue({ ok: true, data: { id: "c" } });
    const user = userEvent.setup();
    renderAdmin(<ClinicBankAccounts accounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "+ Rekening" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah rekening" });
    await user.type(within(dialog).getByLabelText("Nama bank"), "BRI");
    await user.type(within(dialog).getByLabelText("Nomor rekening"), "555666777");
    await user.type(within(dialog).getByLabelText("Nama pemilik"), "SunDY Clinic");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(createClinicBankAccount).toHaveBeenCalledWith({ bankName: "BRI", accountNumber: "555666777", accountHolder: "SunDY Clinic" }));
  });

  it("menonaktifkan rekening aktif", async () => {
    vi.mocked(setClinicBankAccountActive).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ClinicBankAccounts accounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Nonaktifkan BCA 1234567890 a.n. SunDY" }));
    await waitFor(() => expect(setClinicBankAccountActive).toHaveBeenCalledWith("a", false));
  });
});
