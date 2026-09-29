import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { IntakeApprovalForm } from "@/components/admin/intake-approval-form";
import { approveIntakeToPatient } from "@/server/intake";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));

const approval = {
  state: "ready" as const,
  patientId: "p1",
  patientVersion: "2026-10-01T02:00:00.000Z",
  current: { allergies: "Udang", medicalHistory: null },
  proposed: { allergies: "Amoxicillin", medicalHistory: "Darah tinggi: Amlodipine" },
  prefill: { allergies: "Udang\nAmoxicillin", medicalHistory: "Darah tinggi: Amlodipine" },
};

describe("IntakeApprovalForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("menampilkan catatan saat ini, usulan, dan isi awal kolom sunting", () => {
    render(<IntakeApprovalForm intakeId="i1" approval={approval} />);
    expect(screen.getByText("Udang")).toBeInTheDocument();
    expect(screen.getAllByText("(kosong)")).toHaveLength(1);
    expect(screen.getByLabelText("Alergi")).toHaveValue("Udang\nAmoxicillin");
    expect(screen.getByLabelText("Riwayat penyakit & obat")).toHaveValue("Darah tinggi: Amlodipine");
  });

  it("mengirim teks yang disunting beserta versi pasien, lalu memuat ulang halaman", async () => {
    vi.mocked(approveIntakeToPatient).mockResolvedValue({ ok: true, data: undefined });
    render(<IntakeApprovalForm intakeId="i1" approval={approval} />);
    const history = screen.getByLabelText("Riwayat penyakit & obat");
    await userEvent.clear(history);
    await userEvent.type(history, "Darah tinggi: Amlodipine (kontrol)");
    await userEvent.click(screen.getByRole("button", { name: "Setujui ke data pasien" }));

    await waitFor(() =>
      expect(approveIntakeToPatient).toHaveBeenCalledWith({
        intakeId: "i1",
        allergies: "Udang\nAmoxicillin",
        medicalHistory: "Darah tinggi: Amlodipine (kontrol)",
        patientVersion: "2026-10-01T02:00:00.000Z",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Data pasien diperbarui.");
    expect(refresh).toHaveBeenCalled();
  });

  it("menampilkan pesan galat dari server tanpa memuat ulang", async () => {
    vi.mocked(approveIntakeToPatient).mockResolvedValue({
      ok: false,
      error: "Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi.",
    });
    render(<IntakeApprovalForm intakeId="i1" approval={approval} />);
    await userEvent.click(screen.getByRole("button", { name: "Setujui ke data pasien" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Data pasien baru saja berubah. Muat ulang halaman lalu periksa lagi."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
