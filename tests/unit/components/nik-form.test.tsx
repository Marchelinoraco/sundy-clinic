import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NikForm } from "@/components/admin/nik-form";
import { updatePatientNik } from "@/server/patient";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/patient", () => ({ updatePatientNik: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("NikForm", () => {
  it("menampilkan NIK dan menyimpan NIK baru", async () => {
    const user = userEvent.setup();
    vi.mocked(updatePatientNik).mockResolvedValue({ ok: true, data: undefined });
    render(<NikForm patientId="p1" nik="7171015705900001" missingReason={null} />);
    expect(screen.getByText("7171015705900001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ubah NIK" }));
    const field = screen.getByLabelText("NIK (16 angka)");
    await user.clear(field);
    await user.type(field, "7171015705900009");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updatePatientNik).toHaveBeenCalledWith({ patientId: "p1", nik: "7171015705900009", missingReason: null }));
    expect(refresh).toHaveBeenCalled();
  });

  it("menandai pasien tanpa NIK beserta alasannya", () => {
    render(<NikForm patientId="p1" nik={null} missingReason="LUPA_KTP" />);
    expect(screen.getByText("NIK belum ada (Lupa membawa KTP)")).toBeInTheDocument();
  });

  it("menyimpan alasan belum ada NIK", async () => {
    const user = userEvent.setup();
    vi.mocked(updatePatientNik).mockResolvedValue({ ok: true, data: undefined });
    render(<NikForm patientId="p1" nik={null} missingReason={null} />);
    await user.click(screen.getByRole("button", { name: "Ubah NIK" }));
    await user.click(screen.getByLabelText("Belum ada NIK"));
    await user.selectOptions(screen.getByLabelText("Alasan"), "WARGA_ASING");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updatePatientNik).toHaveBeenCalledWith({ patientId: "p1", nik: null, missingReason: "WARGA_ASING" }));
  });
});
