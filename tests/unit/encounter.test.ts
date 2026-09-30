import { describe, expect, it } from "vitest";
import {
  ageInYears,
  assessmentPreview,
  bmi,
  describeVitals,
  emptyDraftInput,
  encounterDraftInputSchema,
  parseEncounterDraft,
  parseVital,
  vitalInputValue,
  type EncounterDraftInput,
} from "@/lib/encounter";

function draft(patch: Omit<Partial<EncounterDraftInput>, "vitals"> & { vitals?: Partial<EncounterDraftInput["vitals"]> } = {}) {
  const base = emptyDraftInput();
  return { ...base, ...patch, vitals: { ...base.vitals, ...patch.vitals } };
}

describe("parseVital", () => {
  it("menerima koma, titik, dan spasi di tepi", () => {
    expect(parseVital("weightKg", " 72,5 ")).toEqual({ ok: true, value: 72.5 });
    expect(parseVital("temperatureC", "36.5")).toEqual({ ok: true, value: 36.5 });
    expect(parseVital("systolic", " 120 ")).toEqual({ ok: true, value: 120 });
  });

  it("kosong berarti tidak diukur", () => {
    expect(parseVital("pulse", "   ")).toEqual({ ok: true, value: null });
  });

  it("menerima batas rentang dan menolak di luar rentang dengan menyebut rentangnya", () => {
    expect(parseVital("weightKg", "20")).toEqual({ ok: true, value: 20 });
    expect(parseVital("systolic", "260")).toEqual({ ok: true, value: 260 });
    expect(parseVital("systolic", "49")).toEqual({ ok: false, message: "Sistolik harus 50–260 mmHg." });
    expect(parseVital("temperatureC", "42,1")).toEqual({ ok: false, message: "Suhu harus 34–42 °C." });
    expect(parseVital("waistCm", "1200")).toEqual({ ok: false, message: "Lingkar pinggang/perut harus 40–200 cm." });
  });

  it("menolak pecahan di kolom bilangan bulat, lebih dari satu desimal, dan teks", () => {
    expect(parseVital("pulse", "12.5")).toEqual({ ok: false, message: "Nadi harus bilangan bulat." });
    expect(parseVital("weightKg", "72,55")).toEqual({
      ok: false,
      message: "Berat badan paling banyak satu angka di belakang koma.",
    });
    expect(parseVital("heightCm", "160 cm")).toEqual({ ok: false, message: "Tinggi badan harus berupa angka." });
  });
});

describe("parseEncounterDraft", () => {
  it("merapikan teks dan mengubah isian kosong menjadi null", () => {
    const parsed = parseEncounterDraft(draft({ subjective: "  Pusing  ", plan: "   " }));
    expect(parsed).toMatchObject({ ok: true, value: { subjective: "Pusing", plan: null, assessment: null } });
  });

  it("tensi harus berpasangan, dan diastolik lebih kecil dari sistolik", () => {
    expect(parseEncounterDraft(draft({ vitals: { systolic: "120" } }))).toEqual({
      ok: false,
      message: "Isi sistolik dan diastolik bersamaan.",
    });
    expect(parseEncounterDraft(draft({ vitals: { systolic: "120", diastolic: "120" } }))).toEqual({
      ok: false,
      message: "Diastolik harus lebih kecil dari sistolik.",
    });
    expect(parseEncounterDraft(draft({ vitals: { systolic: "120", diastolic: "80" } }))).toMatchObject({
      ok: true,
      value: { vitals: { systolic: 120, diastolic: 80, weightKg: null } },
    });
  });

  it("menolak teks terlalu panjang dengan nama kolomnya", () => {
    expect(parseEncounterDraft(draft({ assessment: "a".repeat(5001) }))).toEqual({
      ok: false,
      message: "Penilaian / diagnosis terlalu panjang (maks. 5.000 karakter).",
    });
  });

  it("treatment wajib punya layanan dan pelaksana; area dibatasi 100 karakter", () => {
    const row = { serviceId: "s1", area: "", dose: "", performerId: "p1", notes: "" };
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, serviceId: "" }] }))).toEqual({
      ok: false,
      message: "Pilih treatment dari daftar.",
    });
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, performerId: "" }] }))).toEqual({
      ok: false,
      message: "Pilih pelaksana treatment.",
    });
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, area: "x".repeat(101) }] }))).toEqual({
      ok: false,
      message: "Area treatment terlalu panjang (maks. 100 karakter).",
    });
    expect(parseEncounterDraft(draft({ treatments: [{ ...row, dose: " 12 unit " }] }))).toMatchObject({
      ok: true,
      value: { treatments: [{ serviceId: "s1", performerId: "p1", area: null, dose: "12 unit", notes: null }] },
    });
  });
});

describe("encounterDraftInputSchema", () => {
  it("menolak bentuk isian yang bukan dari formulir", () => {
    expect(encounterDraftInputSchema.safeParse(emptyDraftInput()).success).toBe(true);
    expect(encounterDraftInputSchema.safeParse({ ...emptyDraftInput(), extra: 1 }).success).toBe(false);
    expect(encounterDraftInputSchema.safeParse({ ...emptyDraftInput(), subjective: 5 }).success).toBe(false);
  });
});

describe("tanda vital untuk dibaca", () => {
  it("IMT satu desimal, null bila berat atau tinggi kosong", () => {
    expect(bmi(72.5, 160)).toBe(28.3);
    expect(bmi(72.5, null)).toBeNull();
  });

  it("nilai isian memakai koma dan tanpa ,0 untuk bilangan bulat", () => {
    expect(vitalInputValue("weightKg", 72.5)).toBe("72,5");
    expect(vitalInputValue("heightCm", 160)).toBe("160");
    expect(vitalInputValue("pulse", null)).toBe("");
  });

  it("describeVitals hanya menyebut yang diukur, dengan IMT di akhir", () => {
    expect(
      describeVitals({ systolic: 120, diastolic: 80, pulse: null, temperatureC: 36.5, weightKg: 72.5, heightCm: 160, waistCm: null }),
    ).toEqual(["Tekanan darah: 120/80 mmHg", "Suhu: 36,5 °C", "Berat badan: 72,5 kg", "Tinggi badan: 160 cm", "IMT 28,3"]);
    expect(
      describeVitals({ systolic: null, diastolic: null, pulse: null, temperatureC: null, weightKg: null, heightCm: null, waistCm: null }),
    ).toEqual([]);
  });
});

describe("assessmentPreview", () => {
  it("meratakan spasi dan memotong sampai 80 karakter dengan elipsis", () => {
    expect(assessmentPreview("Obesitas\nderajat   1")).toBe("Obesitas derajat 1");
    const preview = assessmentPreview("a".repeat(120))!;
    expect(preview).toHaveLength(80);
    expect(preview.endsWith("…")).toBe(true);
    expect(assessmentPreview("   ")).toBeNull();
    expect(assessmentPreview(null)).toBeNull();
  });
});

describe("ageInYears", () => {
  it("menghitung umur pada tanggal kunjungan", () => {
    const birth = new Date("1990-05-17T00:00:00Z");
    expect(ageInYears(birth, "2026-05-16")).toBe(35);
    expect(ageInYears(birth, "2026-05-17")).toBe(36);
  });
});
