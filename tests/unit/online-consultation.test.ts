import { describe, expect, it } from "vitest";
import {
  boundsOf,
  lastAttemptLabel,
  nextOpenWindow,
  onlineConfirmationText,
  onlinePhase,
  onlineReminderText,
  onlineRequestNewTimeText,
  onlineTotal,
  onlineTransferText,
  reminderWindowsOn,
  validateContactWindows,
  windowDrafts,
  windowLabel,
  windowLines,
  type ContactRange,
} from "@/lib/online-consultation";
import { combineWitaDateAndMinutes } from "@/lib/time";

// Selasa 6 Oktober 2026, 10.00 WITA.
const NOW = combineWitaDateAndMinutes("2026-10-06", 10 * 60);
const range = (date: string, from: number, to: number): ContactRange => ({
  startAt: combineWitaDateAndMinutes(date, from),
  endAt: combineWitaDateAndMinutes(date, to),
});
const draft = (date: string, startMinute: number, endMinute: number) => ({ date, startMinute, endMinute });
const customer = (raw: unknown) => validateContactWindows(raw, { now: NOW, audience: "CUSTOMER" });
const staff = (raw: unknown) => validateContactWindows(raw, { now: NOW, audience: "STAFF" });

describe("validateContactWindows", () => {
  it("menerima 1–3 rentang sah dan mengurutkannya menurut awal", () => {
    const result = customer([draft("2026-10-09", 600, 720), draft("2026-10-07", 1140, 1260)]);
    expect(result).toEqual({
      ok: true,
      windows: [range("2026-10-07", 1140, 1260), range("2026-10-09", 600, 720)],
    });
  });

  it("menolak jumlah yang bukan 1–3 dan bentuk yang rusak", () => {
    const message = "Tambahkan 1 sampai 3 waktu Anda bisa dihubungi.";
    expect(customer([])).toEqual({ ok: false, message });
    expect(customer("bukan larik")).toEqual({ ok: false, message });
    const four = Array.from({ length: 4 }, (_, i) => draft(`2026-10-1${i}`, 600, 720));
    expect(customer(four)).toEqual({ ok: false, message });
    const broken = "Waktu tidak sah. Muat ulang halaman lalu coba lagi.";
    expect(customer([null])).toEqual({ ok: false, message: broken });
    expect(customer([{ date: "2026-10-07", startMinute: "600", endMinute: 720 }])).toEqual({ ok: false, message: broken });
    expect(customer([draft("2026-02-31", 600, 720)])).toEqual({ ok: false, message: broken });
  });

  it("menolak jam di luar 08.00–21.00 atau bukan kelipatan 30 menit", () => {
    const message = "Jam harus antara 08.00 dan 21.00, kelipatan 30 menit.";
    expect(customer([draft("2026-10-08", 450, 600)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 1200, 1290)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 610, 720)])).toEqual({ ok: false, message });
  });

  it("menolak rentang kurang dari 1 jam", () => {
    const message = "Setiap waktu minimal 1 jam.";
    expect(customer([draft("2026-10-08", 600, 630)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 720, 600)])).toEqual({ ok: false, message });
  });

  it("menolak tanggal di luar hari ini sampai 14 hari ke depan", () => {
    const message = "Pilih tanggal antara hari ini dan 14 hari ke depan.";
    expect(customer([draft("2026-10-05", 600, 720)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-21", 600, 720)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-20", 600, 720)]).ok).toBe(true);
  });

  it("customer: paling cepat 2 jam dari sekarang; resepsionis boleh rentang yang sudah mulai", () => {
    const lead = "Pilih waktu paling cepat 2 jam dari sekarang.";
    expect(customer([draft("2026-10-06", 11 * 60, 13 * 60)])).toEqual({ ok: false, message: lead });
    expect(customer([draft("2026-10-06", 12 * 60, 14 * 60)]).ok).toBe(true);
    expect(staff([draft("2026-10-06", 9 * 60, 11 * 60)]).ok).toBe(true);
    expect(staff([draft("2026-10-06", 8 * 60, 10 * 60)])).toEqual({ ok: false, message: "Waktu yang dipilih sudah lewat." });
  });

  it("menolak rentang yang tumpang tindih, tetapi menerima yang bersambung", () => {
    const message = "Waktu-waktu yang dipilih tidak boleh tumpang tindih.";
    expect(customer([draft("2026-10-08", 600, 720), draft("2026-10-08", 660, 780)])).toEqual({ ok: false, message });
    expect(customer([draft("2026-10-08", 600, 720), draft("2026-10-08", 720, 840)]).ok).toBe(true);
  });

  it("hari Minggu dan libur boleh", () => {
    // 11 Oktober 2026 adalah Minggu.
    expect(customer([draft("2026-10-11", 600, 720)]).ok).toBe(true);
  });
});

