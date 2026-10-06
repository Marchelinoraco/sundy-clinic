import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, RECEIPT_STORAGE_KEY, RegistrationFlow } from "@/components/pendaftaran/registration-flow";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import type { BookingOptions } from "@/server/public-booking-data";
import { slimmingNewPatient } from "../../fixtures/quiz-answers-v2";

const actions = vi.hoisted(() => ({
  getPublicSlots: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  holdSlot: vi.fn(),
  submitSiteBooking: vi.fn(),
  submitOnlineBooking: vi.fn(),
}));
vi.mock("@/server/public-booking", () => actions);
const toasts = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

const options: BookingOptions = {
  branches: [
    { id: "b1", name: "SunDY Mahakeret", status: "AKTIF" },
    { id: "b2", name: "SunDY Citraland", status: "SEGERA_HADIR" },
  ],
  consultation: { id: "konsul", name: "Konsultasi Dokter", price: 200000, durationMin: 30, requiresDoctor: true },
  treatments: [],
  staff: [{ id: "diane", name: "Dr. Diane", role: "DOKTER", branchIds: ["b1"] }],
  bookingFee: 100000,
  online: null,
};

const readyDraft = {
  answers: slimmingNewPatient,
  screen: "D",
  serviceId: "konsul",
  schedule: {
    branchId: "b1",
    staffId: null,
    date: "2026-10-01",
    hold: {
      token: "token-hold-uji-000000",
      expiresAt: "2026-10-01T07:10:00.000Z",
      startAt: "2026-10-01T07:00:00.000Z",
      staffId: "diane",
      staffName: "Dr. Diane",
      label: "15.00",
    },
  },
  identity: {
    name: "Siti Rahayu",
    whatsapp: "081234567890",
    birthDate: "1992-04-17",
    gender: "P",
    occupation: "Guru",
    address: "Jl. Sam Ratulangi",
    consentData: true,
    consentFee: true,
    website: "",
  },
};

const onlineOptions: BookingOptions = {
  ...options,
  online: { serviceId: "online", serviceName: "Konsultasi Online", price: 250000, doctors: [{ id: "diane", name: "Dr. Diane" }] },
};
const inTwoDays = addDaysToDateString(witaDateString(new Date()), 2);
const onlineDraft = {
  ...readyDraft,
  mode: "ONLINE",
  online: {
    staffId: null,
    windows: [{ date: inTwoDays, startMinute: 1140, endMinute: 1260 }],
    submissionKey: "kunci-kiriman-online-uji-0001",
  },
};

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.clearAllMocks());

