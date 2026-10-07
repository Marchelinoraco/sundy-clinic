import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryManager } from "@/components/admin/expenses/category-manager";
import { ExpenseFormDialog } from "@/components/admin/expenses/expense-form-dialog";
import { ExpenseTable } from "@/components/admin/expenses/expense-table";
import { RecurringDialog } from "@/components/admin/expenses/recurring-dialog";
import { StopRecurringButton } from "@/components/admin/expenses/stop-recurring-button";
import { VoidExpenseDialog } from "@/components/admin/expenses/void-expense-dialog";
import type { CategoryRow, ExpenseRow, RecurringRow } from "@/server/expense-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createExpense: vi.fn(),
  voidExpense: vi.fn(),
  createExpenseCategory: vi.fn(),
  setExpenseCategoryActive: vi.fn(),
  createRecurringExpense: vi.fn(),
  updateRecurringExpense: vi.fn(),
  stopRecurringExpense: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/expense-actions", () => ({
  createExpense: mocks.createExpense,
  voidExpense: mocks.voidExpense,
  createExpenseCategory: mocks.createExpenseCategory,
  setExpenseCategoryActive: mocks.setExpenseCategoryActive,
}));
vi.mock("@/server/expense-recurring", () => ({
  createRecurringExpense: mocks.createRecurringExpense,
  updateRecurringExpense: mocks.updateRecurringExpense,
  stopRecurringExpense: mocks.stopRecurringExpense,
}));

const categories: CategoryRow[] = [
  { id: "kat1", name: "Sewa", isActive: true },
  { id: "kat2", name: "Gaji", isActive: true },
  { id: "kat3", name: "Servis lama", isActive: false },
];
const branches = [{ id: "b1", name: "Mahakeret" }];

beforeEach(() => vi.clearAllMocks());

