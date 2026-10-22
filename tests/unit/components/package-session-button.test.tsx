import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackageSessionButton } from "@/components/admin/billing/package-session-button";
import type { PackageOption } from "@/lib/treatment-package";
import { applyPackageSession, releasePackageSession } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ applyPackageSession: vi.fn(), releasePackageSession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const line = { id: "l1", name: "Relaxing Facial", kind: "TREATMENT" as const, serviceId: "s1", itemId: null, quantity: 1, fromDispensing: false, fromDoctorPackage: false, packageUse: null };
const option = (patch: Partial<PackageOption>): PackageOption => ({
  patientPackageItemId: "i1",
  purchaseLineId: null,
  patientPackageId: "p1",
  packageName: "Facial 5x",
  serviceId: "s1",
  itemId: null,
  serviceName: "Relaxing Facial",
  unit: null,
  sessions: 5,
  remaining: 3,
  startsOn: "2026-10-01",
  expiresOn: "2027-03-30",
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("PackageSessionButton", () => {
  it("satu paket cocok: langsung memakai paket itu", async () => {
    vi.mocked(applyPackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={line} options={[option({}), option({ patientPackageItemId: "x", serviceId: "s9" })]} />);
    await user.click(screen.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }));
    await waitFor(() => expect(applyPackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", patientPackageItemId: "i1" }));
  });

  it("lebih dari satu paket: memilih di dialog, kedaluwarsa terdekat terpilih lebih dulu", async () => {
    vi.mocked(applyPackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const options = [option({ patientPackageItemId: "late", packageName: "Lama", expiresOn: "2027-06-01" }), option({ patientPackageItemId: "soon", packageName: "Segera", expiresOn: "2026-11-01" })];
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={line} options={options} />);
    await user.click(screen.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }));
    const dialog = await screen.findByRole("dialog", { name: "Pilih paket untuk Relaxing Facial" });
    expect(within(dialog).getByLabelText("Paket")).toHaveValue("soon");
    await user.selectOptions(within(dialog).getByLabelText("Paket"), "late");
    await user.click(within(dialog).getByRole("button", { name: "Pakai" }));
    await waitFor(() => expect(applyPackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", patientPackageItemId: "late" }));
  });

  it("baris barang (juga obat resep) memakai jatah paket, termasuk paket yang dibeli di tagihan ini (spec paket barang PB4)", async () => {
    vi.mocked(applyPackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const goodsLine = { ...line, name: "Slimming", kind: "BARANG" as const, serviceId: null, itemId: "it9", quantity: 10, fromDispensing: true };
    const fresh = option({ patientPackageItemId: null, purchaseLineId: "pl1", patientPackageId: "baru:pl1", packageName: "Lux", serviceId: null, itemId: "it9", unit: "kapsul", sessions: 30, remaining: 30 });
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={goodsLine} options={[option({}), fresh, { ...fresh, purchaseLineId: "pl2", remaining: 5 }]} />);
    await user.click(screen.getByRole("button", { name: "Pakai jatah paket Slimming" }));
    await waitFor(() => expect(applyPackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", purchaseLineId: "pl1" }));
  });

  it("baris yang memakai paket menawarkan Lepas paket; baris tanpa paket cocok tidak menampilkan tombol", async () => {
    vi.mocked(releasePackageSession).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const { unmount } = renderAdmin(
      <PackageSessionButton invoiceId="inv" version={2} line={{ ...line, packageUse: { patientPackageItemId: "i1", purchaseLineId: null, packageName: "Facial 5x" } }} options={[]} />,
    );
    await user.click(screen.getByRole("button", { name: "Lepas paket Relaxing Facial" }));
    await waitFor(() => expect(releasePackageSession).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1" }));
    unmount();
    renderAdmin(<PackageSessionButton invoiceId="inv" version={2} line={{ ...line, kind: "LAYANAN" }} options={[option({})]} />);
    expect(screen.queryByRole("button", { name: /sesi paket/ })).not.toBeInTheDocument();
  });
});
