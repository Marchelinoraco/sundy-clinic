import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToWarehouseDialog } from "@/components/admin/counter/pull-to-warehouse-dialog";
import { pullToWarehouse } from "@/server/counter-stock";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/counter-stock", () => ({ pullToWarehouse: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pullToWarehouse).mockResolvedValue({ ok: true, data: undefined });
});

describe("PullToWarehouseDialog (spec stok meja 3)", { timeout: 15_000 }, () => {
  it("menarik jumlah dari meja batch ini; melebihi meja ditolak di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<PullToWarehouseDialog batch={{ id: "b1", label: "Amoxicillin batch A", counterRemaining: 3, unit: "kapsul" }} />);
    await user.click(screen.getByRole("button", { name: "Tarik ke gudang Amoxicillin batch A" }));
    await user.type(screen.getByLabelText("Jumlah"), "4");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Melebihi sisa meja (3 kapsul).")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Jumlah"));
    await user.type(screen.getByLabelText("Jumlah"), "2");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(pullToWarehouse).toHaveBeenCalledWith({ batchId: "b1", quantity: 2 }));
  });
});
