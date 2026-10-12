import { describe, expect, it } from "vitest";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import {
  firstRegistrationError,
  isMaritalStatus,
  MARITAL_STATUS_LABEL,
  validatePatientRegistration,
  type RegistrationErrors,
} from "@/lib/patient-registration";

const TODAY = "2026-10-12";
const VALID = {
  nik: "7171015705900001",
  nikMissingReason: null,
  name: "Siti Rahayu",
  birthDate: "1990-05-17",
  whatsapp: "0812-3456-7890",
  email: "",
  emergencyContactName: "Budi Rahayu",
  emergencyContactPhone: "081298765432",
  address: "Jl. Sam Ratulangi 10, Manado",
  maritalStatus: null,
};

function check(patch: Record<string, unknown> = {}) {
  return validatePatientRegistration({ ...VALID, ...patch }, TODAY);
}

function errorsOf(patch: Record<string, unknown>): RegistrationErrors {
  const result = check(patch);
  if (result.ok) throw new Error(`Diharapkan ditolak, ternyata diterima: ${JSON.stringify(patch)}`);
  return result.errors;
}

describe("validatePatientRegistration", () => {
  it("menerima data lengkap dan membersihkannya", () => {
    const result = check();
    expect(result).toEqual({
      ok: true,
      value: {
        nik: "7171015705900001",
        nikMissingReason: null,
        name: "Siti Rahayu",
        birthDate: new Date("1990-05-17T00:00:00Z"),
        whatsapp: "6281234567890",
        email: null,
        emergencyContactName: "Budi Rahayu",
        emergencyContactPhone: "6281298765432",
        address: "Jl. Sam Ratulangi 10, Manado",
        maritalStatus: null,
      },
    });
  });

  describe("NIK", () => {
    it("membuang spasi, titik, dan tanda hubung yang ikut tertempel", () => {
      const result = check({ nik: "7171 0157.0590-0001" });
      expect(result.ok && result.value.nik).toBe("7171015705900001");
    });

    it("menolak NIK yang bukan 16 angka", () => {
      expect(errorsOf({ nik: "717101570590000" }).nik).toBe(NIK_FORMAT_ERROR);
      expect(errorsOf({ nik: "71710157059000012" }).nik).toBe(NIK_FORMAT_ERROR);
      expect(errorsOf({ nik: "7171015705900AB1" }).nik).toBe(NIK_FORMAT_ERROR);
    });

    it("menerima alasan belum ada NIK sebagai pengganti", () => {
      const result = check({ nik: null, nikMissingReason: "ANAK" });
      expect(result.ok && result.value).toMatchObject({ nik: null, nikMissingReason: "ANAK" });
    });

    it("menolak keduanya kosong, keduanya terisi, atau alasan yang tidak dikenal", () => {
      expect(errorsOf({ nik: null, nikMissingReason: null }).nik).toMatch(/NIK/);
      expect(errorsOf({ nik: "", nikMissingReason: "" }).nik).toMatch(/NIK/);
      expect(errorsOf({ nik: "7171015705900001", nikMissingReason: "ANAK" }).nik).toMatch(/salah satu/);
      expect(errorsOf({ nik: null, nikMissingReason: "BOSAN" }).nik).toMatch(/NIK/);
    });
  });

  describe("nama", () => {
    it("wajib dan dirapikan", () => {
      expect(errorsOf({ name: "   " }).name).toBe("Nama pasien wajib diisi.");
      const result = check({ name: "  Siti    Rahayu " });
      expect(result.ok && result.value.name).toBe("Siti Rahayu");
    });

    it("paling banyak 100 karakter", () => {
      expect(check({ name: "a".repeat(100) }).ok).toBe(true);
      expect(errorsOf({ name: "a".repeat(101) }).name).toMatch(/100/);
    });
  });

  describe("tanggal lahir (batas)", () => {
    it("hari ini sah, besok tidak", () => {
      expect(check({ birthDate: "2026-10-12" }).ok).toBe(true);
      expect(errorsOf({ birthDate: "2026-10-13" }).birthDate).toBe("Tanggal lahir tidak boleh di masa depan.");
    });

    it("1 Januari 1900 sah, 31 Desember 1899 tidak", () => {
      expect(check({ birthDate: "1900-01-01" }).ok).toBe(true);
      expect(errorsOf({ birthDate: "1899-12-31" }).birthDate).toMatch(/1900/);
    });

    it("wajib, dan menolak tanggal yang tidak ada atau bentuk lain", () => {
      expect(errorsOf({ birthDate: "" }).birthDate).toBe("Tanggal lahir wajib diisi.");
      expect(errorsOf({ birthDate: "1990-02-31" }).birthDate).toBe("Tanggal lahir tidak sah.");
      expect(errorsOf({ birthDate: "17/05/1990" }).birthDate).toBe("Tanggal lahir tidak sah.");
      expect(errorsOf({ birthDate: "1990-5-7" }).birthDate).toBe("Tanggal lahir tidak sah.");
    });
  });

  describe("no. HP (WhatsApp)", () => {
    it("wajib dan harus sah", () => {
      expect(errorsOf({ whatsapp: "" }).whatsapp).toBe("Nomor HP (WhatsApp) wajib diisi.");
      expect(errorsOf({ whatsapp: "0812" }).whatsapp).toMatch(/tidak sah/);
    });
  });

  describe("email", () => {
    it("boleh kosong; bila diisi menjadi huruf kecil dan dipangkas", () => {
      const empty = check({ email: "   " });
      expect(empty.ok && empty.value.email).toBeNull();
      const filled = check({ email: "  Budi@Example.COM " });
      expect(filled.ok && filled.value.email).toBe("budi@example.com");
    });

    it("menolak yang bukan bentuk email atau lebih dari 254 karakter", () => {
      for (const email of ["budi", "budi@", "@example.com", "budi@example", "bu di@example.com"]) {
        expect(errorsOf({ email }).email, email).toMatch(/Email tidak sah/);
      }
      expect(errorsOf({ email: `${"a".repeat(250)}@x.id` }).email).toMatch(/Email tidak sah/);
    });
  });

  describe("kontak darurat", () => {
    it("nama dan nomor sama-sama wajib", () => {
      expect(errorsOf({ emergencyContactName: " " }).emergencyContactName).toBe("Nama kontak darurat wajib diisi.");
      expect(errorsOf({ emergencyContactPhone: "" }).emergencyContactPhone).toBe("Nomor kontak darurat wajib diisi.");
    });

    it("nomor harus sah dan nama paling banyak 100 karakter", () => {
      expect(errorsOf({ emergencyContactPhone: "0812" }).emergencyContactPhone).toMatch(/tidak sah/);
      expect(errorsOf({ emergencyContactName: "a".repeat(101) }).emergencyContactName).toMatch(/100/);
    });
  });

  describe("alamat", () => {
    it("wajib dan paling banyak 300 karakter", () => {
      expect(errorsOf({ address: "  " }).address).toBe("Alamat wajib diisi.");
      expect(check({ address: "a".repeat(300) }).ok).toBe(true);
      expect(errorsOf({ address: "a".repeat(301) }).address).toMatch(/300/);
    });
  });

  describe("status pernikahan", () => {
    it("opsional; kosong menjadi null", () => {
      for (const maritalStatus of [null, "", undefined]) {
        const result = check({ maritalStatus });
        expect(result.ok && result.value.maritalStatus).toBeNull();
      }
    });

    it("menerima nilai yang dikenal dan menolak yang lain", () => {
      for (const value of Object.keys(MARITAL_STATUS_LABEL)) {
        const result = check({ maritalStatus: value });
        expect(result.ok && result.value.maritalStatus).toBe(value);
      }
      expect(errorsOf({ maritalStatus: "JANDA" }).maritalStatus).toBe("Status pernikahan tidak dikenal.");
      expect(isMaritalStatus("MENIKAH")).toBe(true);
      expect(isMaritalStatus("toString")).toBe(false);
    });
  });

  it("nilai bukan teks dari browser ditolak dengan galat per isian, tanpa melempar", () => {
    const result = validatePatientRegistration(
      { nik: 7171015705900001, name: null, birthDate: 19900517, whatsapp: {}, email: [], emergencyContactName: 5, emergencyContactPhone: true, address: undefined },
      TODAY,
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : Object.keys(result.errors)).toEqual(
      expect.arrayContaining(["nik", "name", "birthDate", "whatsapp", "emergencyContactName", "emergencyContactPhone", "address"]),
    );
  });

  it("input kosong total melaporkan semua isian wajib, bukan email dan status", () => {
    const result = validatePatientRegistration({}, TODAY);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(
      ["address", "birthDate", "emergencyContactName", "emergencyContactPhone", "name", "nik", "whatsapp"].sort(),
    );
  });
});

describe("firstRegistrationError", () => {
  it("mengambil galat menurut urutan isian di formulir", () => {
    expect(firstRegistrationError({ address: "Alamat wajib diisi.", name: "Nama pasien wajib diisi." })).toBe("Nama pasien wajib diisi.");
  });

  it("punya cadangan bila tidak ada galat per isian", () => {
    expect(firstRegistrationError({})).toBe("Data pasien belum lengkap.");
  });
});
