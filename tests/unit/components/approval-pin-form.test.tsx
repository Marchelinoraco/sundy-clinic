import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalPinForm } from "@/components/admin/approval-pin-form";
import { setOwnApprovalPin } from "@/server/approval-pin";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/approval-pin", () => ({ setOwnApprovalPin: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setOwnApprovalPin).mockResolvedValue({ ok: true, data: undefined });
});

describe("ApprovalPinForm (spec PIN P8)", () => {
  it("PIN pertama: tanpa PIN lama; mengirim PIN baru", async () => {
    const user = userEvent.setup();
    renderAdmin(<ApprovalPinForm hasPin={false} />);
    expect(screen.queryByLabelText("PIN lama")).toBeNull();
    await user.type(screen.getByLabelText("PIN baru"), "135790");
    await user.type(screen.getByLabelText("Ulangi PIN baru"), "135790");
    await user.click(screen.getByRole("button", { name: "Simpan PIN" }));
    await waitFor(() => expect(setOwnApprovalPin).toHaveBeenCalledWith({ newPin: "135790" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("mengganti: PIN lama wajib; ulangan yang beda ditolak sebelum dikirim; galat server tampil", async () => {
    const user = userEvent.setup();
    vi.mocked(setOwnApprovalPin).mockResolvedValueOnce({ ok: false, error: "PIN lama salah." });
    renderAdmin(<ApprovalPinForm hasPin />);
    for (const label of ["PIN lama", "PIN baru", "Ulangi PIN baru"]) expect(screen.getByLabelText(label)).toHaveAttribute("autocomplete", "one-time-code");
    await user.type(screen.getByLabelText("PIN lama"), "000000");
    await user.type(screen.getByLabelText("PIN baru"), "246802");
    await user.type(screen.getByLabelText("Ulangi PIN baru"), "246800");
    await user.click(screen.getByRole("button", { name: "Simpan PIN" }));
    expect(screen.getByRole("alert")).toHaveTextContent("PIN baru dan ulangannya tidak sama.");
    expect(setOwnApprovalPin).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Ulangi PIN baru"));
    await user.type(screen.getByLabelText("Ulangi PIN baru"), "246802");
    await user.click(screen.getByRole("button", { name: "Simpan PIN" }));
    await waitFor(() => expect(setOwnApprovalPin).toHaveBeenCalledWith({ currentPin: "000000", newPin: "246802" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PIN lama salah.");
  });
});
