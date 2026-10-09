import { describe, expect, it } from "vitest";
import {
  BIA_FIELDS,
  BIA_MAX_BYTES,
  EMPTY_BIA_INPUT,
  biaAccess,
  uniqueChartLabels,
  biaFieldLabel,
  biaInputValue,
  contentDisposition,
  detectBiaFileType,
  parseBiaInput,
  parseBiaNumber,
  safeOriginalName,
} from "@/lib/bia";

const spec = (key: string) => BIA_FIELDS.find((field) => field.key === key)!;
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

describe("angka BIA", () => {
  it("menerima koma dan titik, satu angka di belakang koma, dan kosong", () => {
    expect(parseBiaNumber(spec("bodyFatPercent"), "28,5")).toEqual({ ok: true, value: 28.5 });
    expect(parseBiaNumber(spec("bodyFatPercent"), " 28.5 ")).toEqual({ ok: true, value: 28.5 });
    expect(parseBiaNumber(spec("bodyFatPercent"), "")).toEqual({ ok: true, value: null });
    expect(parseBiaNumber(spec("visceralFat"), "9")).toEqual({ ok: true, value: 9 });
  });

  it("menolak huruf, notasi ilmiah, negatif, desimal pada angka bulat, dan dua angka di belakang koma", () => {
    for (const raw of ["abc", "2.85e1", "-5", "28,5,1", "28,"]) {
      expect(parseBiaNumber(spec("bodyFatPercent"), raw).ok).toBe(false);
    }
    expect(parseBiaNumber(spec("visceralFat"), "9,5")).toEqual({ ok: false, message: "Lemak viseral harus bilangan bulat." });
    expect(parseBiaNumber(spec("bodyFatPercent"), "28,55")).toEqual({ ok: false, message: "Lemak tubuh paling banyak satu angka di belakang koma." });
  });

  it("menolak di luar rentang dengan pesan yang menyebut nama dan rentangnya", () => {
    expect(parseBiaNumber(spec("bodyFatPercent"), "1,9")).toEqual({ ok: false, message: "Lemak tubuh harus 2–70 %." });
    expect(parseBiaNumber(spec("boneMassKg"), "0,4")).toEqual({ ok: false, message: "Massa tulang harus 0,5–10 kg." });
    expect(parseBiaNumber(spec("visceralFat"), "60")).toEqual({ ok: false, message: "Lemak viseral harus 1–59." });
    const bmr = parseBiaNumber(spec("bmr"), "5001");
    expect(bmr.ok).toBe(false);
    expect(!bmr.ok && bmr.message).toMatch(/^Metabolisme basal harus 500–5\.?000 kkal\.$/);
  });

  it("menyimpan semua angka yang diisi dan menolak simpan yang kosong semuanya", () => {
    const parsed = parseBiaInput({ ...EMPTY_BIA_INPUT, bodyFatPercent: "28,5", muscleMassKg: "41", bmr: "1450" }, "  Puasa 8 jam ");
    expect(parsed).toEqual({
      ok: true,
      value: {
        numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: null, bmr: 1450, metabolicAge: null, bodyWaterPercent: null, boneMassKg: null },
        note: "Puasa 8 jam",
      },
    });
    expect(parseBiaInput(EMPTY_BIA_INPUT, "")).toEqual({ ok: false, message: "Isi minimal satu angka BIA." });
    expect(parseBiaInput({ ...EMPTY_BIA_INPUT, bmr: "20" }, "")).toEqual({ ok: false, message: expect.stringContaining("Metabolisme basal harus") });
    expect(parseBiaInput({ ...EMPTY_BIA_INPUT, bmr: "1450" }, "x".repeat(501))).toEqual({ ok: false, message: "Catatan paling banyak 500 karakter." });
  });

  it("menulis angka kembali ke isian dengan koma desimal, dan label memuat satuan", () => {
    expect(biaInputValue("bodyFatPercent", 28.5)).toBe("28,5");
    expect(biaInputValue("visceralFat", 9)).toBe("9");
    expect(biaInputValue("boneMassKg", null)).toBe("");
    expect(biaFieldLabel(spec("bodyFatPercent"))).toBe("Lemak tubuh (%)");
    expect(biaFieldLabel(spec("visceralFat"))).toBe("Lemak viseral");
    expect(biaFieldLabel(spec("bmr"))).toBe("Metabolisme basal (kkal)");
  });
});

