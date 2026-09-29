import { describe, expect, it } from "vitest";
import { maskWhatsapp, rescheduleRequestMessage, siteBookingWhatsAppMessage } from "@/lib/whatsapp";

describe("maskWhatsapp", () => {
  it("menyamarkan bagian tengah nomor", () => {
    expect(maskWhatsapp("6281234567890")).toBe("0812-****-7890");
  });
});

describe("siteBookingWhatsAppMessage", () => {
  const base = {
    patientName: "Siti Rahayu",
    code: "SDY-8F3K",
    serviceName: "Konsultasi Dokter",
    staffName: "Dr. Diane Paparang, Sp.GK, AIFO-K",
    branchName: "SunDY Mahakeret",
    dateLabel: "Kamis, 1 Oktober 2026",
    timeLabel: "15.00",
  };

  it("mengantar bukti transfer biaya booking", () => {
    expect(siteBookingWhatsAppMessage({ ...base, bookingFee: 100000 })).toBe(
      "Halo SunDY Clinic, saya sudah booking Konsultasi Dokter. Kode: SDY-8F3K, atas nama Siti Rahayu, " +
        "dengan Dr. Diane Paparang, Sp.GK, AIFO-K di SunDY Mahakeret, Kamis, 1 Oktober 2026 pukul 15.00. " +
        "Berikut bukti transfer biaya booking Rp 100.000.",
    );
  });

  it("tanpa kalimat transfer bila tidak ada biaya booking", () => {
    expect(siteBookingWhatsAppMessage({ ...base, bookingFee: null })).not.toContain("transfer");
  });
});

describe("rescheduleRequestMessage", () => {
  it("menyebut kode dan jadwal lama", () => {
    expect(rescheduleRequestMessage({ code: "SDY-8F3K", dateLabel: "Kamis, 1 Oktober 2026", timeLabel: "15.00" })).toBe(
      "Halo SunDY Clinic, saya ingin pindah jadwal booking SDY-8F3K (Kamis, 1 Oktober 2026 pukul 15.00).",
    );
  });
});
