import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodRecallDialog } from "@/components/admin/food-recall-dialog";
import { getFoodRecallLink, offerFoodRecall } from "@/server/food-recall-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/food-recall-admin", () => ({ getFoodRecallLink: vi.fn(), offerFoodRecall: vi.fn() }));

const TARGET = { appointmentId: "a1", code: "SDY-CI01", patientName: "Siti Rahayu" };
const OPEN_LINK = {
  state: "OPEN" as const,
  filled: true,
  url: "https://sundyclinic.com/food-recall#kode",
  message: { text: "Halo", link: "https://wa.me/6281234567890?text=Halo" },
};

function renderDialog() {
  renderAdmin(<FoodRecallDialog target={TARGET} open onOpenChange={vi.fn()} />);
  return screen.findByRole("dialog", { name: "Food recall — SDY-CI01" });
}

beforeEach(() => vi.clearAllMocks());

describe("FoodRecallDialog", () => {
  it("menawarkan food recall yang belum ditawarkan saat check-in", async () => {
    const user = userEvent.setup();
    vi.mocked(getFoodRecallLink).mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } });
    vi.mocked(offerFoodRecall).mockResolvedValue({ ok: true, data: { ...OPEN_LINK, filled: false } });
    const dialog = await renderDialog();
    await user.click(await within(dialog).findByRole("button", { name: "Tawarkan food recall" }));
    await waitFor(() => expect(offerFoodRecall).toHaveBeenCalledWith("a1"));
    expect(await within(dialog).findByRole("link", { name: "Buka di tablet" })).toHaveAttribute("href", OPEN_LINK.url);
    expect(within(dialog).getByText("Belum diisi.")).toBeInTheDocument();
  });

  it("link yang berlaku: status sudah diisi, buka di tablet, kirim lewat WA", async () => {
    vi.mocked(getFoodRecallLink).mockResolvedValue({ ok: true, data: OPEN_LINK });
    const dialog = await renderDialog();
    expect(await within(dialog).findByText("Sudah diisi — customer masih bisa mengirim ulang.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Kirim lewat WA" })).toHaveAttribute("href", OPEN_LINK.message.link);
  });

  it("food recall yang sudah diterima dokter tidak menawarkan link", async () => {
    vi.mocked(getFoodRecallLink).mockResolvedValue({ ok: true, data: { state: "RECEIVED", filled: true } });
    const dialog = await renderDialog();
    expect(await within(dialog).findByText("Food recall sudah diterima dokter.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Buka di tablet" })).not.toBeInTheDocument();
  });
});
