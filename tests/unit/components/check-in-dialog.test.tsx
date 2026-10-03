import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInDialog } from "@/components/admin/check-in-dialog";
import { checkInAppointment, getCheckInForm, lookupNikOwner, mergeDuplicatePatient, type CheckInForm } from "@/server/check-in";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/check-in", () => ({
  getCheckInForm: vi.fn(),
  lookupNikOwner: vi.fn(),
  mergeDuplicatePatient: vi.fn(),
  checkInAppointment: vi.fn(),
}));

const FORM: CheckInForm = {
  appointmentId: "a1",
  code: "SDY-CI01",
  summary: "Sabtu, 3 Oktober 2026 · 11.00–11.30 · Konsultasi Dokter · dr. Diane",
  patient: {
    id: "p1",
    name: "Siti Rahayu",
    medicalRecordNumber: "SDY-2026-0001",
    nik: null,
    nikMissingReason: null,
    birthDate: "1990-05-17",
    gender: null,
    occupation: null,
    address: "Jl. Garuda 10",
    whatsapp: "6281234567890",
  },
  offerFoodRecallByDefault: true,
};
const TARGET = { appointmentId: "a1", code: "SDY-CI01", patientName: "Siti Rahayu" };
const OPEN_LINK = {
  state: "OPEN" as const,
  filled: false,
  url: "https://sundyclinic.com/food-recall#kode",
  message: { text: "Halo", link: "https://wa.me/6281234567890?text=Halo" },
};

function renderDialog() {
  render(<CheckInDialog target={TARGET} open onOpenChange={vi.fn()} />);
  return screen.findByRole("dialog", { name: "Check-in — SDY-CI01" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCheckInForm).mockResolvedValue({ ok: true, data: FORM });
  vi.mocked(lookupNikOwner).mockResolvedValue({ ok: true, data: null });
  vi.mocked(checkInAppointment).mockResolvedValue({ ok: true, data: { patientName: "Siti Rahayu", foodRecall: OPEN_LINK } });
});

