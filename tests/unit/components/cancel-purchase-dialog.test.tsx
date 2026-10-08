import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancelPurchaseDialog } from "@/components/admin/stock/cancel-purchase-dialog";
import { cancelPurchase } from "@/server/purchases";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/purchases", () => ({ cancelPurchase: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("CancelPurchaseDialog", () => {
  it("alasan wajib, lalu membatalkan faktur", async () => {
    const user = userEvent.setup();
    vi.mocked(cancelPurchase).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<CancelPurchaseDialog invoiceId="p1" invoiceNumber="INV-1" />);
    await user.click(screen.getByRole("button", { name: "Batalkan faktur" }));
    const dialog = screen.getByRole("dialog", { name: "Batalkan faktur INV-1?" });
    await user.click(within(dialog).getByRole("button", { name: "Batalkan faktur" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi alasan.");
    expect(cancelPurchase).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Alasan pembatalan"), "Harga beli salah ketik");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan faktur" }));
    await waitFor(() => expect(cancelPurchase).toHaveBeenCalledWith({ invoiceId: "p1", reason: "Harga beli salah ketik" }));
  });

  it("menampilkan galat dari server", async () => {
    const user = userEvent.setup();
    vi.mocked(cancelPurchase).mockResolvedValue({ ok: false, error: "Faktur ini sudah dibatalkan." });
    renderAdmin(<CancelPurchaseDialog invoiceId="p1" invoiceNumber="INV-1" />);
    await user.click(screen.getByRole("button", { name: "Batalkan faktur" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Alasan pembatalan"), "Ganda");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan faktur" }));
    expect(await within(dialog).findByText("Faktur ini sudah dibatalkan.")).toBeInTheDocument();
  });
});
