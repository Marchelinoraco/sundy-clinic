import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeDialog } from "@/components/admin/payroll/employee-dialog";
import { createEmployee, updateEmployee } from "@/server/payroll-actions";
import type { EmployeeRow } from "@/server/payroll-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payroll-actions", () => ({ createEmployee: vi.fn(), updateEmployee: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BRANCHES = [{ id: "b1", name: "Mahakeret" }];
const STAFF = [
  { id: "t1", name: "Terapis Rina", employeeId: null },
  { id: "t2", name: "Terapis Lain", employeeId: "e9" },
];
const ROW: EmployeeRow = {
  id: "e1", name: "Rina", position: "Terapis", branchId: "b1", branchName: "Mahakeret", joinedOn: "2026-01-02", nik: null, npwp: null, whatsapp: null,
  bankName: null, bankAccount: null, bankHolder: null, notes: null, baseSalary: 3_000_000, allowance: 500_000, status: "AKTIF", leftOn: null, staffId: "t1", staffName: "Terapis Rina",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createEmployee).mockResolvedValue({ ok: true, data: { id: "baru" } });
  vi.mocked(updateEmployee).mockResolvedValue({ ok: true, data: undefined });
});

describe("EmployeeDialog (spec karyawan 5)", { timeout: 15_000 }, () => {
  it("menambah karyawan tanpa akun; staf yang sudah tertaut tidak bisa dipilih", async () => {
    const user = userEvent.setup();
    renderAdmin(<EmployeeDialog branches={BRANCHES} staffOptions={STAFF} />);
    await user.click(screen.getByRole("button", { name: "+ Karyawan" }));
    expect(screen.getByRole("dialog", { name: "Tambah karyawan" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Terapis Lain (sudah tertaut)" })).toBeDisabled();
    await user.type(screen.getByLabelText("Nama"), "Siti");
    await user.type(screen.getByLabelText("Jabatan"), "Cleaning service");
    await user.type(screen.getByLabelText("Gaji pokok"), "2500000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Isi tanggal masuk.")).toBeInTheDocument();
    expect(createEmployee).not.toHaveBeenCalled();
  });

  it("mengubah karyawan yang ada; galat server tampil", async () => {
    vi.mocked(updateEmployee).mockResolvedValue({ ok: false, error: "Staf ini sudah ditautkan ke karyawan lain." });
    const user = userEvent.setup();
    renderAdmin(<EmployeeDialog branches={BRANCHES} staffOptions={STAFF} employee={ROW} />);
    await user.click(screen.getByRole("button", { name: "Ubah Rina" }));
    expect(screen.getByRole("dialog", { name: "Ubah — Rina" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tunjangan tetap")).toHaveValue("Rp 500.000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateEmployee).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", name: "Rina", joinedOn: "2026-01-02", staffId: "t1", baseSalary: 3_000_000, allowance: 500_000 })),
    );
    expect(await screen.findByText("Staf ini sudah ditautkan ke karyawan lain.")).toBeInTheDocument();
  });
});
