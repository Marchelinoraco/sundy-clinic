import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptResetDialog } from "@/components/admin/billing/receipt-reset-dialog";
import { ReceiptSendDialog } from "@/components/admin/billing/receipt-send-dialog";
import { getReceiptMessage, resetReceiptLink } from "@/server/receipt";
import { toast } from "sonner";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/receipt", () => ({ getReceiptMessage: vi.fn(), resetReceiptLink: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEXT = "Halo Budi, terima kasih sudah berkunjung ke SunDY Clinic.\nLihat struk lengkap: https://x/struk#k";

beforeEach(() => vi.clearAllMocks());

describe("ReceiptSendDialog", () => {
  it("memuat pesan, menampilkan pratinjau, tautan Buka WhatsApp, dan Salin pesan", async () => {
    vi.mocked(getReceiptMessage).mockResolvedValue({ ok: true, data: { text: TEXT, link: "https://wa.me/6281?text=x" } });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderAdmin(<ReceiptSendDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Kirim struk via WA" }));
    const dialog = await screen.findByRole("dialog", { name: "Kirim struk" });
    expect(getReceiptMessage).toHaveBeenCalledWith("inv1");
    expect(await within(dialog).findByText(/Lihat struk lengkap: https:\/\/x\/struk#k/)).toBeInTheDocument();
    const open = within(dialog).getByRole("link", { name: "Buka WhatsApp" });
    expect(open).toHaveAttribute("href", "https://wa.me/6281?text=x");
    expect(open).toHaveAttribute("target", "_blank");
    await user.click(within(dialog).getByRole("button", { name: "Salin pesan" }));
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it("nomor pasien tidak sah: hanya Salin pesan", async () => {
    vi.mocked(getReceiptMessage).mockResolvedValue({ ok: true, data: { text: TEXT, link: null } });
    const user = userEvent.setup();
    renderAdmin(<ReceiptSendDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Kirim struk via WA" }));
    const dialog = await screen.findByRole("dialog", { name: "Kirim struk" });
    expect(await within(dialog).findByText("Nomor WhatsApp pasien tidak dikenali. Salin pesan lalu kirim manual.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Buka WhatsApp" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Salin pesan" })).toBeEnabled();
  });

  it("galat server tampil di dialog", async () => {
    vi.mocked(getReceiptMessage).mockResolvedValue({ ok: false, error: "Struk hanya untuk tagihan final." });
    const user = userEvent.setup();
    renderAdmin(<ReceiptSendDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Kirim struk via WA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Struk hanya untuk tagihan final.");
  });
});

describe("ReceiptResetDialog", () => {
  it("meminta konfirmasi lalu mengganti tautan", async () => {
    vi.mocked(resetReceiptLink).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ReceiptResetDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Ganti tautan" }));
    const dialog = await screen.findByRole("dialog", { name: "Ganti tautan struk?" });
    expect(dialog).toHaveTextContent("Tautan struk yang sudah terkirim tidak bisa dibuka lagi.");
    await user.click(within(dialog).getByRole("button", { name: "Ganti" }));
    await waitFor(() => expect(resetReceiptLink).toHaveBeenCalledWith("inv1"));
    expect(toast.success).toHaveBeenCalledWith("Tautan struk diganti. Kirim ulang struk bila perlu.");
  });

  it("galat tampil dan dialog tetap terbuka", async () => {
    vi.mocked(resetReceiptLink).mockResolvedValue({ ok: false, error: "Tautan struk hanya untuk tagihan final." });
    const user = userEvent.setup();
    renderAdmin(<ReceiptResetDialog invoiceId="inv1" />);
    await user.click(screen.getByRole("button", { name: "Ganti tautan" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Ganti tautan struk?" })).getByRole("button", { name: "Ganti" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tautan struk hanya untuk tagihan final.");
  });
});
