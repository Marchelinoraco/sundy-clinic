import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillableTable } from "@/components/admin/billing/billable-table";
import { InvoiceStatusBadge } from "@/components/admin/billing/invoice-status-badge";
import { InvoiceTable } from "@/components/admin/billing/invoice-table";
import type { BillableVisit, InvoiceRow } from "@/server/invoice-read";

const { push, refresh, createFromVisit } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createFromVisit: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/server/invoice-drafts", () => ({ createInvoiceFromVisit: createFromVisit, createDirectSale: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = (patch: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "i1",
  number: "TG-2026-0001",
  createdAt: new Date("2026-10-07T03:00:00Z"),
  patientId: "p1",
  patientName: "Ani Uji",
  branchName: "Manado",
  display: "SEBAGIAN",
  total: 100000,
  balance: 60000,
  lineCount: 2,
  ...patch,
});
const visit = (patch: Partial<BillableVisit> = {}): BillableVisit => ({
  appointmentId: "a1",
  patientId: "p1",
  patientName: "Budi Uji",
  medicalRecordNumber: "RM-001",
  branchName: "Manado",
  serviceName: "Konsultasi Gizi",
  finalizedAt: new Date("2026-10-07T03:00:00Z"),
  treatmentCount: 2,
  online: false,
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("daftar tagihan", () => {
  it("menampilkan nomor, pasien, total, sisa, dan status; draf tanpa nomor", () => {
    render(<InvoiceTable rows={[row(), row({ id: "i2", number: null, display: "DRAF", patientName: "Citra Uji", balance: 50000 })]} />);
    expect(screen.getByRole("link", { name: "TG-2026-0001" })).toHaveAttribute("href", "/admin/tagihan/i1");
    expect(screen.getByText("Ani Uji")).toBeInTheDocument();
    expect(screen.getByText("Sebagian", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Draf" })).toHaveAttribute("href", "/admin/tagihan/i2");
  });

  it("kosong menampilkan keterangan", () => {
    render(<InvoiceTable rows={[]} />);
    expect(screen.getByText("Tidak ada tagihan di tampilan ini.")).toBeInTheDocument();
  });

  it("label status", () => {
    render(<InvoiceStatusBadge status="LUNAS" />);
    expect(screen.getByText("Lunas")).toBeInTheDocument();
  });
});

describe("perlu ditagih", () => {
  it("resepsionis menekan Buat tagihan: tagihan dibuat lalu halaman draf dibuka", async () => {
    createFromVisit.mockResolvedValue({ ok: true, data: { id: "inv9", existing: false } });
    render(<BillableTable rows={[visit()]} canManage />);
    expect(screen.getByText("Budi Uji")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buat tagihan Budi Uji" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/tagihan/inv9"));
    expect(createFromVisit).toHaveBeenCalledWith("a1");
  });

  it("tagihan sudah ada (dibuat orang lain): tetap membuka tagihan itu", async () => {
    createFromVisit.mockResolvedValue({ ok: true, data: { id: "inv1", existing: true } });
    render(<BillableTable rows={[visit()]} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Buat tagihan Budi Uji" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/tagihan/inv1"));
  });

  it("Admin Keuangan hanya melihat: tanpa tombol buat tagihan", () => {
    render(<BillableTable rows={[visit({ online: true })]} canManage={false} />);
    expect(screen.queryByRole("button", { name: /Buat tagihan/ })).toBeNull();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("kegagalan membuat tagihan ditampilkan, tidak berpindah halaman", async () => {
    createFromVisit.mockResolvedValue({ ok: false, error: "Kunjungan ini belum final." });
    render(<BillableTable rows={[visit()]} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Buat tagihan Budi Uji" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kunjungan ini belum final.");
    expect(push).not.toHaveBeenCalled();
  });
});
