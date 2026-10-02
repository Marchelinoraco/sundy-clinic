import { describe, expect, it } from "vitest";
import {
  confirmationMessageFor,
  confirmationText,
  quizLinkMessageText,
  reminderMessageFor,
  reminderText,
  type MessageBooking,
} from "@/lib/booking-messages";

// Feb 2031: Senin 17.
const wita = (day: number, hour: number) => new Date(Date.UTC(2031, 1, day, hour - 8));

const confirmationInput = {
  patientName: "Maria Wenas",
  code: "SDY-7KQ2",
  serviceName: "Konsultasi Dokter",
  startAt: wita(17, 11),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret No. 1, Manado",
  mapsUrl: "https://maps.app.goo.gl/abc",
  bookingFee: 100000,
  siteUrl: "https://sundyclinic.com",
};

describe("confirmationText", () => {
  it("menyusun konfirmasi lengkap dengan alamat, peta, aturan pindah, dan tautan cek booking", () => {
    expect(confirmationText(confirmationInput)).toBe(
      [
        "Halo Maria Wenas, booking Anda di SunDY Clinic sudah terkonfirmasi.",
        "",
        "Kode booking: SDY-7KQ2",
        "Layanan: Konsultasi Dokter",
        "Jadwal: Senin, 17 Februari 2031 pukul 11.00 WITA",
        "Tenaga: dr. Diane · SunDY Mahakeret",
        "Alamat: Jl. Mahakeret No. 1, Manado",
        "Peta: https://maps.app.goo.gl/abc",
        "",
        "Mohon datang 10 menit sebelum jadwal.",
        "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya; biaya booking tetap berlaku. Bila dibatalkan, biaya booking tidak dikembalikan.",
        "Cek status booking: https://sundyclinic.com/cek-booking?kode=SDY-7KQ2",
        "",
        "Sampai jumpa di klinik.",
      ].join("\n"),
    );
  });

  it("melewati baris Peta bila cabang belum punya tautan peta", () => {
    expect(confirmationText({ ...confirmationInput, mapsUrl: null })).not.toContain("Peta:");
  });

  it("walk-in atau tanpa biaya booking: tanpa kalimat tentang biaya", () => {
    const text = confirmationText({ ...confirmationInput, bookingFee: null });
    expect(text).toContain("Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya.\n");
    expect(text).not.toContain("biaya booking");
  });
});

const reminderInput = {
  patientName: "Maria Wenas",
  serviceName: "Konsultasi Dokter",
  startAt: wita(17, 11),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret No. 1, Manado",
  mapsUrl: "https://maps.app.goo.gl/abc",
};

describe("reminderText", () => {
  it("menulis tanggal lengkap, bukan 'besok'", () => {
    expect(reminderText(reminderInput)).toBe(
      [
        "Halo Maria Wenas, kami mengingatkan jadwal Anda di SunDY Clinic:",
        "Senin, 17 Februari 2031 pukul 11.00 WITA",
        "Konsultasi Dokter dengan dr. Diane",
        "SunDY Mahakeret — Jl. Mahakeret No. 1, Manado",
        "Peta: https://maps.app.goo.gl/abc",
        "",
        "Mohon datang 10 menit sebelum jadwal. Balas YA bila Anda akan datang, atau kabari kami bila ingin pindah jadwal.",
      ].join("\n"),
    );
  });

  it("melewati baris Peta bila kosong", () => {
    expect(reminderText({ ...reminderInput, mapsUrl: null })).not.toContain("Peta:");
  });
});

const booking: MessageBooking = {
  code: "SDY-7KQ2",
  type: "KONSULTASI",
  startAt: wita(17, 11),
  bookingFee: 100000,
  service: null,
  staff: { name: "dr. Diane" },
  branch: { name: "SunDY Mahakeret", address: "Jl. Mahakeret No. 1, Manado", mapsUrl: null },
  patient: { name: "Maria Wenas", whatsapp: "6281234567001" },
};

describe("pesan dari booking", () => {
  it("konfirmasi menaut ke nomor pasien dan memakai nama layanan cadangan bila baris layanan kosong", () => {
    const message = confirmationMessageFor(booking, "https://sundyclinic.com")!;
    expect(message.text).toContain("Layanan: Konsultasi\n");
    expect(message.link).toMatch(/^https:\/\/wa\.me\/6281234567001\?text=/);
    expect(decodeURIComponent(message.link!.split("text=")[1])).toBe(message.text);
  });

  it("pengingat tanpa tautan bila nomor pasien tidak sah", () => {
    expect(reminderMessageFor({ ...booking, patient: { name: "Maria", whatsapp: "12" } })!.link).toBeNull();
  });

  it("null untuk booking tanpa pasien", () => {
    expect(confirmationMessageFor({ ...booking, patient: null }, "https://sundyclinic.com")).toBeNull();
    expect(reminderMessageFor({ ...booking, patient: null })).toBeNull();
  });
});

describe("quizLinkMessageText (spec C3 4.2)", () => {
  it("menyapa nama depan, menyebut layanan dan jadwal, lalu link", () => {
    expect(
      quizLinkMessageText({
        patientName: "Maria Wenas",
        serviceName: "Konsultasi Dokter",
        startAt: wita(17, 11),
        link: "https://sundyclinic.com/isi#abc",
      }),
    ).toBe(
      "Halo Maria, ini SunDY Clinic. Sebelum Konsultasi Dokter Senin, 17 Februari 2031 pukul 11.00 WITA, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc\n" +
        "Jawaban Anda hanya dibaca dokter kami.",
    );
  });
});
