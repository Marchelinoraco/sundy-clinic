import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineServiceCard } from "@/components/admin/online-service-card";
import { updateOnlineService } from "@/server/service-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/service-admin", () => ({ updateOnlineService: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("OnlineServiceCard", () => {
  it("menyimpan harga, durasi, dan status aktif", async () => {
    const user = userEvent.setup();
    vi.mocked(updateOnlineService).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<OnlineServiceCard settings={{ price: 0, durationMin: 30, active: false }} />);

    expect(screen.getByRole("region", { name: "Konsultasi Online" })).toHaveTextContent("Belum aktif");
    await user.type(screen.getByLabelText("Harga Konsultasi Online"), "250000");
    await user.selectOptions(screen.getByLabelText("Durasi"), "45");
    await user.click(screen.getByLabelText("Aktifkan konsultasi online"));
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(updateOnlineService).toHaveBeenCalledWith({ price: 250000, durationMin: 45, active: true }));
  });

  it("menampilkan galat dari server", async () => {
    const user = userEvent.setup();
    vi.mocked(updateOnlineService).mockResolvedValue({ ok: false, error: "Isi harga Konsultasi Online sebelum mengaktifkannya." });
    renderAdmin(<OnlineServiceCard settings={{ price: 0, durationMin: 30, active: false }} />);
    await user.click(screen.getByLabelText("Aktifkan konsultasi online"));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Isi harga Konsultasi Online sebelum mengaktifkannya.");
  });
});