describe("rentang: label, bentuk edit, dan keadaan", () => {
  const first = range("2026-10-07", 1140, 1260);
  const second = range("2026-10-09", 600, 720);

  it("label dan baris pesan", () => {
    expect(windowLabel(first)).toBe("Rabu, 7 Oktober 2026, 19.00–21.00");
    expect(windowLines([first, second])).toEqual([
      "• Rabu, 7 Oktober 2026, 19.00–21.00",
      "• Jumat, 9 Oktober 2026, 10.00–12.00",
    ]);
  });

  it("bentuk untuk dialog ubah, dan batas booking = rentang paling awal", () => {
    expect(windowDrafts([first, second])).toEqual([draft("2026-10-07", 1140, 1260), draft("2026-10-09", 600, 720)]);
    expect(boundsOf([second, first])).toEqual(first);
  });

  it("keadaan: Sekarang, Hari ini, Mendatang, dan Perlu waktu baru", () => {
    const evening = range("2026-10-06", 19 * 60, 21 * 60);
    expect(onlinePhase([evening], combineWitaDateAndMinutes("2026-10-06", 20 * 60))).toBe("NOW");
    expect(onlinePhase([evening], NOW)).toBe("TODAY");
    expect(onlinePhase([first], NOW)).toBe("UPCOMING");
    expect(onlinePhase([evening], combineWitaDateAndMinutes("2026-10-06", 21 * 60))).toBe("NEEDS_NEW");
    expect(onlinePhase([evening, first], combineWitaDateAndMinutes("2026-10-06", 21 * 60))).toBe("UPCOMING");
  });

  it("rentang terbuka berikutnya melewati yang sudah berakhir", () => {
    const early = range("2026-10-06", 8 * 60, 9 * 60);
    expect(nextOpenWindow([early, first], NOW)).toEqual(first);
    expect(nextOpenWindow([early], NOW)).toBeNull();
  });

  it("jumlah transfer dan keterangan percobaan terakhir", () => {
    expect(onlineTotal({ bookingFee: 100000, servicePrice: 250000 })).toBe(350000);
    expect(onlineTotal({ bookingFee: null, servicePrice: 250000 })).toBe(250000);
    expect(lastAttemptLabel([])).toBeNull();
    expect(
      lastAttemptLabel([
        { at: combineWitaDateAndMinutes("2026-10-05", 19 * 60 + 40), staffName: "dr. Diane" },
        { at: combineWitaDateAndMinutes("2026-10-06", 8 * 60 + 10), staffName: "dr. Diane" },
      ]),
    ).toBe("Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)");
  });
});

describe("teks pesan WhatsApp", () => {
  const windows = [range("2026-10-07", 1140, 1260), range("2026-10-09", 600, 720)];
  const deadline = combineWitaDateAndMinutes("2026-10-07", 12 * 60);

  it("instruksi transfer: total, rincian, rentang, rekening, dan link kuis", () => {
    const text = onlineTransferText({
      patientName: "Siti Rahayu",
      code: "SDY-AB12",
      doctorName: "dr. Diane",
      windows,
      bookingFee: 100000,
      servicePrice: 250000,
      deadline,
      bankLine: "BCA 123 a.n. SunDY Clinic",
      quizLink: "https://sundyclinic.com/isi#kode",
    });
    expect(text).toContain("Halo Siti, konsultasi online Anda di SunDY Clinic sudah kami catat.");
    expect(text).toContain("Kode: SDY-AB12");
    expect(text).toContain("• Rabu, 7 Oktober 2026, 19.00–21.00");
    expect(text).toContain("transfer Rp 350.000 (biaya booking Rp 100.000 + Konsultasi Online Rp 250.000)");
    expect(text).toContain("BCA 123 a.n. SunDY Clinic");
    expect(text).toContain("https://sundyclinic.com/isi#kode");
    expect(text).not.toMatch(/pasien|berobat/i);
  });

  it("konfirmasi: dokter akan menghubungi di salah satu waktu", () => {
    const text = onlineConfirmationText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", windows });
    expect(text).toContain("pembayaran konsultasi online Anda (SDY-AB12) sudah kami terima");
    expect(text).toContain("dr. Diane akan menelepon atau video call lewat WhatsApp");
    expect(text).toContain("• Jumat, 9 Oktober 2026, 10.00–12.00");
    expect(text).not.toMatch(/pasien|berobat/i);
  });

  it("minta waktu baru: dengan dan tanpa percobaan", () => {
    const tried = onlineRequestNewTimeText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", hadAttempt: true });
    expect(tried).toContain("dr. Diane sudah mencoba menghubungi Anda untuk konsultasi online (SDY-AB12), tetapi belum tersambung.");
    expect(tried).toContain("Biaya yang sudah dibayar tetap berlaku.");
    const untried = onlineRequestNewTimeText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", hadAttempt: false });
    expect(untried).toContain("waktu yang Anda pilih untuk konsultasi online (SDY-AB12) sudah lewat.");
  });

  it("pengingat: satu atau beberapa rentang di hari itu, dengan tanggal lengkap", () => {
    const sameDay = [range("2026-10-07", 600, 720), range("2026-10-07", 1140, 1260)];
    expect(reminderWindowsOn([...sameDay, windows[1]], "2026-10-07")).toEqual(sameDay);
    const text = onlineReminderText({ patientName: "Siti Rahayu", code: "SDY-AB12", doctorName: "dr. Diane", windows: sameDay });
    expect(text).toContain("pada Rabu, 7 Oktober 2026, dr. Diane akan menghubungi Anda lewat WhatsApp antara 10.00–12.00 atau 19.00–21.00");
    expect(text).not.toMatch(/besok|pasien|berobat/i);
  });
});
