import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddFreeLineDialog } from "@/components/admin/billing/add-free-line-dialog";
import { addFreeLine, addServiceLine } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ addFreeLine: vi.fn(), addServiceLine: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SERVICES = [
  { id: "s1", slug: "relaxing-facial", name: "Relaxing Facial", categoryId: "c1", categoryName: "Facial Treatment", price: 149_000, durationMin: 60, requiresDoctor: false },
  { id: "s2", slug: "add-on-masker", name: "Add-on Masker", categoryId: "c1", categoryName: "Facial Treatment", price: 50_000, durationMin: 15, requiresDoctor: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addServiceLine).mockResolvedValue({ ok: true, data: { version: 2 } });
  vi.mocked(addFreeLine).mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("AddFreeLineDialog (spec layanan situs 6)", () => {
  it("memilih dari katalog: nama dan harga terkunci, hanya jumlah yang diisi", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddFreeLineDialog invoiceId="inv" version={1} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Baris layanan" }));
    await user.click(screen.getByRole("combobox", { name: "Layanan" }));
    await user.click(await screen.findByRole("option", { name: "Add-on Masker — Rp 50.000" }));
    expect(screen.getByLabelText("Harga")).toHaveValue("Rp 50.000");
    expect(screen.getByLabelText("Harga")).toBeDisabled();
    expect(screen.queryByLabelText("Nama")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Jumlah"));
    await user.type(screen.getByLabelText("Jumlah"), "2");
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addServiceLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 1, serviceId: "s2", quantity: 2 }));
    expect(addFreeLine).not.toHaveBeenCalled();
  });

  it("\"Lainnya (ketik sendiri)\" membuka isian bebas seperti sebelumnya", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddFreeLineDialog invoiceId="inv" version={1} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Baris layanan" }));
    await user.click(screen.getByRole("combobox", { name: "Layanan" }));
    await user.click(await screen.findByRole("option", { name: "Lainnya (ketik sendiri)" }));
    await user.type(screen.getByLabelText("Nama"), "Facial Khusus");
    await user.type(screen.getByLabelText("Harga"), "100000");
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addFreeLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 1, kind: "LAYANAN", name: "Facial Khusus", quantity: 1, unitPrice: 100_000 }));
  });

  it("tanpa pilihan: pesan \"Pilih layanan.\"", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddFreeLineDialog invoiceId="inv" version={1} services={SERVICES} />);
    await user.click(screen.getByRole("button", { name: "+ Baris layanan" }));
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    expect(await screen.findByText("Pilih layanan.")).toBeInTheDocument();
    expect(addServiceLine).not.toHaveBeenCalled();
  });
});
