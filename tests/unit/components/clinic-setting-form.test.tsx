import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { updateClinicSetting } from "@/server/clinic-setting";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/clinic-setting", () => ({ updateClinicSetting: vi.fn() }));

// Kartu "Biaya booking" dan kotak isiannya bernama sama, jadi kotaknya dicari di dalam kartu.
const feeInput = () => within(screen.getByRole("region", { name: "Biaya booking" })).getByLabelText("Biaya booking");

const SETTING = { bookingFee: 100000, bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateClinicSetting).mockResolvedValue({ ok: true, data: SETTING });
});

describe("ClinicSettingForm (spec D 5.5)", () => {
  it("kepala halaman dengan Simpan; biaya dalam rupiah; dua kartu", () => {
    renderAdmin(<ClinicSettingForm setting={SETTING} />);
    expect(screen.getByRole("heading", { level: 1, name: "Pengaturan" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Biaya booking" })).getByLabelText("Biaya booking")).toHaveValue("Rp 100.000");
    expect(screen.getByRole("region", { name: "Rekening transfer" })).toHaveTextContent("Tampil ke pasien: BCA 1234567890 a.n. SunDY Clinic");
  });

  it("pratinjau mengikuti ketikan; rekening belum lengkap memakai kalimat pengganti", async () => {
    const user = userEvent.setup();
    renderAdmin(<ClinicSettingForm setting={SETTING} />);
    await user.clear(screen.getByLabelText("Atas nama"));
    expect(screen.getByRole("region", { name: "Rekening transfer" })).toHaveTextContent("Tampil ke pasien: (rekening akan kami kirimkan)");
    await user.type(screen.getByLabelText("Atas nama"), "PT SunDY");
    expect(screen.getByRole("region", { name: "Rekening transfer" })).toHaveTextContent("BCA 1234567890 a.n. PT SunDY");
  });

  it("Simpan mengirim biaya sebagai angka", async () => {
    const user = userEvent.setup();
    renderAdmin(<ClinicSettingForm setting={SETTING} />);
    const fee = feeInput();
    await user.clear(fee);
    await user.type(fee, "150000");
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));
    await waitFor(() =>
      expect(updateClinicSetting).toHaveBeenCalledWith({
        bookingFee: 150000,
        bankName: "BCA",
        bankAccountNumber: "1234567890",
        bankAccountHolder: "SunDY Clinic",
      }),
    );
  });

  it("biaya kosong: pesan, tanpa memanggil server", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderAdmin(<ClinicSettingForm setting={SETTING} />);
    await user.clear(feeInput());
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));
    expect(toast.error).toHaveBeenCalledWith("Isi biaya booking.");
    expect(updateClinicSetting).not.toHaveBeenCalled();
  });
});
