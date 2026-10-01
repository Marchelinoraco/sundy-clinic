import { describe, expect, it } from "vitest";
import { bookingRowActions, type BookingActionRow } from "@/lib/booking-actions";

const waiting: BookingActionRow = {
  status: "MENUNGGU_KONFIRMASI",
  source: "WHATSAPP",
  needsMatch: false,
  isSiteBooking: false,
  intakeId: null,
  transferInstruction: { link: "https://wa.me/6281234567890?text=x" },
  confirmation: null,
};
const site: BookingActionRow = {
  ...waiting,
  source: "SITUS",
  isSiteBooking: true,
  intakeId: "i1",
  transferInstruction: null,
};

describe("bookingRowActions (spec C1 5.2, C2 bagian 5)", () => {
  it("WA/telepon menunggu: Verifikasi dan Kirim instruksi transfer, sisanya di menu", () => {
    expect(bookingRowActions(waiting, true)).toEqual({
      primary: ["VERIFY", "SEND_TRANSFER"],
      menu: ["COPY_TRANSFER", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("nomor WA tidak sah: hanya Verifikasi terlihat, instruksi tetap bisa disalin", () => {
    expect(bookingRowActions({ ...waiting, transferInstruction: { link: null } }, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["COPY_TRANSFER", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("WA/telepon tanpa biaya booking: tanpa instruksi transfer", () => {
    expect(bookingRowActions({ ...waiting, transferInstruction: null }, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("walk-in menunggu: Hadir lebih dulu, karena pasiennya sudah di klinik", () => {
    expect(bookingRowActions({ ...waiting, source: "WALK_IN", transferInstruction: null }, true)).toEqual({
      primary: ["ATTEND", "VERIFY"],
      menu: ["NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("situs belum dicocokkan: hanya Cocokkan pasien, tanpa Pindah jadwal", () => {
    expect(bookingRowActions({ ...site, needsMatch: true }, true)).toEqual({
      primary: ["MATCH"],
      menu: ["VIEW_INTAKE", "CANCEL"],
    });
  });

  it("situs sudah dicocokkan: Verifikasi, dengan Ganti pasien dan Pindah jadwal di menu", () => {
    expect(bookingRowActions(site, true)).toEqual({
      primary: ["VERIFY"],
      menu: ["VIEW_INTAKE", "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi, Pindah jadwal di menu", () => {
    expect(
      bookingRowActions({ ...site, status: "TERKONFIRMASI", confirmation: { link: "https://wa.me/62812?text=x" } }, true),
    ).toEqual({
      primary: ["ATTEND", "SEND_CONFIRMATION"],
      menu: ["COPY_CONFIRMATION", "VIEW_INTAKE", "NO_SHOW", "RESCHEDULE", "CANCEL"],
    });
  });

  it("status akhir: hanya Lihat isian, bila ada dan berhak", () => {
    for (const status of ["HADIR", "SELESAI", "TIDAK_HADIR", "DIBATALKAN", "KEDALUWARSA"] as const) {
      expect(bookingRowActions({ ...site, status }, true)).toEqual({ primary: [], menu: ["VIEW_INTAKE"] });
      expect(bookingRowActions({ ...site, status }, false)).toEqual({ primary: [], menu: [] });
    }
  });

  it("Lihat isian hanya untuk yang berhak membaca rekam medis", () => {
    expect(bookingRowActions(site, false).menu).not.toContain("VIEW_INTAKE");
  });
});
