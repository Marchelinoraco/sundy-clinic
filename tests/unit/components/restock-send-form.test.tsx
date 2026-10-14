import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestockSendForm } from "@/components/admin/counter/restock-send-form";
import { rejectRestockRequest, sendRestockRequest } from "@/server/restock";
import type { RestockRequestDetail } from "@/server/restock-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/restock", () => ({ sendRestockRequest: vi.fn(), rejectRestockRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const REQUEST: RestockRequestDetail = {
  id: "r1",
  status: "MENUNGGU",
  version: 3,
  branchId: "b1",
  branchName: "Mahakeret",
  note: null,
  requestedByName: "Rina",
  createdAt: new Date("2026-10-14T02:00:00Z"),
  decidedByName: null,
  decidedAt: null,
  rejectReason: null,
  lines: [
    { id: "l1", itemId: "i1", itemName: "Amoxicillin", unit: "kapsul", requestedQuantity: 10, sentQuantity: null, warehouseAvailable: 40 },
    { id: "l2", itemId: "i2", itemName: "Serum", unit: "botol", requestedQuantity: 5, sentQuantity: null, warehouseAvailable: 2 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendRestockRequest).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(rejectRestockRequest).mockResolvedValue({ ok: true, data: undefined });
});

describe("RestockSendForm (spec stok meja 4.2)", { timeout: 15_000 }, () => {
  it("Dikirim terisi min(diminta, gudang); kiriman dikirim dengan versi", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockSendForm request={REQUEST} />);
    expect(screen.getByLabelText("Dikirim Amoxicillin")).toHaveValue(10);
    expect(screen.getByLabelText("Dikirim Serum")).toHaveValue(2);
    await user.clear(screen.getByLabelText("Dikirim Amoxicillin"));
    await user.type(screen.getByLabelText("Dikirim Amoxicillin"), "6");
    await user.click(screen.getByRole("button", { name: "Kirim ke meja" }));
    await waitFor(() =>
      expect(sendRestockRequest).toHaveBeenCalledWith({ requestId: "r1", version: 3, lines: [{ lineId: "l1", quantity: 6 }, { lineId: "l2", quantity: 2 }] }),
    );
  });

  it("melebihi gudang ditolak di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockSendForm request={REQUEST} />);
    await user.clear(screen.getByLabelText("Dikirim Serum"));
    await user.type(screen.getByLabelText("Dikirim Serum"), "5");
    await user.click(screen.getByRole("button", { name: "Kirim ke meja" }));
    expect(await screen.findByText("Sisa gudang Serum tidak cukup (tersedia 2).")).toBeInTheDocument();
    expect(sendRestockRequest).not.toHaveBeenCalled();
  });

  it("tolak dengan alasan", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockSendForm request={REQUEST} />);
    await user.click(screen.getByRole("button", { name: "Tolak" }));
    await user.type(screen.getByLabelText("Alasan"), "Stok gudang kosong");
    await user.click(screen.getByRole("button", { name: "Tolak permintaan" }));
    await waitFor(() => expect(rejectRestockRequest).toHaveBeenCalledWith({ requestId: "r1", version: 3, reason: "Stok gudang kosong" }));
  });
});
