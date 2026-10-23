import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefundDepositDialog } from "@/components/admin/deposit/refund-deposit-dialog";
import { APPROVAL_REQUIRED } from "@/lib/approval";
import { refundDeposit } from "@/server/deposit-actions";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/deposit-actions", () => ({ refundDeposit: vi.fn() }));
vi.mock("@/server/approval-pin", () => ({ listApprovers: vi.fn().mockResolvedValue({ ok: true, data: [{ id: "a1", name: "Rina" }] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

async function openDialog() {
  const user = userEvent.setup();
  renderAdmin(<RefundDepositDialog patientId="p1" patientName="Ani Uji" balance={300_000} />);
  await user.click(screen.getByRole("button", { name: "Kembalikan uang" }));
  return { user, dialog: await screen.findByRole("dialog", { name: "Kembalikan uang deposit" }) };
}

describe("pengembalian deposit (spec deposit D15, D16)", () => {
  it("di bawah Rp 200.000 atau melebihi saldo ditolak di layar dengan pesan server", async () => {
    const { user, dialog } = await openDialog();
    const amount = within(dialog).getByLabelText("Jumlah");
    await user.type(within(dialog).getByLabelText("Alasan"), "Pindah kota");
    await user.clear(amount);
    await user.type(amount, "150000");
    await user.click(within(dialog).getByRole("button", { name: "Kembalikan" }));
    expect(within(dialog).getByText("Pengembalian minimal Rp 200.000.")).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, "350000");
    await user.click(within(dialog).getByRole("button", { name: "Kembalikan" }));
    expect(within(dialog).getByText("Pengembalian melebihi saldo deposit (Rp 300.000).")).toBeInTheDocument();
    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("jumlah, cara, dan alasan, lalu Persetujuan dengan PIN", async () => {
    vi.mocked(refundDeposit).mockResolvedValueOnce({ ok: false, error: APPROVAL_REQUIRED }).mockResolvedValueOnce({ ok: true, data: undefined });
    const { user, dialog } = await openDialog();
    expect(within(dialog).getByText(/Saldo deposit Ani Uji Rp 300\.000/)).toBeInTheDocument();
    const amount = within(dialog).getByLabelText("Jumlah");
    await user.clear(amount);
    await user.type(amount, "250000");
    await user.selectOptions(within(dialog).getByLabelText("Cara"), "TRANSFER");
    await user.type(within(dialog).getByLabelText("Alasan"), "Pindah kota");
    await user.click(within(dialog).getByRole("button", { name: "Kembalikan" }));
    const approval = await screen.findByRole("dialog", { name: "Persetujuan" });
    await waitFor(() => expect(within(approval).getByRole("option", { name: "Rina" })).toBeInTheDocument());
    await user.selectOptions(within(approval).getByLabelText("Penyetuju"), "a1");
    await user.type(within(approval).getByLabelText("PIN"), "135790");
    await user.click(within(approval).getByRole("button", { name: "Setujui" }));
    await waitFor(() =>
      expect(refundDeposit).toHaveBeenLastCalledWith({ patientId: "p1", amount: 250_000, method: "TRANSFER", reason: "Pindah kota", approval: { approverId: "a1", pin: "135790" } }),
    );
  });
});
