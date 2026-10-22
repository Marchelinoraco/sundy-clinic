import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LineDiscountDialog, LineDiscountNote } from "@/components/admin/billing/line-discount-dialog";
import { clearLineDiscount, setLineDiscount } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ setLineDiscount: vi.fn(), clearLineDiscount: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const LINE: InvoiceLineRow = {
  id: "l1",
  kind: "BARANG",
  name: "Serum C",
  quantity: 2,
  unitPrice: 150_000,
  gross: 300_000,
  amount: 300_000,
  discountAmount: 0,
  discountReason: null,
  discountSource: null,
  priceNote: null,
  serviceId: null,
  itemId: "i1",
  catalogLinked: true,
  fromDispensing: false, fromDoctorPackage: false,
  prescription: null,
  performerId: null,
  performerName: null,
  treatmentPackageId: null,
  packageUse: null,
  packageNote: null,
  costing: null,
};

beforeEach(() => vi.clearAllMocks());

describe("LineDiscountDialog", () => {
  it("persen: pratinjau rupiah, lalu dikirim dengan alasan", async () => {
    vi.mocked(setLineDiscount).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    renderAdmin(<LineDiscountDialog invoiceId="inv" version={2} line={LINE} />);
    await user.click(screen.getByRole("button", { name: "Diskon Serum C" }));
    const dialog = await screen.findByRole("dialog", { name: "Diskon Serum C" });
    await user.selectOptions(within(dialog).getByLabelText("Jenis diskon"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Persen"), "15");
    expect(dialog).toHaveTextContent("Potongan Rp 45.000 dari Rp 300.000");
    await user.type(within(dialog).getByLabelText("Alasan"), "Kemasan penyok");
    await user.click(within(dialog).getByRole("button", { name: "Terapkan" }));
    await waitFor(() => expect(setLineDiscount).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", kind: "PERSEN", value: 15, reason: "Kemasan penyok" }));
  });

  it("validasi di layar: melebihi harga baris dan alasan kosong", async () => {
    const user = userEvent.setup();
    renderAdmin(<LineDiscountDialog invoiceId="inv" version={2} line={LINE} />);
    await user.click(screen.getByRole("button", { name: "Diskon Serum C" }));
    const dialog = await screen.findByRole("dialog", { name: "Diskon Serum C" });
    await user.type(within(dialog).getByLabelText("Nominal"), "300001");
    await user.type(within(dialog).getByLabelText("Alasan"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Terapkan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Diskon tidak boleh melebihi harga baris.");
    expect(setLineDiscount).not.toHaveBeenCalled();
  });

  it("galat batas dari server tampil; Hapus diskon untuk baris berdiskon", async () => {
    vi.mocked(setLineDiscount).mockResolvedValue({ ok: false, error: "Diskon di atas 20% diberikan oleh Admin Keuangan." });
    vi.mocked(clearLineDiscount).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const discounted = { ...LINE, discountAmount: 30_000, amount: 270_000, discountReason: "Promo: Oktober", discountSource: "PROMO" as const };
    renderAdmin(<LineDiscountDialog invoiceId="inv" version={2} line={discounted} />);
    await user.click(screen.getByRole("button", { name: "Diskon Serum C" }));
    const dialog = await screen.findByRole("dialog", { name: "Diskon Serum C" });
    expect(dialog).toHaveTextContent("Sekarang: promo Rp 30.000 (Promo: Oktober). Mengubahnya menjadikan diskon manual.");
    await user.type(within(dialog).getByLabelText("Nominal"), "1000");
    await user.type(within(dialog).getByLabelText("Alasan"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Terapkan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Diskon di atas 20% diberikan oleh Admin Keuangan.");
    const clear = within(dialog).getByRole("button", { name: "Hapus diskon" });
    await waitFor(() => expect(clear).toBeEnabled());
    await user.click(clear);
    await waitFor(() => expect(clearLineDiscount).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1" }));
  });
});

describe("LineDiscountNote", () => {
  it("promo dan manual dibedakan", () => {
    const { rerender } = renderAdmin(<LineDiscountNote line={{ ...LINE, discountAmount: 30_000, discountReason: "Promo: Oktober", discountSource: "PROMO" }} />);
    expect(screen.getByText("Promo")).toBeInTheDocument();
    expect(screen.getByText(/Diskon −Rp 30\.000 · Promo: Oktober/)).toBeInTheDocument();
    rerender(<LineDiscountNote line={{ ...LINE, discountAmount: 5_000, discountReason: "Pelanggan lama", discountSource: "MANUAL" }} />);
    expect(screen.queryByText("Promo")).not.toBeInTheDocument();
    expect(screen.getByText(/Diskon −Rp 5\.000 · Pelanggan lama/)).toBeInTheDocument();
  });
});
