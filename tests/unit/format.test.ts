import { describe, expect, it } from "vitest";
import {
  formatDateColumn,
  formatDateWithYear,
  formatGender,
  formatIndonesianDate,
  formatPrice,
  formatRupiah,
  formatScheduleForMessage,
  formatShortIndonesianDate,
} from "@/lib/format";

describe("formatRupiah", () => {
  it("memakai titik sebagai pemisah ribuan", () => {
    expect(formatRupiah(499000)).toBe("Rp 499.000");
  });

  it("memformat angka jutaan", () => {
    expect(formatRupiah(3589000)).toBe("Rp 3.589.000");
  });

  it("memformat angka di bawah seribu", () => {
    expect(formatRupiah(500)).toBe("Rp 500");
  });

  it("tidak menampilkan angka desimal", () => {
    expect(formatRupiah(50000)).toBe("Rp 50.000");
  });

  it("memakai spasi biasa, bukan spasi tanpa putus", () => {
    // Intl menghasilkan U+00A0 setelah "Rp". Spasi itu tidak dapat dicari
    // pengguna dan membingungkan saat uji membandingkan teks.
    expect(formatRupiah(99000)).not.toContain(" ");
  });
});

describe("formatPrice", () => {
  it("menambahkan catatan satuan bila ada", () => {
    expect(formatPrice(50000, "/ unit")).toBe("Rp 50.000 / unit");
  });

  it("menghilangkan catatan bila null", () => {
    expect(formatPrice(499000, null)).toBe("Rp 499.000");
  });

  it("menghilangkan catatan bila tidak diberikan", () => {
    expect(formatPrice(499000)).toBe("Rp 499.000");
  });
});

describe("formatIndonesianDate", () => {
  it("menulis hari dan bulan dalam bahasa Indonesia, dalam WITA", () => {
    // 25 September 2026 pukul 07.00 UTC = 15.00 WITA, hari Jumat.
    const date = new Date("2026-09-25T07:00:00Z");
    expect(formatIndonesianDate(date)).toBe("Jumat, 25 September 2026");
  });

  it("tidak melompat ke tanggal berikutnya dekat tengah malam WITA", () => {
    // 26 Sep pukul 00.30 WITA = 25 Sep pukul 16.30 UTC — tetap tanggal 26 WITA.
    const date = new Date("2026-09-25T16:30:00Z");
    expect(formatIndonesianDate(date)).toBe("Sabtu, 26 September 2026");
  });
});

describe("formatShortIndonesianDate", () => {
  it("menulis hari dan bulan singkat dalam WITA", () => {
    // 7 Okt 2026 pukul 20.30 UTC = 8 Okt 04.30 WITA, hari Kamis.
    expect(formatShortIndonesianDate(new Date("2026-10-07T20:30:00Z"))).toBe("Kam, 8 Okt");
  });
});

describe("formatDateColumn", () => {
  it("menulis kolom tanggal sebagai hari/bulan/tahun tanpa bergeser zona waktu", () => {
    expect(formatDateColumn(new Date("1992-04-17T00:00:00Z"))).toBe("17/04/1992");
    expect(formatDateColumn(null)).toBeNull();
  });
});

describe("formatGender", () => {
  it("menerjemahkan kode jenis kelamin", () => {
    expect(formatGender("P")).toBe("Perempuan");
    expect(formatGender("L")).toBe("Laki-laki");
    expect(formatGender(null)).toBeNull();
  });
});

describe("formatScheduleForMessage", () => {
  it("menulis hari, tanggal, dan jam WITA untuk pesan WhatsApp", () => {
    // 03.00 UTC = 11.00 WITA.
    expect(formatScheduleForMessage(new Date("2031-02-17T03:00:00Z"))).toBe(
      "Senin, 17 Februari 2031 pukul 11.00 WITA",
    );
  });
});

describe("formatDateWithYear", () => {
  it("tanggal singkat dengan tahun, dalam WITA", () => {
    expect(formatDateWithYear(new Date("2026-09-28T03:00:00Z"))).toBe("28 Sep 2026");
    // 23.30 UTC 30 Sep = 07.30 WITA 1 Okt
    expect(formatDateWithYear(new Date("2026-09-30T23:30:00Z"))).toBe("1 Okt 2026");
  });
});
