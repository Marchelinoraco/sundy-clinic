import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceCostDialog } from "@/components/admin/service-cost-dialog";
import { updateServiceCost } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/service-admin", () => ({ updateServiceCost: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const service = { id: "sv1", name: "Relaxing Facial", promoPrice: 149_000, materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 };

beforeEach(() => vi.clearAllMocks());

describe("ServiceCostDialog", () => {
  it("mengisi biaya dan komisi rupiah; peringatan bila biaya melebihi harga", async () => {
    vi.mocked(updateServiceCost).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    expect(screen.getByText("bahan Rp 0 · alat Rp 0 · komisi tanpa komisi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Biaya Relaxing Facial" }));
    const dialog = await screen.findByRole("dialog", { name: "Biaya Relaxing Facial" });
    await user.type(within(dialog).getByLabelText("Biaya bahan"), "150000");
    expect(dialog).toHaveTextContent("Biaya melebihi harga jual.");
    await user.clear(within(dialog).getByLabelText("Biaya bahan"));
    await user.type(within(dialog).getByLabelText("Biaya bahan"), "30000");
    await user.type(within(dialog).getByLabelText("Biaya alat"), "5000");
    await user.selectOptions(within(dialog).getByLabelText("Komisi"), "NOMINAL");
    await user.type(within(dialog).getByLabelText("Komisi per sesi"), "15000");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateServiceCost).toHaveBeenCalledWith({ id: "sv1", materialCost: 30_000, toolCost: 5000, commissionKind: "NOMINAL", commissionValue: 15_000 }),
    );
  });

  it("komisi persen memakai isian persen", async () => {
    vi.mocked(updateServiceCost).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    await user.click(screen.getByRole("button", { name: "Biaya Relaxing Facial" }));
    const dialog = await screen.findByRole("dialog", { name: "Biaya Relaxing Facial" });
    await user.selectOptions(within(dialog).getByLabelText("Komisi"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Komisi persen"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServiceCost).toHaveBeenCalledWith(expect.objectContaining({ commissionKind: "PERSEN", commissionValue: 10 })));
  });
});
