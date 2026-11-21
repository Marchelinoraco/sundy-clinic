import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAccessDialog } from "@/components/admin/staff/staff-access-dialog";
import { setStaffExtraCapabilities } from "@/server/staff-access";
import type { StaffRow } from "@/server/staff";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/staff-access", () => ({ setStaffExtraCapabilities: vi.fn() }));

import { CAPABILITY_LABEL, GRANTABLE_CAPABILITIES } from "@/lib/permissions";

const LABELS = GRANTABLE_CAPABILITIES.map((c) => CAPABILITY_LABEL[c]);

const row = (patch: Partial<StaffRow>): StaffRow => ({
  id: "s-1",
  name: "Rina Baru",
  role: "RESEPSIONIS",
  showOnWebsite: false,
  isActive: true,
  email: "rina@sundy.test",
  mustChangePassword: false,
  specialty: null,
  bio: null,
  photoUrl: null,
  hasApprovalPin: false,
  extraCapabilities: [],
  ...patch,
});

function renderDialog(r: StaffRow, onClose = vi.fn()) {
  renderAdmin(<StaffAccessDialog row={r} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole("dialog", { name: `Akses tambahan — ${r.name}` }) };
}

beforeEach(() => vi.clearAllMocks());

describe("dialog akses tambahan", () => {
  it("peran tanpa akses stok: enam kotak berlabel, semua aktif dan kosong", () => {
    const { dialog } = renderDialog(row({}));
    expect(within(dialog).getByText("Peran dasar: Resepsionis")).toBeInTheDocument();
    expect(within(dialog).getByText("Mencentang satu fitur otomatis memberi akses melihat stok.")).toBeInTheDocument();
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    LABELS.forEach((label, i) => expect(boxes[i].closest("label")).toHaveTextContent(label as string));
    for (const b of boxes) {
      expect(b).toBeEnabled();
      expect(b).not.toBeChecked();
    }
  });

  it("peran Apoteker: semua tercentang, nonaktif, dengan keterangan 'dari peran'", () => {
    const { dialog } = renderDialog(row({ role: "APOTEKER" }));
    for (const b of within(dialog).getAllByRole("checkbox")) {
      expect(b).toBeChecked();
      expect(b).toBeDisabled();
    }
    expect(within(dialog).getAllByText("dari peran Apoteker")).toHaveLength(6);
  });

  it("akses tambahan yang sudah ada tercentang", () => {
    const { dialog } = renderDialog(row({ extraCapabilities: ["stock:receive"] }));
    expect(within(dialog).getByRole("checkbox", { name: /Catat barang masuk/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Kelola barang/ })).not.toBeChecked();
  });

  it("Simpan mengirim kemampuan tercentang berurutan GRANTABLE, lalu menutup dan menyegarkan", async () => {
    vi.mocked(setStaffExtraCapabilities).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    const { dialog, onClose } = renderDialog(row({ extraCapabilities: ["stock:receive"] }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Kelola barang/ }));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setStaffExtraCapabilities).toHaveBeenCalledTimes(1);
    expect(setStaffExtraCapabilities).toHaveBeenCalledWith("s-1", ["stock:item", "stock:receive"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("kemampuan milik peran tidak pernah dikirim", async () => {
    vi.mocked(setStaffExtraCapabilities).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    const { dialog } = renderDialog(row({ role: "APOTEKER" }));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(setStaffExtraCapabilities).toHaveBeenCalledWith("s-1", []));
  });

  it("galat server tampil di dalam dialog dan dialog tetap terbuka", async () => {
    vi.mocked(setStaffExtraCapabilities).mockResolvedValue({ ok: false, error: "Akses tidak dikenal." });
    const user = userEvent.setup();
    const { dialog, onClose } = renderDialog(row({}));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Akses tidak dikenal.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Akses tambahan — Rina Baru" })).toBeInTheDocument();
  });
});
