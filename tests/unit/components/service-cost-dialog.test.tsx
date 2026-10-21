import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceCostDialog } from "@/components/admin/service-cost-dialog";
import { updateServicePricing } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/service-admin", () => ({ updateServicePricing: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const service = { id: "sv1", name: "Relaxing Facial", normalPrice: null, promoPrice: 149_000, materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0, otherCosts: [] };

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Harga & biaya Relaxing Facial" }));
  return screen.findByRole("dialog", { name: "Harga & biaya Relaxing Facial" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateServicePricing).mockResolvedValue({ ok: true, data: undefined });
});

describe("ServiceCostDialog — Harga & biaya (spec biaya lainnya BL6)", () => {
  it("mengisi harga, biaya, dan dua biaya lainnya; mengirim semuanya sekaligus", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    expect(screen.getByText("bahan Rp 0 · alat Rp 0 · komisi tanpa komisi")).toBeInTheDocument();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Harga coret (opsional)"), "189000");
    await user.type(within(dialog).getByLabelText("Biaya bahan"), "20000");
    await user.type(within(dialog).getByLabelText("Biaya alat"), "10000");
    await user.selectOptions(within(dialog).getByLabelText("Komisi"), "NOMINAL");
    await user.type(within(dialog).getByLabelText("Komisi per sesi"), "15000");
    await user.click(within(dialog).getByRole("button", { name: "+ Biaya lainnya" }));
    await user.type(within(dialog).getByLabelText("Nama biaya lainnya 1"), "Laundry handuk");
    await user.type(within(dialog).getByLabelText("Nominal biaya lainnya 1"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "+ Biaya lainnya" }));
    await user.type(within(dialog).getByLabelText("Nama biaya lainnya 2"), "Listrik");
    await user.type(within(dialog).getByLabelText("Nominal biaya lainnya 2"), "3000");
    expect(dialog).toHaveTextContent("Total biaya per sesi Rp 53.000 · harga berlaku Rp 149.000");
    expect(dialog).toHaveTextContent("Sisa Rp 96.000 per sesi");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateServicePricing).toHaveBeenCalledWith({
        id: "sv1",
        normalPrice: 189_000,
        promoPrice: 149_000,
        materialCost: 20_000,
        toolCost: 10_000,
        commissionKind: "NOMINAL",
        commissionValue: 15_000,
        otherCosts: [
          { name: "Laundry handuk", amount: 5000 },
          { name: "Listrik", amount: 3000 },
        ],
      }),
    );
  });

  it("total melebihi harga: pesan merah, Simpan nonaktif; menaikkan harga mengaktifkan lagi (BL4)", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Biaya bahan"), "150000");
    expect(dialog).toHaveTextContent("Kurang Rp 1.000 per sesi");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Total biaya Rp 150.000 melebihi harga berlaku Rp 149.000. Naikkan harga berlaku atau kurangi biaya.");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Harga berlaku"));
    await user.type(within(dialog).getByLabelText("Harga berlaku"), "160000");
    expect(dialog).toHaveTextContent("Sisa Rp 10.000 per sesi");
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeEnabled();
  });

  it("biaya lainnya tersimpan tampil lagi; baris kosong diabaikan; Hapus menghapus barisnya (Review Focus 2)", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={{ ...service, otherCosts: [{ name: "Laundry", amount: 5000 }, { name: "Listrik", amount: 3000 }] }} />);
    expect(screen.getByText("bahan Rp 0 · alat Rp 0 · komisi tanpa komisi · lainnya Rp 8.000")).toBeInTheDocument();
    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText("Nama biaya lainnya 1")).toHaveValue("Laundry");
    await user.click(within(dialog).getByRole("button", { name: "Hapus biaya lainnya 1" }));
    expect(within(dialog).getByLabelText("Nama biaya lainnya 1")).toHaveValue("Listrik");
    await user.click(within(dialog).getByRole("button", { name: "+ Biaya lainnya" }));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServicePricing).toHaveBeenCalledWith(expect.objectContaining({ otherCosts: [{ name: "Listrik", amount: 3000 }] })));
  });

  it("komisi persen dihitung dari harga yang sedang diketik (BL7)", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    const dialog = await openDialog(user);
    await user.selectOptions(within(dialog).getByLabelText("Komisi"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Komisi persen"), "10");
    await user.clear(within(dialog).getByLabelText("Harga berlaku"));
    await user.type(within(dialog).getByLabelText("Harga berlaku"), "200000");
    expect(dialog).toHaveTextContent("Total biaya per sesi Rp 20.000 · harga berlaku Rp 200.000");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateServicePricing).toHaveBeenCalledWith(expect.objectContaining({ promoPrice: 200_000, commissionKind: "PERSEN", commissionValue: 10 })));
  });

  it("galat isian biaya lainnya tampil tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderAdmin(<ServiceCostDialog service={service} />);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "+ Biaya lainnya" }));
    await user.type(within(dialog).getByLabelText("Nama biaya lainnya 1"), "Listrik");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi nama dan nominal biaya lainnya baris 1.");
    expect(updateServicePricing).not.toHaveBeenCalled();
  });
});