describe("CheckInDialog", () => {
  it("menampilkan hanya data diri yang masih kosong, dan NIK wajib", async () => {
    const user = userEvent.setup();
    const dialog = await renderDialog();
    expect(await within(dialog).findByText(FORM.summary)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Jenis kelamin")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Pekerjaan")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Tanggal lahir")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Alamat")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Nomor WhatsApp")).toHaveValue("6281234567890");
    expect(within(dialog).getByLabelText("Tawarkan food recall")).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("NIK harus 16 angka.");
    expect(checkInAppointment).not.toHaveBeenCalled();
  });

  it("check-in dengan NIK: memeriksa pemiliknya dulu, lalu menampilkan link food recall", async () => {
    const user = userEvent.setup();
    const dialog = await renderDialog();
    await user.type(await within(dialog).findByLabelText("NIK (16 angka)"), "7171 0157 0590 0001");
    await user.selectOptions(within(dialog).getByLabelText("Jenis kelamin"), "P");
    await user.type(within(dialog).getByLabelText("Pekerjaan"), "Guru");
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));

    await waitFor(() =>
      expect(checkInAppointment).toHaveBeenCalledWith({
        appointmentId: "a1",
        nik: { kind: "SET", value: "7171015705900001" },
        identity: { gender: "P", occupation: "Guru" },
        whatsapp: "6281234567890",
        offerFoodRecall: true,
      }),
    );
    expect(lookupNikOwner).toHaveBeenCalledWith({ appointmentId: "a1", nik: "7171015705900001" });
    expect(await within(dialog).findByRole("link", { name: "Buka di tablet" })).toHaveAttribute("href", OPEN_LINK.url);
  });

  it("memperingatkan bila jenis kelamin di NIK berbeda, tanpa menghalangi", async () => {
    const user = userEvent.setup();
    const dialog = await renderDialog();
    await user.selectOptions(await within(dialog).findByLabelText("Jenis kelamin"), "L");
    await user.type(within(dialog).getByLabelText("NIK (16 angka)"), "7171015705900001");
    expect(within(dialog).getByText("Jenis kelamin di NIK berbeda dengan data pasien — periksa KTP.")).toBeInTheDocument();
  });

  it("Belum ada NIK mengirim alasannya", async () => {
    const user = userEvent.setup();
    vi.mocked(checkInAppointment).mockResolvedValue({ ok: true, data: { patientName: "Siti Rahayu", foodRecall: null } });
    const dialog = await renderDialog();
    await user.click(await within(dialog).findByLabelText("Belum ada NIK"));
    await user.selectOptions(within(dialog).getByLabelText("Alasan"), "LUPA_KTP");
    await user.selectOptions(within(dialog).getByLabelText("Jenis kelamin"), "P");
    await user.type(within(dialog).getByLabelText("Pekerjaan"), "Guru");
    await user.click(within(dialog).getByLabelText("Tawarkan food recall"));
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    await waitFor(() =>
      expect(checkInAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ nik: { kind: "MISSING", reason: "LUPA_KTP" }, offerFoodRecall: false }),
      ),
    );
    expect(lookupNikOwner).not.toHaveBeenCalled();
  });

  it("NIK milik pasien lain: menawarkan pindah, lalu melanjutkan dengan data pasien lama", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupNikOwner).mockResolvedValue({
      ok: true,
      data: {
        patientId: "p9",
        name: "Siti Lama",
        medicalRecordNumber: "SDY-2026-0009",
        birthDateLabel: "17/05/1990",
        whatsapp: "6281234567899",
        lastVisitLabel: "Senin, 7 September 2026",
        merge: { allowed: true },
      },
    });
    vi.mocked(mergeDuplicatePatient).mockResolvedValue({
      ok: true,
      data: {
        ...FORM,
        patient: { ...FORM.patient, id: "p9", name: "Siti Lama", medicalRecordNumber: "SDY-2026-0009", nik: "7171015705900001", gender: "P", occupation: "Guru" },
      },
    });
    const dialog = await renderDialog();
    await user.type(await within(dialog).findByLabelText("NIK (16 angka)"), "7171015705900001");
    await user.selectOptions(within(dialog).getByLabelText("Jenis kelamin"), "P");
    await user.type(within(dialog).getByLabelText("Pekerjaan"), "Guru");
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));

    expect(await within(dialog).findByText("NIK ini sudah milik pasien lain")).toBeInTheDocument();
    expect(within(dialog).getByText("Siti Lama")).toBeInTheDocument();
    expect(checkInAppointment).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Ini orang yang sama — pindahkan" }));
    expect(mergeDuplicatePatient).toHaveBeenCalledWith({ appointmentId: "a1", nik: "7171015705900001" });
    expect(await within(dialog).findByText("NIK 7171015705900001")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    await waitFor(() => expect(checkInAppointment).toHaveBeenCalledWith(expect.objectContaining({ nik: { kind: "KEEP" }, identity: {} })));
  });

  it("pindah tidak ditawarkan bila pasien booking ini sudah punya catatan dokter", async () => {
    const user = userEvent.setup();
    vi.mocked(lookupNikOwner).mockResolvedValue({
      ok: true,
      data: {
        patientId: "p9",
        name: "Siti Lama",
        medicalRecordNumber: "SDY-2026-0009",
        birthDateLabel: null,
        whatsapp: "6281234567899",
        lastVisitLabel: null,
        merge: { allowed: false, reason: "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data." },
      },
    });
    const dialog = await renderDialog();
    await user.type(await within(dialog).findByLabelText("NIK (16 angka)"), "7171015705900001");
    await user.click(within(dialog).getByRole("button", { name: "Check-in" }));
    expect(await within(dialog).findByText(/Hubungi Super Admin/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Ini orang yang sama — pindahkan" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Bukan — periksa lagi NIK-nya" }));
    expect(within(dialog).getByLabelText("NIK (16 angka)")).toHaveValue("7171015705900001");
  });

  it("menampilkan pesan bila booking tidak bisa di-check-in", async () => {
    vi.mocked(getCheckInForm).mockResolvedValue({ ok: false, error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman." });
    const dialog = await renderDialog();
    expect(await within(dialog).findByText("Booking ini sudah berstatus dibatalkan. Muat ulang halaman.")).toBeInTheDocument();
  });
});
