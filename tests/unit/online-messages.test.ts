import { describe, expect, it } from "vitest";
import { confirmationMessageFor, reminderMessageFor, requestNewTimeMessageFor, type MessageBooking } from "@/lib/booking-messages";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { transferInstructionFor, type TransferBooking } from "@/lib/transfer-instruction";

const NOW = combineWitaDateAndMinutes("2026-10-06", 10 * 60);
const windows = [
  { startAt: combineWitaDateAndMinutes("2026-10-07", 600), endAt: combineWitaDateAndMinutes("2026-10-07", 720) },
  { startAt: combineWitaDateAndMinutes("2026-10-07", 1140), endAt: combineWitaDateAndMinutes("2026-10-07", 1260) },
  { startAt: combineWitaDateAndMinutes("2026-10-09", 600), endAt: combineWitaDateAndMinutes("2026-10-09", 720) },
];
const online: MessageBooking & TransferBooking = {
  code: "SDY-AB12",
  type: "KONSULTASI",
  startAt: windows[0].startAt,
  bookingFee: 100000,
  transferDeadline: combineWitaDateAndMinutes("2026-10-07", 9 * 60),
  service: { name: "Konsultasi Online" },
  staff: { name: "dr. Diane" },
  branch: { name: "SunDY Mahakeret", address: "Jl. Mahakeret", mapsUrl: null },
  patient: { name: "Siti Rahayu", whatsapp: "6281234567890" },
  channel: "ONLINE",
  servicePrice: 250000,
  contactWindows: windows,
  contactAttempts: [],
};
const bank = { bankName: "BCA", bankAccountNumber: "123", bankAccountHolder: "SunDY Clinic" };

describe("pesan booking online", () => {
  it("instruksi transfer memakai total dan rentang, bukan jam dan cabang", () => {
    const instruction = transferInstructionFor(online, bank);
    expect(instruction?.text).toContain("transfer Rp 350.000 (biaya booking Rp 100.000 + Konsultasi Online Rp 250.000)");
    expect(instruction?.text).toContain("• Rabu, 7 Oktober 2026, 10.00–12.00");
    expect(instruction?.text).not.toContain("SunDY Mahakeret");
    expect(instruction?.link).toContain("wa.me/6281234567890");
  });

  it("instruksi transfer tanpa rekening memakai kalimat pengganti", () => {
    const instruction = transferInstructionFor(online, { bankName: null, bankAccountNumber: null, bankAccountHolder: null });
    expect(instruction?.text).toContain("(rekening akan kami kirimkan)");
    expect(instruction?.missingBankAccount).toBe(true);
  });

  it("konfirmasi menyebut dokter dan rentang, tanpa alamat klinik", () => {
    const message = confirmationMessageFor(online, "https://sundyclinic.com");
    expect(message?.text).toContain("dr. Diane akan menelepon atau video call lewat WhatsApp");
    expect(message?.text).not.toContain("Jl. Mahakeret");
  });

  it("pengingat memakai semua rentang pada tanggal rentang terbuka berikutnya", () => {
    const message = reminderMessageFor(online, null, NOW);
    expect(message?.text).toContain("antara 10.00–12.00 atau 19.00–21.00");
    const afterFirstDay = reminderMessageFor(online, null, combineWitaDateAndMinutes("2026-10-07", 22 * 60));
    expect(afterFirstDay?.text).toContain("pada Jumat, 9 Oktober 2026");
    expect(reminderMessageFor(online, null, combineWitaDateAndMinutes("2026-10-10", 9 * 60))).toBeNull();
  });

  it("minta waktu baru: menyebut percobaan bila ada", () => {
    expect(requestNewTimeMessageFor(online)?.text).toContain("sudah lewat");
    const tried = requestNewTimeMessageFor({ ...online, contactAttempts: [{ at: NOW, staffName: "dr. Diane" }] });
    expect(tried?.text).toContain("belum tersambung");
    expect(tried?.link).toContain("wa.me/6281234567890");
  });

  it("booking klinik tidak berubah", () => {
    const clinic = { ...online, channel: "KLINIK" as const, servicePrice: null, contactWindows: undefined };
    expect(transferInstructionFor(clinic, bank)?.text).toContain("Mohon transfer biaya booking Rp 100.000");
    expect(confirmationMessageFor(clinic, "https://sundyclinic.com")?.text).toContain("Jl. Mahakeret");
    expect(requestNewTimeMessageFor(clinic)).toBeNull();
  });
});
