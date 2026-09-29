import { describe, expect, it } from "vitest";
import { mergeRecordText } from "@/lib/record-text";

describe("mergeRecordText", () => {
  it("memakai usulan bila catatan pasien masih kosong", () => {
    expect(mergeRecordText(null, "Darah tinggi: Amlodipine")).toBe("Darah tinggi: Amlodipine");
  });

  it("menambahkan hanya baris usulan yang belum ada, tanpa peduli huruf besar atau spasi", () => {
    expect(
      mergeRecordText("darah tinggi:  amlodipine", "Darah tinggi: Amlodipine\nDiabetes: tidak minum obat"),
    ).toBe("darah tinggi:  amlodipine\nDiabetes: tidak minum obat");
  });

  it("tidak menambahkan 'Tidak ada' ke catatan yang sudah berisi", () => {
    expect(mergeRecordText("Amoxicillin (gatal-gatal)", "Tidak ada")).toBe("Amoxicillin (gatal-gatal)");
  });

  it("membuang 'Tidak ada' lama begitu ada isi sungguhan", () => {
    expect(mergeRecordText("Tidak ada", "Udang")).toBe("Udang");
  });

  it("mempertahankan 'Tidak ada' bila hanya itu isinya", () => {
    expect(mergeRecordText(null, "Tidak ada")).toBe("Tidak ada");
  });

  it("mengembalikan catatan lama apa adanya bila isian tidak memuat usulan", () => {
    expect(mergeRecordText("Asma\nUdang", null)).toBe("Asma\nUdang");
    expect(mergeRecordText(null, null)).toBe("");
  });
});
