import { describe, expect, it } from "vitest";
import { BOOKING_ACTION_LABEL, bookingRowActions, type BookingActionRow } from "@/lib/booking-actions";

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

  it("Hadir menjadi Check-in", () => {
    expect(BOOKING_ACTION_LABEL.ATTEND).toBe("Check-in");
    expect(BOOKING_ACTION_LABEL.FOOD_RECALL).toBe("Food recall");
  });

  it("customer yang sudah check-in hari ini: Food recall di menu, sebelum Lihat isian", () => {
    expect(bookingRowActions({ ...site, status: "HADIR", foodRecallAvailable: true }, true)).toEqual({
      primary: [],
      menu: ["FOOD_RECALL", "VIEW_INTAKE"],
    });
    expect(bookingRowActions({ ...site, status: "HADIR", foodRecallAvailable: false }, true)).toEqual({
      primary: [],
      menu: ["VIEW_INTAKE"],
    });
  });

  it("Unggah hasil BIA di menu booking hadir, setelah Food recall dan sebelum Lihat isian", () => {
    expect(BOOKING_ACTION_LABEL.UPLOAD_BIA).toBe("Unggah hasil BIA");
    expect(bookingRowActions({ ...site, status: "HADIR", foodRecallAvailable: true, biaUploadAvailable: true }, true)).toEqual({
      primary: [],
      menu: ["FOOD_RECALL", "UPLOAD_BIA", "VIEW_INTAKE"],
    });
    expect(bookingRowActions({ ...site, status: "HADIR", biaUploadAvailable: true }, false).menu).toEqual(["UPLOAD_BIA"]);
    expect(bookingRowActions({ ...site, status: "HADIR", biaUploadAvailable: false }, false).menu).toEqual([]);
  });
});

describe("bookingRowActions link kuis (spec C3 4.2)", () => {
  it("link kuis yang berlaku menjadi item pertama di menu", () => {
    expect(bookingRowActions({ ...waiting, quizLink: "https://x/isi#a" }, true).menu[0]).toBe("QUIZ_LINK");
    expect(
      bookingRowActions({ ...waiting, source: "WALK_IN", transferInstruction: null, quizLink: "https://x/isi#a" }, true),
    ).toEqual({ primary: ["ATTEND", "VERIFY"], menu: ["QUIZ_LINK", "NO_SHOW", "RESCHEDULE", "CANCEL"] });
  });

  it("tanpa link kuis: tidak ada di menu", () => {
    expect(bookingRowActions(waiting, true).menu).not.toContain("QUIZ_LINK");
    expect(bookingRowActions({ ...waiting, quizLink: null }, true).menu).not.toContain("QUIZ_LINK");
  });
});

describe("bookingRowActions untuk booking online (spec konsultasi online 5.3)", () => {
  const onlineWaiting: BookingActionRow = { ...waiting, channel: "ONLINE" };
  const onlineConfirmed: BookingActionRow = {
    ...waiting,
    channel: "ONLINE",
    status: "TERKONFIRMASI",
    transferInstruction: null,
    confirmation: { link: "https://wa.me/6281234567890?text=k" },
  };

  it("menunggu: tanpa Check-in, Tidak hadir, dan Pindah jadwal; Ubah waktu luang sebelum Batalkan", () => {
    expect(bookingRowActions(onlineWaiting, true)).toEqual({
      primary: ["VERIFY", "SEND_TRANSFER"],
      menu: ["COPY_TRANSFER", "CHANGE_WINDOWS", "CANCEL"],
    });
  });

  it("terkonfirmasi: Kirim konfirmasi terlihat, Ubah waktu luang di menu", () => {
    expect(bookingRowActions(onlineConfirmed, true)).toEqual({
      primary: ["SEND_CONFIRMATION"],
      menu: ["COPY_CONFIRMATION", "CHANGE_WINDOWS", "CANCEL"],
    });
  });

  it("Perlu waktu baru: Minta waktu baru via WA dan Ubah waktu luang terlihat", () => {
    const row = { ...onlineConfirmed, requestNewTime: { link: "https://wa.me/6281234567890?text=b" } };
    expect(bookingRowActions(row, true)).toEqual({
      primary: ["REQUEST_NEW_TIME", "CHANGE_WINDOWS"],
      menu: ["SEND_CONFIRMATION", "COPY_CONFIRMATION", "CANCEL"],
    });
  });

  it("sudah dimulai: tidak ada Ubah waktu luang", () => {
    expect(bookingRowActions({ ...onlineConfirmed, status: "HADIR" }, true)).toEqual({ primary: [], menu: [] });
  });

  it("booking klinik tidak berubah", () => {
    expect(bookingRowActions({ ...waiting, channel: "KLINIK" }, true).menu).toContain("RESCHEDULE");
  });
});
