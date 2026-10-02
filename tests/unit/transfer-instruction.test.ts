import { describe, expect, it } from "vitest";
import {
  MISSING_BANK_ACCOUNT_LINE,
  needsTransfer,
  pendingDeadlineLabel,
  transferDeadline,
  transferInstructionFor,
  transferInstructionText,
  type TransferBooking,
} from "@/lib/transfer-instruction";

// Feb 2031: Sabtu 8, Minggu 9, Senin 10, Selasa 11, Rabu 12, Kamis 13, Senin 17.
const wita = (day: number, hour: number) => new Date(Date.UTC(2031, 1, day, hour - 8));
const FAR = wita(28, 11);
const NO_HOLIDAYS = new Set<string>();

describe("transferDeadline", () => {
  it("24 jam sejak booking dibuat pada hari kerja biasa", () => {
    expect(transferDeadline(wita(12, 12), FAR, NO_HOLIDAYS)).toEqual(wita(13, 12));
  });

  it("tidak menghitung hari Minggu", () => {
    // Sabtu 13.00: 11 jam Sabtu + 13 jam Senin.
    expect(transferDeadline(wita(8, 13), FAR, NO_HOLIDAYS)).toEqual(wita(10, 13));
  });

  it("tidak menghitung tanggal libur", () => {
    // Selasa 13.00, Rabu libur: 11 jam Selasa + 13 jam Kamis.
    expect(transferDeadline(wita(11, 13), FAR, new Set(["2031-02-12"]))).toEqual(wita(13, 13));
  });

  it("tidak pernah melewati jadwal booking itu sendiri", () => {
    expect(transferDeadline(wita(12, 12), wita(12, 17), NO_HOLIDAYS)).toEqual(wita(12, 17));
  });
});

const textInput = {
  patientName: "Maria Wenas",
  code: "SDY-7KQ2",
  serviceName: "Konsultasi Dokter",
  startAt: wita(17, 11),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  fee: 100000,
  deadline: wita(13, 12),
  bankAccount: "BCA 1234567890 a.n. SunDY Clinic",
};

describe("transferInstructionText", () => {
  it("menyusun pesan lengkap dengan rupiah dan tanggal WITA", () => {
    expect(transferInstructionText(textInput)).toBe(
      [
        "Halo Maria Wenas, booking Anda di SunDY Clinic sudah kami catat.",
        "Kode: SDY-7KQ2",
        "Layanan: Konsultasi Dokter",
        "Jadwal: Senin, 17 Februari 2031 pukul 11.00 WITA",
        "Tenaga: dr. Diane · SunDY Mahakeret",
        "",
        "Mohon transfer biaya booking Rp 100.000 paling lambat Kamis, 13 Februari 2031 pukul 12.00 WITA ke:",
        "BCA 1234567890 a.n. SunDY Clinic",
        "lalu kirim bukti transfer di chat ini.",
        "",
        "Biaya booking terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.",
      ].join("\n"),
    );
  });

  it("menulis bahwa rekening akan dikirim bila Pengaturan belum lengkap", () => {
    const text = transferInstructionText({ ...textInput, bankAccount: null });
    expect(text).toContain(`ke:\n${MISSING_BANK_ACCOUNT_LINE}\nlalu`);
  });

  it("menambahkan link kuis di akhir bila ada", () => {
    const text = transferInstructionText({ ...textInput, quizLink: "https://sundyclinic.com/isi#abc" });
    expect(text.endsWith(
      "berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.\n\n" +
        "Sebelum datang, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc\n" +
        "Jawaban Anda hanya dibaca dokter kami.",
    )).toBe(true);
    expect(transferInstructionText({ ...textInput, quizLink: null })).toBe(transferInstructionText(textInput));
  });
});

const booking: TransferBooking = {
  code: "SDY-7KQ2",
  type: "KONSULTASI",
  startAt: wita(17, 11),
  bookingFee: 150000,
  transferDeadline: wita(13, 12),
  service: { name: "Konsultasi Dokter" },
  staff: { name: "dr. Diane" },
  branch: { name: "SunDY Mahakeret" },
  patient: { name: "Maria Wenas", whatsapp: "6281234567890" },
};
const BANK = { bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" };

describe("transferInstructionFor", () => {
  it("memakai biaya yang disalin ke booking dan menautkan WA ke nomor pasien", () => {
    const instruction = transferInstructionFor(booking, BANK)!;
    expect(instruction.text).toContain("Rp 150.000");
    expect(instruction.link).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect(decodeURIComponent(instruction.link!.split("text=")[1])).toBe(instruction.text);
    expect(instruction).toMatchObject({ deadline: wita(13, 12), missingBankAccount: false });
  });

  it("menandai rekening yang belum lengkap", () => {
    const instruction = transferInstructionFor(booking, { ...BANK, bankAccountHolder: null })!;
    expect(instruction.missingBankAccount).toBe(true);
    expect(instruction.text).toContain(MISSING_BANK_ACCOUNT_LINE);
  });

  it("tanpa tautan WA bila nomor pasien tidak sah", () => {
    expect(transferInstructionFor({ ...booking, patient: { name: "Maria", whatsapp: "12" } }, BANK)!.link).toBeNull();
  });

  it("null untuk booking tanpa batas transfer, tanpa biaya, atau tanpa pasien", () => {
    expect(transferInstructionFor({ ...booking, transferDeadline: null }, BANK)).toBeNull();
    expect(transferInstructionFor({ ...booking, bookingFee: null }, BANK)).toBeNull();
    expect(transferInstructionFor({ ...booking, patient: null }, BANK)).toBeNull();
  });
});

describe("needsTransfer", () => {
  const waiting = { source: "WHATSAPP" as const, status: "MENUNGGU_KONFIRMASI", bookingFee: 100000 };

  it("booking WhatsApp dan telepon berbiaya yang belum diverifikasi", () => {
    expect(needsTransfer(waiting)).toBe(true);
    expect(needsTransfer({ ...waiting, source: "TELEPON" })).toBe(true);
  });

  it("bukan walk-in, booking situs, tanpa biaya, atau yang sudah diverifikasi", () => {
    expect(needsTransfer({ ...waiting, source: "WALK_IN" })).toBe(false);
    expect(needsTransfer({ ...waiting, source: "SITUS" })).toBe(false);
    expect(needsTransfer({ ...waiting, bookingFee: null })).toBe(false);
    expect(needsTransfer({ ...waiting, status: "TERKONFIRMASI" })).toBe(false);
  });
});

describe("pendingDeadlineLabel", () => {
  it("menulis batas kedaluwarsa booking situs dan batas transfer booking WA/telepon", () => {
    expect(pendingDeadlineLabel({ kind: "EXPIRES", deadline: wita(13, 12), overdue: false })).toBe(
      "Kedaluwarsa Kam, 13 Feb 12.00",
    );
    expect(pendingDeadlineLabel({ kind: "TRANSFER", deadline: wita(13, 12), overdue: false })).toBe(
      "Batas transfer Kam, 13 Feb 12.00",
    );
  });

  it("menulis Lewat batas transfer setelah batasnya lewat", () => {
    expect(pendingDeadlineLabel({ kind: "TRANSFER", deadline: wita(13, 12), overdue: true })).toBe(
      "Lewat batas transfer",
    );
  });
});
