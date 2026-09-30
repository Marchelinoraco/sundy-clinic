import { describe, expect, it } from "vitest";
import { validateIdentity } from "@/lib/kuis/identity";
import { newPatientIdentity, returningPatientIdentity } from "../../fixtures/quiz-answers";

const NOW = new Date("2026-09-28T03:00:00Z");

describe("validateIdentity", () => {
  it("menerima data lengkap pasien baru dan menyeragamkan nomor WA", () => {
    expect(validateIdentity(newPatientIdentity, "BARU", NOW)).toEqual({
      ok: true,
      identity: {
        name: "Siti Rahayu",
        whatsapp: "6281234567890",
        birthDate: "1992-04-17",
        gender: "P",
        occupation: "Guru",
        address: "Jl. Sam Ratulangi No. 5, Manado",
      },
    });
  });

  it("cukup nama, WA, dan tanggal lahir untuk pasien lama", () => {
    expect(validateIdentity(returningPatientIdentity, "LAMA", NOW)).toEqual({
      ok: true,
      identity: { name: "Siti Rahayu", whatsapp: "6281234567890", birthDate: "1992-04-17" },
    });
  });

  it("mewajibkan jenis kelamin, pekerjaan, dan alamat untuk pasien baru", () => {
    expect(validateIdentity(returningPatientIdentity, "BARU", NOW)).toMatchObject({ ok: false, field: "gender" });
    expect(validateIdentity({ ...newPatientIdentity, occupation: " " }, "BARU", NOW)).toMatchObject({
      ok: false,
      field: "occupation",
    });
  });

  it("menolak nomor WA dan tanggal lahir yang tidak sah", () => {
    expect(validateIdentity({ ...returningPatientIdentity, whatsapp: "12" }, "LAMA", NOW)).toMatchObject({
      ok: false,
      field: "whatsapp",
    });
    for (const birthDate of ["1992-02-30", "2026-09-28", "1900-01-01", "17-04-1992"]) {
      expect(validateIdentity({ ...returningPatientIdentity, birthDate }, "LAMA", NOW)).toMatchObject({
        ok: false,
        field: "birthDate",
      });
    }
  });

  it("menolak bentuk data yang tidak dikenal", () => {
    expect(validateIdentity({ ...returningPatientIdentity, nik: "123" }, "LAMA", NOW)).toMatchObject({ ok: false });
    expect(validateIdentity(null, "LAMA", NOW)).toMatchObject({ ok: false });
  });
});
