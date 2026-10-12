import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicConsultationCard } from "@/components/admin/clinic-consultation-card";
import { updateClinicConsultationDuration } from "@/server/service-admin";
import { toast } from "sonner";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("@/server/service-admin", () => ({ updateClinicConsultationDuration: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => vi.clearAllMocks());

describe("ClinicConsultationCard", () => {
  it("menampilkan durasi sekarang dan menyimpan durasi baru", async () => {
    const user = userEvent.setup();
    vi.mocked(updateClinicConsultationDuration).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<ClinicConsultationCard minutes={30} />);

    const card = screen.getByRole("region", { name: "Konsultasi di klinik" });
    expect(card).toHaveTextContent("Lama konsultasi sekarang: 30 menit");
    expect(card).toHaveTextContent("Jam mulai ditawarkan tiap 15 menit");
    expect(screen.getByLabelText("Lama konsultasi")).toHaveValue("30");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["15 menit", "30 menit", "45 menit", "60 menit"]);

    await user.selectOptions(screen.getByLabelText("Lama konsultasi"), "15");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(updateClinicConsultationDuration).toHaveBeenCalledWith(15));
    expect(toast.success).toHaveBeenCalledWith("Lama konsultasi klinik: 15 menit.");
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan galat dari server", async () => {
    const user = userEvent.setup();
    vi.mocked(updateClinicConsultationDuration).mockResolvedValue({ ok: false, error: "Durasi harus 15, 30, 45, atau 60 menit." });
    renderAdmin(<ClinicConsultationCard minutes={30} />);
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Durasi harus 15, 30, 45, atau 60 menit.");
  });
});
