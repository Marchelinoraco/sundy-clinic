import { describe, expect, it } from "vitest";
import {
  firstName,
  missingIdentityFields,
  needsFeeConsent,
  patientTypeForKind,
  quizKindFor,
  quizLinkLines,
  quizLinkState,
  quizLinkVersion,
  type QuizLinkBooking,
} from "@/lib/quiz-link";

const NOW = new Date("2026-10-05T02:00:00Z");
const open: QuizLinkBooking = {
  source: "WHATSAPP",
  status: "MENUNGGU_KONFIRMASI",
  startAt: new Date("2026-10-06T03:00:00Z"),
  patientId: "p1",
  intake: null,
};

describe("quizLinkState (spec C3 3.1)", () => {
  it("berlaku untuk booking WA, telepon, dan walk-in yang aktif dan belum dimulai", () => {
    expect(quizLinkState(open, NOW)).toBe("OPEN");
    expect(quizLinkState({ ...open, source: "TELEPON", status: "TERKONFIRMASI" }, NOW)).toBe("OPEN");
    expect(quizLinkState({ ...open, source: "WALK_IN" }, NOW)).toBe("OPEN");
    expect(quizLinkState({ ...open, intake: { status: "MENUNGGU_DIISI", linkVersion: 2 } }, NOW)).toBe("OPEN");
  });

  it("sudah diisi bila isiannya terkirim, apa pun status bookingnya sekarang", () => {
    expect(quizLinkState({ ...open, intake: { status: "TERISI", linkVersion: 0 } }, NOW)).toBe("SUBMITTED");
    expect(
      quizLinkState({ ...open, status: "DIBATALKAN", intake: { status: "DIPERIKSA", linkVersion: 0 } }, NOW),
    ).toBe("SUBMITTED");
  });

  it("tidak berlaku untuk booking situs, tanpa pasien, tidak aktif, atau yang sudah dimulai", () => {
    expect(quizLinkState({ ...open, source: "SITUS" }, NOW)).toBe("CLOSED");
    expect(quizLinkState({ ...open, patientId: null }, NOW)).toBe("CLOSED");
    for (const status of ["DIBATALKAN", "TIDAK_HADIR", "KEDALUWARSA", "HADIR", "SELESAI"] as const) {
      expect(quizLinkState({ ...open, status }, NOW)).toBe("CLOSED");
    }
    expect(quizLinkState({ ...open, startAt: NOW }, NOW)).toBe("CLOSED");
  });
});

describe("pembantu link kuis", () => {
  it("versi link 0 sampai admin menekan Ganti link", () => {
    expect(quizLinkVersion(open)).toBe(0);
    expect(quizLinkVersion({ intake: { status: "MENUNGGU_DIISI", linkVersion: 3 } })).toBe(3);
  });

  it("persetujuan biaya hanya untuk booking berbiaya yang belum diverifikasi", () => {
    expect(needsFeeConsent({ bookingFee: 100000, status: "MENUNGGU_KONFIRMASI" })).toBe(true);
    expect(needsFeeConsent({ bookingFee: 100000, status: "TERKONFIRMASI" })).toBe(false);
    expect(needsFeeConsent({ bookingFee: null, status: "MENUNGGU_KONFIRMASI" })).toBe(false);
  });

  it("nama depan dari nama lengkap", () => {
    expect(firstName("  Maria   Wenas ")).toBe("Maria");
    expect(firstName("Budi")).toBe("Budi");
  });

  it("kuis lengkap untuk pasien tanpa isian lengkap, pendek untuk yang sudah punya", () => {
    expect(quizKindFor(false)).toBe("LENGKAP");
    expect(quizKindFor(true)).toBe("PENDEK");
    expect(patientTypeForKind("LENGKAP")).toBe("BARU");
    expect(patientTypeForKind("PENDEK")).toBe("LAMA");
  });

  it("kolom data diri yang kosong, termasuk teks kosong dari data lama", () => {
    expect(
      missingIdentityFields({ birthDate: null, gender: null, occupation: null, address: null }),
    ).toEqual(["birthDate", "gender", "occupation", "address"]);
    expect(
      missingIdentityFields({ birthDate: new Date("1990-05-17T00:00:00Z"), gender: "P", occupation: "  ", address: "" }),
    ).toEqual(["occupation", "address"]);
    expect(
      missingIdentityFields({ birthDate: new Date("1990-05-17T00:00:00Z"), gender: "L", occupation: "Guru", address: "Manado" }),
    ).toEqual([]);
  });

  it("baris kuis untuk pesan WA", () => {
    expect(quizLinkLines("https://sundyclinic.com/isi#abc")).toEqual([
      "Sebelum datang, mohon isi form singkat ini (±5 menit): https://sundyclinic.com/isi#abc",
      "Jawaban Anda hanya dibaca dokter kami.",
    ]);
  });
});