describe("jenis berkas dari byte awal", () => {
  it("mengenali JPEG, PNG, WebP, HEIC, dan PDF", () => {
    expect(detectBiaFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toEqual({ mime: "image/jpeg", ext: "jpg", previewable: true });
    expect(detectBiaFileType(bytes(0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ mime: "image/png", ext: "png", previewable: true });
    expect(detectBiaFileType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toEqual({ mime: "image/webp", ext: "webp", previewable: true });
    expect(detectBiaFileType(bytes(0, 0, 0, 24, ...ascii("ftypheic"), 0))).toEqual({ mime: "image/heic", ext: "heic", previewable: false });
    expect(detectBiaFileType(bytes(0, 0, 0, 24, ...ascii("ftypmif1"), 0))).toEqual({ mime: "image/heic", ext: "heic", previewable: false });
    expect(detectBiaFileType(bytes(...ascii("%PDF-1.7")))).toEqual({ mime: "application/pdf", ext: "pdf", previewable: true });
  });

  it("menolak HTML, SVG, skrip, dan berkas pendek walau diberi nama atau mime gambar", () => {
    expect(detectBiaFileType(bytes(...ascii("<!doctype html><script>alert(1)</script>")))).toBeNull();
    expect(detectBiaFileType(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(detectBiaFileType(bytes(...ascii("MZ\x90\x00")))).toBeNull();
    expect(detectBiaFileType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectBiaFileType(new Uint8Array(0))).toBeNull();
    // MP4 punya "ftyp" juga, tetapi mereknya bukan HEIC.
    expect(detectBiaFileType(bytes(0, 0, 0, 24, ...ascii("ftypisom"), 0))).toBeNull();
  });

  it("batas ukuran 10 MB", () => {
    expect(BIA_MAX_BYTES).toBe(10_485_760);
  });
});

describe("nama berkas", () => {
  it("membuang jalur, karakter kendali, dan tanda kutip; menjaga ekstensi saat dipotong", () => {
    expect(safeOriginalName("C:\\Users\\Rina\\hasil bia.png")).toBe("hasil bia.png");
    expect(safeOriginalName("../../etc/passwd")).toBe("passwd");
    expect(safeOriginalName('a"b\u0000c.pdf')).toBe("abc.pdf");
    expect(safeOriginalName("   ")).toBe("berkas");
    expect(safeOriginalName("..")).toBe("berkas");
    const long = safeOriginalName(`${"a".repeat(300)}.jpeg`);
    expect(long.length).toBe(120);
    expect(long.endsWith(".jpeg")).toBe(true);
  });

  it("header Content-Disposition memuat nama aman dan versi UTF-8", () => {
    expect(contentDisposition("hasil bia.png", "inline")).toBe(`inline; filename="hasil bia.png"; filename*=UTF-8''hasil%20bia.png`);
    expect(contentDisposition("hasil β.pdf", "attachment")).toBe(`attachment; filename="hasil _.pdf"; filename*=UTF-8''hasil%20%CE%B2.pdf`);
  });
});

describe("hak atas BIA per peran dan status booking", () => {
  const klinik = (status: string) => ({ status, channel: "KLINIK" as const });

  it("HADIR: dokter dan Super Admin mengunggah, mengisi angka, dan membatalkan apa saja; resepsionis hanya mengunggah dan membatalkan miliknya", () => {
    for (const role of ["DOKTER", "SUPER_ADMIN"] as const) {
      expect(biaAccess(role, klinik("HADIR"))).toEqual({ upload: true, editNumbers: true, voidAny: true, voidOwnFile: true, view: true });
    }
    expect(biaAccess("RESEPSIONIS", klinik("HADIR"))).toEqual({ upload: true, editNumbers: false, voidAny: false, voidOwnFile: true, view: false });
  });

  it("SELESAI: hanya dokter dan Super Admin yang menambah atau membatalkan; resepsionis tidak bisa apa-apa", () => {
    expect(biaAccess("DOKTER", klinik("SELESAI"))).toEqual({ upload: true, editNumbers: true, voidAny: true, voidOwnFile: false, view: true });
    expect(biaAccess("RESEPSIONIS", klinik("SELESAI"))).toEqual({ upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view: false });
  });

  it("peran lain, booking online, dan status lain tidak punya akses menulis", () => {
    for (const role of ["APOTEKER", "ADMIN_KEUANGAN", "TERAPIS"] as const) {
      expect(biaAccess(role, klinik("HADIR"))).toEqual({ upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view: false });
    }
    const online = biaAccess("DOKTER", { status: "HADIR", channel: "ONLINE" });
    expect(online).toMatchObject({ upload: false, editNumbers: false, voidAny: false, voidOwnFile: false });
    for (const status of ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI", "DIBATALKAN", "TIDAK_HADIR", "KEDALUWARSA"]) {
      expect(biaAccess("DOKTER", klinik(status))).toMatchObject({ upload: false, editNumbers: false, voidAny: false });
    }
  });
});

describe("label sumbu grafik", () => {
  it("memberi nomor pada label yang kembar, dan membiarkan yang unik", () => {
    expect(uniqueChartLabels(["2 Sep", "9 Okt", "9 Okt", "9 Okt", "1 Nov"])).toEqual(["2 Sep", "9 Okt (1)", "9 Okt (2)", "9 Okt (3)", "1 Nov"]);
    expect(uniqueChartLabels(["2 Sep", "9 Okt"])).toEqual(["2 Sep", "9 Okt"]);
    expect(uniqueChartLabels([])).toEqual([]);
  });
});
