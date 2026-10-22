import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeclinePackageDialog } from "@/components/admin/billing/decline-package-dialog";
import { declineDoctorPackage } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/invoice-drafts", () => ({ declineDoctorPackage: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(declineDoctorPackage).mockResolvedValue({ ok: true, data: { version: 4 } });
});

describe("DeclinePackageDialog (spec vital perawat PR3)", () => {
  it("alasan wajib 2–200 karakter; terkirim dengan versi; dokter akan melihatnya", async () => {
    const user = userEvent.setup();
    renderAdmin(<DeclinePackageDialog invoiceId="inv1" version={3} line={{ id: "l9", name: "Glowing 3 Bulan" }} />);
    await user.click(screen.getByRole("button", { name: "Tidak dibeli Glowing 3 Bulan" }));
    const dialog = await screen.findByRole("dialog", { name: "Paket tidak dibeli — Glowing 3 Bulan" });
    expect(dialog).toHaveTextContent("Alasan terlihat oleh dokter di catatan kunjungan.");
    await user.type(within(dialog).getByLabelText("Alasan"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Alasan 2–200 karakter.");
    expect(declineDoctorPackage).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("Alasan"), "ixi pikir-pikir dulu");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(declineDoctorPackage).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, lineId: "l9", reason: "xixi pikir-pikir dulu" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
