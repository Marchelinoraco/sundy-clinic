import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApproval } from "@/components/admin/approval/use-approval";
import type { ActionResult } from "@/lib/action-result";
import { APPROVAL_REQUIRED, NO_APPROVERS, type ApprovalInput } from "@/lib/approval";
import { listApprovers } from "@/server/approval-pin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/approval-pin", () => ({ listApprovers: vi.fn() }));

/** Tombol yang menjalankan `action` lewat withApproval dan menulis hasilnya. */
function Harness({ action }: { action: (approval?: ApprovalInput) => Promise<ActionResult<string>> }) {
  const { withApproval, dialog } = useApproval();
  const [outcome, setOutcome] = useState("");
  return (
    <>
      <button type="button" onClick={async () => {
        const result = await withApproval(action);
        setOutcome(result === null ? "batal" : result.ok ? `ok:${result.data}` : `gagal:${result.error}`);
      }}>
        Jalankan
      </button>
      <output>{outcome}</output>
      {dialog}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listApprovers).mockResolvedValue({ ok: true, data: [{ id: "a1", name: "Rina" }, { id: "a2", name: "Super Ana" }] });
});

describe("useApproval (spec PIN P7, P12)", () => {
  it("aksi pertama ditolak APPROVAL_REQUIRED membuka Persetujuan; Setujui mengulang dengan approverId dan PIN", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(approval?: ApprovalInput) => Promise<ActionResult<string>>>()
      .mockResolvedValueOnce({ ok: false, error: APPROVAL_REQUIRED })
      .mockResolvedValueOnce({ ok: true, data: "tersimpan" });
    renderAdmin(<Harness action={action} />);
    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    const dialog = await screen.findByRole("dialog", { name: "Persetujuan" });
    await waitFor(() => expect(within(dialog).getByRole("option", { name: "Super Ana" })).toBeInTheDocument());
    await user.selectOptions(within(dialog).getByLabelText("Penyetuju"), "a1");
    await user.type(within(dialog).getByLabelText("PIN"), "135790");
    await user.click(within(dialog).getByRole("button", { name: "Setujui" }));
    await waitFor(() => expect(action).toHaveBeenLastCalledWith({ approverId: "a1", pin: "135790" }));
    expect(action.mock.calls[0][0]).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ok:tersimpan"));
    expect(screen.queryByRole("dialog", { name: "Persetujuan" })).toBeNull();
  });

  it("PIN salah tampil di dialog, dialog tetap terbuka", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(approval?: ApprovalInput) => Promise<ActionResult<string>>>()
      .mockResolvedValueOnce({ ok: false, error: APPROVAL_REQUIRED })
      .mockResolvedValueOnce({ ok: false, error: "PIN salah." });
    renderAdmin(<Harness action={action} />);
    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    const dialog = await screen.findByRole("dialog", { name: "Persetujuan" });
    await waitFor(() => expect(within(dialog).getByRole("option", { name: "Rina" })).toBeInTheDocument());
    await user.selectOptions(within(dialog).getByLabelText("Penyetuju"), "a1");
    await user.type(within(dialog).getByLabelText("PIN"), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Setujui" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("PIN salah.");
    expect(screen.getByRole("dialog", { name: "Persetujuan" })).toBeInTheDocument();
  });

  it("tanpa penyetuju: pesan NO_APPROVERS dan Setujui nonaktif", async () => {
    vi.mocked(listApprovers).mockResolvedValue({ ok: true, data: [] });
    const user = userEvent.setup();
    renderAdmin(<Harness action={vi.fn().mockResolvedValue({ ok: false, error: APPROVAL_REQUIRED })} />);
    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    const dialog = await screen.findByRole("dialog", { name: "Persetujuan" });
    expect(await within(dialog).findByText(NO_APPROVERS)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Setujui" })).toBeDisabled();
  });

  it("Batal mengembalikan null; galat lain diteruskan tanpa membuka dialog", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness action={vi.fn().mockResolvedValue({ ok: false, error: APPROVAL_REQUIRED })} />);
    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    const dialog = await screen.findByRole("dialog", { name: "Persetujuan" });
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("batal"));
  });

  it("galat selain APPROVAL_REQUIRED diteruskan tanpa membuka dialog", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness action={vi.fn().mockResolvedValue({ ok: false, error: "Diskon di atas 20% diberikan oleh Admin Keuangan." })} />);
    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("gagal:Diskon di atas 20%"));
    expect(screen.queryByRole("dialog", { name: "Persetujuan" })).toBeNull();
  });
});
