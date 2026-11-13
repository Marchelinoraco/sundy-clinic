import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancelLegacyDialog } from "@/components/admin/package/cancel-legacy-dialog";
import { CorrectLegacyDialog } from "@/components/admin/package/correct-legacy-dialog";
import { InvoiceA4Paper } from "@/components/receipt/invoice-a4-paper";
import { cancelLegacyPackage, correctLegacyRemaining } from "@/server/legacy-packages";
import { INVOICE_A4 } from "../../fixtures/invoice-a4";
import { renderAdmin } from "../helpers/render-admin";

// Halaman detail paket lama: Koreksi sisa, Batalkan paket lama, dan cetakan tanpa batas waktu (spec paket lama bagian 5, 6).
vi.mock("@/server/legacy-packages", () => ({ cancelLegacyPackage: vi.fn(), correctLegacyRemaining: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("CorrectLegacyDialog", () => {
  it("batas sisa = jatah − terpakai di SunDY; mengirim sisa yang benar dengan alasan", async () => {
    vi.mocked(correctLegacyRemaining).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<CorrectLegacyDialog packageId="pp1" items={[{ id: "i1", name: "Facial", unit: null, remaining: 2, sessions: 4, usedHere: 1 }]} />);
    await user.click(screen.getByRole("button", { name: "Koreksi sisa" }));
    const dialog = await screen.findByRole("dialog", { name: "Koreksi sisa" });
    const field = within(dialog).getByLabelText("Sisa yang benar Facial");
    expect(field).toHaveValue(2);
    expect(dialog).toHaveTextContent("0–3");
    await user.clear(field);
    await user.type(field, "4");
    await user.type(within(dialog).getByLabelText("Alasan"), "salah hitung");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByText("Sisa Facial 0–3.")).toBeInTheDocument();
    expect(correctLegacyRemaining).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, "3");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(correctLegacyRemaining).toHaveBeenCalledWith({ packageId: "pp1", reason: "salah hitung", remaining: { i1: 3 } }));
  });
});

describe("CancelLegacyDialog", () => {
  it("alasan wajib sebelum membatalkan", async () => {
    vi.mocked(cancelLegacyPackage).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<CancelLegacyDialog packageId="pp1" />);
    await user.click(screen.getByRole("button", { name: "Batalkan paket lama" }));
    const dialog = await screen.findByRole("dialog", { name: "Batalkan paket lama" });
    await user.click(within(dialog).getByRole("button", { name: "Batalkan paket" }));
    expect(await within(dialog).findByText("Isi alasan pembatalan.")).toBeInTheDocument();
    expect(cancelLegacyPackage).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("Alasan"), "salah pasien");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan paket" }));
    await waitFor(() => expect(cancelLegacyPackage).toHaveBeenCalledWith({ packageId: "pp1", reason: "salah pasien" }));
  });
});

describe("InvoiceA4Paper — paket lama", () => {
  it("paket tanpa batas waktu tertulis 'tanpa batas waktu', tidak pernah tanggal penanda", () => {
    const pkg = { ...INVOICE_A4.packages[0], expiresOn: "9999-12-31" };
    render(<InvoiceA4Paper invoice={{ ...INVOICE_A4, packages: [pkg] }} />);
    const section = screen.getByRole("region", { name: "Paket Anda" });
    expect(section).toHaveTextContent("tanpa batas waktu");
    expect(section).not.toHaveTextContent("9999");
  });
});