describe("formulir pengeluaran", () => {
  it("nominal kosong ditolak di layar tanpa memanggil server", async () => {
    render(<ExpenseFormDialog categories={categories.filter((c) => c.isActive)} branches={branches} today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Pengeluaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pengeluaran" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nominal harus bilangan bulat lebih dari 0.");
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it("mengirim isian yang sah (tanggal hari ini, cabang umum bila tidak dipilih)", async () => {
    mocks.createExpense.mockResolvedValue({ ok: true, data: { id: "e1" } });
    render(<ExpenseFormDialog categories={categories.filter((c) => c.isActive)} branches={branches} today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Pengeluaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pengeluaran" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat1");
    await userEvent.type(within(dialog).getByLabelText("Nominal"), "500000");
    await userEvent.type(within(dialog).getByLabelText("Keterangan (opsional)"), "Sewa Oktober");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(mocks.createExpense).toHaveBeenCalledWith({ date: "2026-10-07", categoryId: "kat1", amount: 500000, note: "Sewa Oktober", branchId: null }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("galat dari server ditampilkan di dalam dialog", async () => {
    mocks.createExpense.mockResolvedValue({ ok: false, error: "Kategori tidak ditemukan atau sudah nonaktif." });
    render(<ExpenseFormDialog categories={categories.filter((c) => c.isActive)} branches={branches} today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Pengeluaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pengeluaran" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat2");
    await userEvent.type(within(dialog).getByLabelText("Nominal"), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Kategori tidak ditemukan atau sudah nonaktif.");
  });
});

describe("daftar dan pembatalan pengeluaran", () => {
  const rows: ExpenseRow[] = [
    { id: "e1", date: "2026-10-05", categoryId: "kat1", categoryName: "Sewa", amount: 400000, note: "Sewa ruko", branchId: "b1", branchName: "Mahakeret", recurring: false, createdByName: "Keuangan", voided: null },
    { id: "e2", date: "2026-10-25", categoryId: "kat2", categoryName: "Gaji", amount: 600000, note: null, branchId: null, branchName: null, recurring: true, createdByName: "Berulang (otomatis)", voided: null },
    { id: "e3", date: "2026-10-06", categoryId: "kat1", categoryName: "Sewa", amount: 999000, note: null, branchId: null, branchName: null, recurring: false, createdByName: "Keuangan", voided: { at: new Date("2026-10-07T03:00:00Z"), by: "Keuangan", reason: "Salah catat nominal" } },
  ];

  it("menampilkan baris, tanda Berulang, cabang umum, dan total tanpa yang dibatalkan", () => {
    render(<ExpenseTable rows={rows} />);
    expect(screen.getByText("Sewa ruko")).toBeInTheDocument();
    expect(screen.getByText("Berulang")).toBeInTheDocument();
    expect(screen.getAllByText("Umum").length).toBeGreaterThan(0);
    expect(screen.getByText("Salah catat nominal", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Total (tanpa yang dibatalkan)").closest("tr")).toHaveTextContent("Rp 1.000.000");
    expect(screen.queryByRole("button", { name: /Batalkan Sewa Rp 999.000/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Batalkan Sewa Rp 400.000/ })).toBeInTheDocument();
  });

  it("kosong menampilkan keterangan", () => {
    render(<ExpenseTable rows={[]} />);
    expect(screen.getByText("Belum ada pengeluaran di bulan ini.")).toBeInTheDocument();
  });

  it("pembatalan butuh alasan, lalu memanggil server", async () => {
    mocks.voidExpense.mockResolvedValue({ ok: true, data: undefined });
    render(<VoidExpenseDialog id="e1" label="Sewa Rp 400.000" />);
    await userEvent.click(screen.getByRole("button", { name: "Batalkan Sewa Rp 400.000" }));
    const dialog = await screen.findByRole("dialog", { name: "Batalkan pengeluaran?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Batalkan pengeluaran" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Isi alasan.");
    expect(mocks.voidExpense).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText("Alasan"), "Salah catat");
    await userEvent.click(within(dialog).getByRole("button", { name: "Batalkan pengeluaran" }));
    await waitFor(() => expect(mocks.voidExpense).toHaveBeenCalledWith({ id: "e1", reason: "Salah catat" }));
  });
});

describe("kategori", () => {
  it("menambah kategori, menampilkan galat nama kembar, dan menonaktifkan atau mengaktifkan", async () => {
    mocks.createExpenseCategory.mockResolvedValueOnce({ ok: false, error: "Kategori ini sudah ada." }).mockResolvedValueOnce({ ok: true, data: { id: "k9" } });
    mocks.setExpenseCategoryActive.mockResolvedValue({ ok: true, data: undefined });
    render(<CategoryManager categories={categories} />);
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nama kategori baru"), "Sewa");
    await userEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kategori ini sudah ada.");
    await userEvent.clear(screen.getByLabelText("Nama kategori baru"));
    await userEvent.type(screen.getByLabelText("Nama kategori baru"), "Servis AC");
    await userEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    await waitFor(() => expect(mocks.createExpenseCategory).toHaveBeenLastCalledWith({ name: "Servis AC" }));

    await userEvent.click(screen.getByRole("button", { name: "Nonaktifkan Sewa" }));
    await waitFor(() => expect(mocks.setExpenseCategoryActive).toHaveBeenCalledWith({ id: "kat1", active: false }));
    await userEvent.click(screen.getByRole("button", { name: "Aktifkan Servis lama" }));
    await waitFor(() => expect(mocks.setExpenseCategoryActive).toHaveBeenCalledWith({ id: "kat3", active: true }));
  });
});

describe("pengeluaran berulang", () => {
  const active = categories.filter((c) => c.isActive);
  const row: RecurringRow = {
    id: "r1", categoryId: "kat2", categoryName: "Gaji", amount: 1000000, note: "Gaji staf", branchId: null, branchName: null,
    dayOfMonth: 25, startMonth: "2026-08", endMonth: null, isActive: true,
  };

  it("tanggal di luar 1–28 ditolak di layar; templat sah dikirim lengkap", async () => {
    mocks.createRecurringExpense.mockResolvedValue({ ok: true, data: { id: "r2", generated: 1 } });
    render(<RecurringDialog categories={active} branches={branches} currentMonth="2026-10" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Berulang" }));
    const dialog = await screen.findByRole("dialog", { name: "Pengeluaran berulang" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Kategori"), "kat2");
    await userEvent.type(within(dialog).getByLabelText("Nominal"), "1000000");
    await userEvent.clear(within(dialog).getByLabelText("Tanggal tiap bulan"));
    await userEvent.type(within(dialog).getByLabelText("Tanggal tiap bulan"), "29");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Tanggal tiap bulan harus 1 sampai 28.");
    expect(mocks.createRecurringExpense).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText("Tanggal tiap bulan"));
    await userEvent.type(within(dialog).getByLabelText("Tanggal tiap bulan"), "25");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(mocks.createRecurringExpense).toHaveBeenCalledWith({
        categoryId: "kat2", amount: 1000000, note: "", branchId: null, dayOfMonth: 25, startMonth: "2026-10", endMonth: null,
      }),
    );
  });

  it("mengubah templat: hanya nominal, keterangan, tanggal, dan bulan berakhir", async () => {
    mocks.updateRecurringExpense.mockResolvedValue({ ok: true, data: undefined });
    render(<RecurringDialog categories={active} branches={branches} currentMonth="2026-10" row={row} />);
    await userEvent.click(screen.getByRole("button", { name: "Ubah Gaji" }));
    const dialog = await screen.findByRole("dialog", { name: "Ubah pengeluaran berulang" });
    expect(within(dialog).queryByLabelText("Kategori")).toBeNull();
    const amount = within(dialog).getByLabelText("Nominal");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1200000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(mocks.updateRecurringExpense).toHaveBeenCalledWith({ id: "r1", amount: 1200000, note: "Gaji staf", dayOfMonth: 25, endMonth: null }),
    );
  });

  it("menghentikan templat lewat dialog konfirmasi", async () => {
    mocks.stopRecurringExpense.mockResolvedValue({ ok: true, data: undefined });
    render(<StopRecurringButton id="r1" label="Gaji" />);
    await userEvent.click(screen.getByRole("button", { name: "Hentikan Gaji" }));
    const dialog = await screen.findByRole("dialog", { name: "Hentikan pengeluaran berulang?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Hentikan" }));
    await waitFor(() => expect(mocks.stopRecurringExpense).toHaveBeenCalledWith({ id: "r1" }));
  });
});
