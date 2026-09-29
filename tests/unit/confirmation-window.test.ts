import { describe, expect, it } from "vitest";
import { confirmationCutoff } from "@/lib/confirmation-window";

// Jam WITA → instant UTC (WITA = UTC+8). 8–13 Feb 2031: Sabtu, Minggu, Senin, Selasa, Rabu, Kamis.
const wita = (date: string, hour: number, minute = 0) =>
  new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour - 8, minute));

const none = new Set<string>();

describe("confirmationCutoff", () => {
  it("mundur tepat 24 jam bila tidak ada hari Minggu atau libur di antaranya", () => {
    expect(confirmationCutoff(wita("2031-02-12", 12), none)).toEqual(wita("2031-02-11", 12));
  });

  it("tidak menghitung jam pada hari Minggu", () => {
    // Senin 15.00: Senin 15 jam + Sabtu 9 jam (sejak 15.00) = 24 jam kerja.
    expect(confirmationCutoff(wita("2031-02-10", 15), none)).toEqual(wita("2031-02-08", 15));
  });

  it("tidak menghitung jam pada tanggal libur", () => {
    // Kamis 12.00 dengan Rabu libur: Kamis 12 jam + Selasa 12 jam.
    expect(confirmationCutoff(wita("2031-02-13", 12), new Set(["2031-02-12"]))).toEqual(wita("2031-02-11", 12));
  });

  it("melewati Minggu dan libur yang berurutan", () => {
    // Selasa 06.00 dengan Senin libur: Selasa 6 jam + Sabtu 18 jam (sejak 06.00).
    expect(confirmationCutoff(wita("2031-02-11", 6), new Set(["2031-02-10"]))).toEqual(wita("2031-02-08", 6));
  });

  it("saat dijalankan pada hari Minggu, jam hari itu belum dihitung", () => {
    // Minggu 12.00: seluruh 24 jam diambil dari hari Sabtu.
    expect(confirmationCutoff(wita("2031-02-09", 12), none)).toEqual(wita("2031-02-08", 0));
  });

  it("booking yang dibuat hari Minggu baru mulai dihitung Senin 00.00", () => {
    // Senin 23.59 belum 24 jam kerja → batasnya masih sebelum Minggu siang.
    const cutoff = confirmationCutoff(wita("2031-02-10", 23, 59), none);
    expect(cutoff.getTime()).toBeLessThan(wita("2031-02-09", 14).getTime());
    // Selasa 00.00 tepat 24 jam kerja sejak Senin 00.00 → booking Minggu siang lewat batas.
    expect(confirmationCutoff(wita("2031-02-11", 0), none).getTime()).toBeGreaterThan(wita("2031-02-09", 14).getTime());
  });
});
