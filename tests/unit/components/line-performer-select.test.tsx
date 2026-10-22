import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinePerformerSelect } from "@/components/admin/billing/line-performer-select";
import { setLinePerformer } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ setLinePerformer: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const performers = [
  { id: "t1", name: "Rina" },
  { id: "d1", name: "dr. Diane" },
];

beforeEach(() => vi.clearAllMocks());

describe("LinePerformerSelect", () => {
  it("mengganti pelaksana baris treatment; baris lain tanpa pilihan", async () => {
    vi.mocked(setLinePerformer).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    const { unmount } = renderAdmin(
      <LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l1", name: "Facial", kind: "TREATMENT", performerId: null, performerName: null }} performers={performers} />,
    );
    await user.selectOptions(screen.getByLabelText("Pelaksana Facial"), "t1");
    await waitFor(() => expect(setLinePerformer).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, lineId: "l1", performerId: "t1" }));
    unmount();
    renderAdmin(<LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l2", name: "Konsultasi", kind: "LAYANAN", performerId: null, performerName: null }} performers={performers} />);
    expect(screen.queryByLabelText("Pelaksana Konsultasi")).not.toBeInTheDocument();
  });

  it("pelaksana yang sudah tidak aktif tetap tampil sebagai pilihan terpilih", () => {
    renderAdmin(<LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l1", name: "Facial", kind: "TREATMENT", performerId: "x9", performerName: "Lama" }} performers={performers} />);
    expect(screen.getByLabelText("Pelaksana Facial")).toHaveValue("x9");
    expect(screen.getByRole("option", { name: "Lama" })).toBeInTheDocument();
  });

  it("treatment tanpa pelaksana: pilihan kosong bertuliskan 'Pilih pelaksana' dan ditandai belum lengkap (spec aturan pakai PL3)", () => {
    const { unmount } = renderAdmin(
      <LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l1", name: "Facial", kind: "TREATMENT", performerId: null, performerName: null }} performers={performers} />,
    );
    expect(screen.getByRole("option", { name: "Pilih pelaksana" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Tanpa pelaksana" })).toBeNull();
    expect(screen.getByLabelText("Pelaksana Facial")).toHaveAttribute("aria-invalid", "true");
    unmount();

    renderAdmin(<LinePerformerSelect invoiceId="inv" version={2} line={{ id: "l1", name: "Facial", kind: "TREATMENT", performerId: "t1", performerName: "Rina" }} performers={performers} />);
    expect(screen.getByLabelText("Pelaksana Facial")).not.toHaveAttribute("aria-invalid", "true");
  });
});
