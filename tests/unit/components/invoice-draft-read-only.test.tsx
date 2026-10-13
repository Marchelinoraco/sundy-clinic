import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvoiceDraftReadOnly } from "@/components/admin/billing/invoice-draft-read-only";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-notes", () => ({ updateInvoiceNotes: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("InvoiceDraftReadOnly", () => {
  it("Admin Keuangan melihat draf baca-saja dan tetap bisa mengubah catatan tagihan", () => {
    renderAdmin(<InvoiceDraftReadOnly invoiceId="inv1" notes="inject ke 1 L" canEditNotes />);
    expect(screen.getByRole("status")).toHaveTextContent("Tagihan ini masih draf; hanya resepsionis yang bisa mengubahnya.");
    expect(screen.getByLabelText("Catatan internal")).toHaveValue("inject ke 1 L");
    expect(screen.getByRole("button", { name: "Simpan catatan" })).toBeInTheDocument();
  });

  it("tanpa hak catatan: catatan hanya dibaca", () => {
    renderAdmin(<InvoiceDraftReadOnly invoiceId="inv1" notes="inject ke 1 L" canEditNotes={false} />);
    expect(screen.getByText("inject ke 1 L")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan catatan" })).not.toBeInTheDocument();
  });
});