describe("RegistrationFlow", () => {
  it("menyimpan jawaban dan memulihkannya setelah halaman dimuat ulang", async () => {
    const { unmount } = render(<RegistrationFlow options={options} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Belum, ini pertama kali/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Slimming/ }));
    expect(await screen.findByRole("heading", { name: "Apa tujuan utama Anda?" })).toBeInTheDocument();
    unmount();

    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Apa tujuan utama Anda?" })).toBeInTheDocument();
  });

  it("setelah Kirim berhasil, jawaban dihapus dan kuitansi bertahan saat dimuat ulang sampai Daftar lagi", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(readyDraft));
    actions.submitSiteBooking.mockResolvedValue({
      ok: true,
      data: {
        kind: "booked",
        receipt: {
          code: "SDY-8F3K",
          patientName: "Siti Rahayu",
          serviceName: "Konsultasi Dokter",
          staffName: "Dr. Diane",
          branchName: "SunDY Mahakeret",
          startAt: new Date("2026-10-01T07:00:00Z"),
          bookingFee: 100000,
          bankAccount: "BCA 1234567890 a.n. SunDY Clinic",
          confirmationLink: "https://wa.me/6285172228900?text=x",
          online: null,
        },
      },
    });

    const { unmount } = render(<RegistrationFlow options={options} />);
    await userEvent.click(await screen.findByRole("button", { name: "Kirim pendaftaran" }));

    expect(await screen.findByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.getByText(/BCA 1234567890 a.n. SunDY Clinic/)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(actions.submitSiteBooking).toHaveBeenCalledWith(
      expect.objectContaining({ holdToken: "token-hold-uji-000000", serviceId: "konsul", branchId: "b1" }),
    );
    unmount();

    // Muat ulang: kuitansi tampil lagi, bukan kuis dari awal.
    const reloaded = render(<RegistrationFlow options={options} />);
    expect(await screen.findByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.getByText(/BCA 1234567890 a.n. SunDY Clinic/)).toBeInTheDocument();
    expect(screen.getByText(/pukul 15.00 WITA/)).toBeInTheDocument();
    // Tidak ada data klinis di kuitansi yang tersimpan.
    expect(window.sessionStorage.getItem(RECEIPT_STORAGE_KEY)).not.toMatch(/answers|Amlodipine|weight/i);

    await userEvent.click(screen.getByRole("button", { name: "Daftar lagi" }));
    expect(await screen.findByRole("heading", { name: "Pernah konsultasi atau treatment di SunDY Clinic?" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull();
    reloaded.unmount();

    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Pernah konsultasi atau treatment di SunDY Clinic?" })).toBeInTheDocument();
  });

  it("mengabaikan kuitansi tersimpan yang bentuknya rusak", async () => {
    window.sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify({ code: 42, startAt: "bukan tanggal" }));
    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Pernah konsultasi atau treatment di SunDY Clinic?" })).toBeInTheDocument();
  });

  it("slot yang terisi mengembalikan pasien ke langkah jadwal tanpa kehilangan jawaban", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(readyDraft));
    actions.submitSiteBooking.mockResolvedValue({ ok: true, data: { kind: "slot-taken" } });

    render(<RegistrationFlow options={options} />);
    await userEvent.click(await screen.findByRole("button", { name: "Kirim pendaftaran" }));

    expect(await screen.findByRole("heading", { name: "Pilih jadwal" })).toBeInTheDocument();
    const saved = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(saved.answers).toEqual(slimmingNewPatient);
    expect(saved.schedule.hold).toBeNull();
  });

  it("draf kuis versi lama dibuang dengan pesan, dan customer mulai dari awal", async () => {
    window.sessionStorage.setItem("sundy-daftar-v1", JSON.stringify({ answers: { purpose: "BELUM_YAKIN" }, screen: "B1" }));
    render(<RegistrationFlow options={options} />);

    expect(await screen.findByRole("heading", { name: "Pernah konsultasi atau treatment di SunDY Clinic?" })).toBeInTheDocument();
    expect(toasts.info).toHaveBeenCalledWith("Kuis kami baru saja diperbarui. Silakan isi dari awal.");
    expect(window.sessionStorage.getItem("sundy-daftar-v1")).toBeNull();
  });

  it("kuitansi yang tersimpan sebelum kuis v2 tetap dibaca dari kunci yang sama", () => {
    expect(DRAFT_STORAGE_KEY).toBe("sundy-daftar-v2");
    expect(RECEIPT_STORAGE_KEY).toBe("sundy-daftar-kuitansi-v1");
  });

  it("layar Layanan menawarkan konsultasi online beserta total transfer", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...readyDraft, screen: "L" }));
    render(<RegistrationFlow options={onlineOptions} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Online lewat WhatsApp/ }));
    expect(screen.getByText("Rp 350.000")).toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)!).mode).toBe("ONLINE");
  });

  it("tanpa layanan online aktif, pilihan Cara konsultasi tidak muncul", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...readyDraft, screen: "L" }));
    render(<RegistrationFlow options={options} />);
    expect(await screen.findByRole("heading", { name: "Layanan & biaya" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Cara konsultasi" })).not.toBeInTheDocument();
  });

  it("mode online: langkah jadwal menjadi waktu luang", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...onlineDraft, screen: "J" }));
    render(<RegistrationFlow options={onlineOptions} />);
    expect(await screen.findByRole("heading", { name: "Kapan Anda bisa dihubungi?" })).toBeInTheDocument();
    expect(screen.getByText("Dengan Dr. Diane")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal waktu 1")).toHaveValue(inTwoDays);
  });

  it("Kirim online memanggil submitOnlineBooking, lalu kwitansi online bertahan saat dimuat ulang", async () => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(onlineDraft));
    actions.submitOnlineBooking.mockResolvedValue({
      ok: true,
      data: {
        receipt: {
          code: "SDY-ON12",
          patientName: "Siti Rahayu",
          serviceName: "Konsultasi Online",
          staffName: "Dr. Diane",
          branchName: "Online (WhatsApp)",
          startAt: new Date("2026-10-08T11:00:00Z"),
          bookingFee: 100000,
          bankAccount: "BCA 1234567890 a.n. SunDY Clinic",
          confirmationLink: "https://wa.me/6285172228900?text=x",
          online: {
            windowLines: ["• Kamis, 8 Oktober 2026, 19.00–21.00"],
            servicePrice: 250000,
            total: 350000,
            maskedWhatsapp: "0812-****-7890",
          },
        },
      },
    });

    const { unmount } = render(<RegistrationFlow options={onlineOptions} />);
    await userEvent.click(await screen.findByRole("button", { name: "Kirim pendaftaran" }));
    expect(actions.submitOnlineBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionKey: "kunci-kiriman-online-uji-0001",
        staffId: "diane",
        windows: [{ date: inTwoDays, startMinute: 1140, endMinute: 1260 }],
      }),
    );
    expect(actions.submitSiteBooking).not.toHaveBeenCalled();
    expect(await screen.findByText("SDY-ON12")).toBeInTheDocument();
    expect(screen.getByText("Kamis, 8 Oktober 2026, 19.00–21.00")).toBeInTheDocument();
    expect(screen.getByText(/Rp 350.000/)).toBeInTheDocument();
    unmount();

    render(<RegistrationFlow options={onlineOptions} />);
    expect(await screen.findByText("Kamis, 8 Oktober 2026, 19.00–21.00")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pasien|berobat/i);
  });
});
