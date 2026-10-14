import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReducePrescriptionDialog } from "@/components/admin/billing/reduce-prescription-dialog";
import { reducePrescriptionLine } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ reducePrescriptionLine: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reducePrescriptionLine).mockResolvedValue({ ok: true, data: { version: 2 } });
});

describe("ReducePrescriptionDialog (spec resep dokter 4)", { timeout: 15_000 }, () => {
  it("mengirim jumlah baru dan alasan; galat validasi tampil", async () => {
    const user = userEvent.setup();
    renderAdmin(<ReducePrescriptionDialog invoiceId="inv" version={1} line={{ id: "l1", name: "Amoxicillin", quantity: 10, prescription: { prescribedQuantity: 10, usage: "3 x 1" } }} />);
    await user.click(screen.getByRole("button", { name: "Kurangi Amoxicillin" }));
    const dialog = screen.getByRole("dialog", { name: "Kurangi Amoxicillin" });
    expect(dialog).toHaveTextContent("Resep dokter: 10");
    await user.clear(screen.getByLabelText("Jumlah ditagih"));
    await user.type(screen.getByLabelText("Jumlah ditagih"), "4");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Alasan 2–200 karakter.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Alasan"), "Stok kurang");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(reducePrescriptionLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 1, lineId: "l1", quantity: 4, reason: "Stok kurang" }));
  });

  it("jumlah dikosongkan tidak dibaca 0 (obat tidak terhapus tanpa sengaja)", async () => {
    const user = userEvent.setup();
    renderAdmin(<ReducePrescriptionDialog invoiceId="inv" version={1} line={{ id: "l1", name: "Amoxicillin", quantity: 10, prescription: { prescribedQuantity: 10, usage: "3 x 1" } }} />);
    await user.click(screen.getByRole("button", { name: "Kurangi Amoxicillin" }));
    await user.clear(screen.getByLabelText("Jumlah ditagih"));
    await user.type(screen.getByLabelText("Alasan"), "Stok kurang");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Jumlah ditagih harus 0–9.")).toBeInTheDocument();
    expect(reducePrescriptionLine).not.toHaveBeenCalled();
  });
});
