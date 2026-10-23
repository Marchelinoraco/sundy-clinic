import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DepositBalanceTable, DepositHistoryTable } from "@/components/admin/deposit/deposit-tables";
import type { DepositMovement } from "@/server/deposit-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/deposit-actions", () => ({ refundDeposit: vi.fn() }));
vi.mock("@/server/approval-pin", () => ({ listApprovers: vi.fn().mockResolvedValue({ ok: true, data: [] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const balances = [
  { patientId: "p1", patientName: "Ani Uji", medicalRecordNumber: "SDY-2026-0001", balance: 300_000, nearestValidUntil: "2026-11-23" },
  { patientId: "p2", patientName: "Budi Uji", medicalRecordNumber: "SDY-2026-0002", balance: 150_000, nearestValidUntil: "2026-11-10" },
];

const movement = (patch: Partial<DepositMovement>): DepositMovement => ({
  id: "m",
  date: "2026-10-24",
  kind: "MASUK",
  label: "Kelebihan bayar",
  patientId: "p1",
  patientName: "Ani Uji",
  medicalRecordNumber: "SDY-2026-0001",
  amount: 50_000,
  invoiceId: null,
  invoiceNumber: null,
  staffName: "Mey",
  approvedByName: null,
  note: null,
  ...patch,
});

describe("tab Aktif (spec deposit D18)", () => {
  it("pasien, saldo, dan kedaluwarsa terdekat; Kembalikan uang hanya bila saldo ≥ Rp 200.000", () => {
    renderAdmin(<DepositBalanceTable rows={balances} canRefund />);
    const ani = screen.getByRole("link", { name: "Ani Uji" }).closest("tr")!;
    expect(screen.getByRole("link", { name: "Ani Uji" })).toHaveAttribute("href", "/admin/pasien/p1");
    expect(ani).toHaveTextContent("Rp 300.000");
    expect(ani).toHaveTextContent("23 Nov 2026");
    expect(within(ani).getByRole("button", { name: "Kembalikan uang" })).toBeInTheDocument();
    const budi = screen.getByRole("link", { name: "Budi Uji" }).closest("tr")!;
    expect(within(budi).queryByRole("button", { name: "Kembalikan uang" })).toBeNull();
  });

  it("tanpa hak mengembalikan: tanpa tombol; tanpa saldo: pesan kosong", () => {
    const { unmount } = renderAdmin(<DepositBalanceTable rows={balances} canRefund={false} />);
    expect(screen.queryByRole("button", { name: "Kembalikan uang" })).toBeNull();
    unmount();
    renderAdmin(<DepositBalanceTable rows={[]} canRefund />);
    expect(screen.getByText("Belum ada pasien dengan saldo deposit.")).toBeInTheDocument();
  });
});

describe("tab Riwayat (spec deposit D18)", () => {
  it("jenis gerakan, tagihan, staf, dan penyetuju", () => {
    renderAdmin(
      <DepositHistoryTable
        rows={[
          movement({ id: "r1", kind: "DIKEMBALIKAN", label: "Tunai", amount: 250_000, approvedByName: "Rina", note: "Pindah kota" }),
          movement({ id: "u1", kind: "DIPAKAI", label: "Saldo deposit", invoiceId: "i9", invoiceNumber: "TG-2026-0009" }),
          movement({ id: "h1", kind: "HANGUS", label: "Deposit booking", amount: 75_000, staffName: null }),
        ]}
      />,
    );
    const refund = screen.getByText("Dikembalikan").closest("tr")!;
    expect(refund).toHaveTextContent("Tunai");
    expect(refund).toHaveTextContent("-Rp 250.000");
    expect(refund).toHaveTextContent("Mey · disetujui Rina");
    expect(refund).toHaveTextContent("Pindah kota");
    expect(screen.getByRole("link", { name: "TG-2026-0009" })).toHaveAttribute("href", "/admin/tagihan/i9");
    expect(screen.getByText("Hangus").closest("tr")).toHaveTextContent("-Rp 75.000");
  });

  it("kosong: pesan", () => {
    renderAdmin(<DepositHistoryTable rows={[]} />);
    expect(screen.getByText("Belum ada gerakan deposit pada rentang ini.")).toBeInTheDocument();
  });
});
