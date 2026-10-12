import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceNotesForm } from "@/components/admin/billing/invoice-notes-form";
import { updateInvoiceNotes } from "@/server/invoice-notes";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-notes", () => ({ updateInvoiceNotes: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("InvoiceNotesForm", () => {
  it("menyimpan catatan internal", async () => {
    vi.mocked(updateInvoiceNotes).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<InvoiceNotesForm invoiceId="inv1" notes={null} canEdit />);
    expect(screen.getByText("Hanya terlihat staf; tidak ikut struk.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Catatan internal"), "inject ke 1 L");
    await user.click(screen.getByRole("button", { name: "Simpan catatan" }));
    await waitFor(() => expect(updateInvoiceNotes).toHaveBeenCalledWith({ invoiceId: "inv1", notes: "inject ke 1 L" }));
  });

  it("tanpa hak: hanya dibaca", () => {
    renderAdmin(<InvoiceNotesForm invoiceId="inv1" notes="catatan lama" canEdit={false} />);
    expect(screen.getByText("catatan lama")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan catatan" })).not.toBeInTheDocument();
  });

  it("galat server tampil", async () => {
    vi.mocked(updateInvoiceNotes).mockResolvedValue({ ok: false, error: "Catatan paling banyak 500 karakter." });
    const user = userEvent.setup();
    renderAdmin(<InvoiceNotesForm invoiceId="inv1" notes={null} canEdit />);
    await user.type(screen.getByLabelText("Catatan internal"), "x");
    await user.click(screen.getByRole("button", { name: "Simpan catatan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Catatan paling banyak 500 karakter.");
  });
});
