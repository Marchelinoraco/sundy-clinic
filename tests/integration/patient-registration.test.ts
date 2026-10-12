// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import { checkPatientNik, createPatient } from "@/server/patient";
import { requireCapability } from "@/server/session";
import { patientInput } from "./patient-fixture";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Resepsionis Uji",
    role: "RESEPSIONIS",
    email: "uji@sundy.test",
  }),
}));

const YEAR = new Date().getFullYear();

async function reset() {
  await prisma.patient.deleteMany();
  await prisma.patientNumberCounter.deleteMany();
}

// Satu penutupan koneksi untuk seluruh berkas: Task 4 dan 5 menambah describe lain di berkas ini.
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("createPatient: data lengkap dan NIK", () => {
  beforeEach(reset);

  it("menyimpan data lengkap: NIK dan nomor dinormalkan, email huruf kecil", async () => {
    const created = await unwrap(
      createPatient(
        patientInput({
          nik: "7171 0101.9000-0001",
          name: "  Siti   Rahayu ",
          whatsapp: "0812-3456-7890",
          email: " Siti@Example.COM ",
          emergencyContactPhone: "0812 9876 5432",
          maritalStatus: "MENIKAH",
        }),
      ),
    );
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      nik: "7171010190000001",
      nikMissingReason: null,
      name: "Siti Rahayu",
      whatsapp: "6281234567890",
      email: "siti@example.com",
      emergencyContactName: "Budi Rahayu",
      emergencyContactPhone: "6281298765432",
      address: "Jl. Sam Ratulangi 10, Manado",
      maritalStatus: "MENIKAH",
    });
    expect(row.birthDate?.toISOString().slice(0, 10)).toBe("1990-01-01");
    expect(created.medicalRecordNumber).toBe(`SDY-${YEAR}-0001`);
  });

  it("email dan status pernikahan boleh kosong", async () => {
    const created = await unwrap(createPatient(patientInput({ email: "", maritalStatus: null })));
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ email: null, maritalStatus: null });
  });

  it("menyimpan alasan belum ada NIK bila NIK tidak diisi", async () => {
    const created = await unwrap(createPatient(patientInput({ nik: null, nikMissingReason: "ANAK" })));
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ nik: null, nikMissingReason: "ANAK" });
  });

  it("menolak NIK yang sudah dipakai dengan pesan yang menyebut pemiliknya", async () => {
    const first = await unwrap(createPatient(patientInput({ nik: "7171010190000002", name: "Pemilik Asli" })));
    const second = await createPatient(patientInput({ nik: "7171 0101 9000 0002", name: "Pendaftar Kedua", whatsapp: "6281200000002" }));
    expect(second).toEqual({
      ok: false,
      error: `NIK ini sudah terdaftar atas nama Pemilik Asli (${first.medicalRecordNumber}).`,
    });
    expect(await prisma.patient.count()).toBe(1);
  });

  it("isian yang ditolak tidak memakan nomor rekam medis", async () => {
    const rejected: Partial<Parameters<typeof patientInput>[0]>[] = [
      { name: "" },
      { birthDate: "2999-01-01" },
      { whatsapp: "0812" },
      { email: "bukan-email" },
      { emergencyContactName: "" },
      { emergencyContactPhone: "" },
      { address: "" },
      { nik: null, nikMissingReason: null },
      { nik: "123" },
    ];
    for (const patch of rejected) {
      const result = await createPatient(patientInput(patch));
      expect(result.ok, JSON.stringify(patch)).toBe(false);
    }
    expect(await prisma.patientNumberCounter.count()).toBe(0);
    expect(await prisma.patient.count()).toBe(0);

    const next = await unwrap(createPatient(patientInput()));
    expect(next.medicalRecordNumber).toBe(`SDY-${YEAR}-0001`);
  });

  it("nilai bukan teks dari browser ditolak dengan pesan, bukan galat", async () => {
    const hostile = { ...patientInput(), name: 123, nik: {}, birthDate: null, address: ["x"] } as never;
    const result = await createPatient(hostile);
    expect(result.ok).toBe(false);
    expect(await createPatient(null as never)).toEqual({ ok: false, error: expect.any(String) });
    expect(await prisma.patientNumberCounter.count()).toBe(0);
  });

  it("dua pendaftaran dengan NIK sama bersamaan: tepat satu lolos dan nomor tidak terbuang", async () => {
    const nik = "7171010190000003";
    const results = await Promise.all([
      createPatient(patientInput({ nik, name: "Rebutan A", whatsapp: "6281200000003" })),
      createPatient(patientInput({ nik, name: "Rebutan B", whatsapp: "6281200000004" })),
    ]);
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, error: expect.stringMatching(/^NIK ini sudah terdaftar atas nama Rebutan [AB] \(SDY-\d{4}-0001\)\.$/) });
    expect(await prisma.patient.count({ where: { nik } })).toBe(1);
    expect((await prisma.patientNumberCounter.findFirstOrThrow()).value).toBe(1);
  });

  it("pemeriksaan awal terlewat (balapan): pelanggaran indeks unik diterjemahkan dan nomor dibatalkan", async () => {
    const nik = "7171010190000004";
    await unwrap(createPatient(patientInput({ nik, name: "Sudah Ada" })));
    // Meniru pendaftar kedua yang pemeriksaan awalnya belum melihat pemilik NIK.
    const findFirst = vi.spyOn(prisma.patient, "findFirst").mockImplementationOnce((async () => null) as never);
    try {
      const result = await createPatient(patientInput({ nik, name: "Terlambat", whatsapp: "6281200000005" }));
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/^NIK ini sudah terdaftar atas nama Sudah Ada \(SDY-\d{4}-0001\)\.$/) });
      expect(findFirst).toHaveBeenCalled();
    } finally {
      findFirst.mockRestore();
    }
    expect(await prisma.patient.count()).toBe(1);
    // Nomor yang sempat diambil pendaftar kedua ikut batal bersama transaksinya.
    expect((await prisma.patientNumberCounter.findFirstOrThrow()).value).toBe(1);
  });

  it("ringkasan yang kembali ke browser tidak memuat NIK, email, atau kontak darurat", async () => {
    const created = await unwrap(createPatient(patientInput({ nik: "7171010190000005", email: "rahasia@example.com" })));
    const json = JSON.stringify(created);
    expect(json).not.toContain("7171010190000005");
    expect(json).not.toContain("rahasia@example.com");
    expect(json).not.toContain("Budi Rahayu");
    expect(Object.keys(created).sort()).toEqual(
      ["id", "lastVisitAt", "medicalRecordNumber", "name", "nextBookingAt", "programStatus", "whatsapp"].sort(),
    );
  });

  it("catatan audit hanya memuat nama dan nomor rekam medis", async () => {
    const created = await unwrap(
      createPatient(patientInput({ nik: "7171010190000006", email: "rahasia@example.com", emergencyContactName: "Kontak Rahasia" })),
    );
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.create", entityId: created.id } });
    expect(audit.summary).toBe(`Siti Rahayu (${created.medicalRecordNumber})`);
    const all = JSON.stringify(audit);
    expect(all).not.toContain("7171010190000006");
    expect(all).not.toContain("rahasia@example.com");
    expect(all).not.toContain("Kontak Rahasia");
  });

  it("memerlukan hak booking:manage dan tidak menyimpan apa pun bila ditolak", async () => {
    await unwrap(createPatient(patientInput()));
    expect(requireCapability).toHaveBeenLastCalledWith("booking:manage");

    vi.mocked(requireCapability).mockRejectedValueOnce(new Error("Tidak berhak"));
    await expect(createPatient(patientInput())).rejects.toThrow("Tidak berhak");
    expect(await prisma.patient.count()).toBe(1);
  });
});

describe("checkPatientNik", () => {
  beforeEach(reset);

  it("NIK yang belum dipakai → FREE", async () => {
    expect(await unwrap(checkPatientNik("7171010190000010"))).toEqual({ status: "FREE" });
  });

  it("NIK yang sudah dipakai → TAKEN dengan ringkasan pemilik dan tanggal lahir", async () => {
    const owner = await unwrap(createPatient(patientInput({ nik: "7171010190000011", name: "Pemilik NIK" })));
    const result = await unwrap(checkPatientNik("7171 0101 9000 0011"));
    expect(result).toEqual({
      status: "TAKEN",
      patient: expect.objectContaining({ id: owner.id, name: "Pemilik NIK", medicalRecordNumber: owner.medicalRecordNumber }),
      birthDateLabel: "01/01/1990",
    });
  });

  it("hasilnya tidak memuat email atau kontak darurat pemilik", async () => {
    await unwrap(createPatient(patientInput({ nik: "7171010190000012", email: "rahasia@example.com" })));
    const json = JSON.stringify(await unwrap(checkPatientNik("7171010190000012")));
    expect(json).not.toContain("rahasia@example.com");
    expect(json).not.toContain("Budi Rahayu");
    expect(json).not.toContain("emergency");
  });

  it("menolak NIK yang bukan 16 angka, termasuk nilai bukan teks", async () => {
    expect(await checkPatientNik("123")).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(await checkPatientNik(null as never)).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(await checkPatientNik({} as never)).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
  });

  it("memerlukan hak booking:manage", async () => {
    await checkPatientNik("7171010190000013");
    expect(requireCapability).toHaveBeenLastCalledWith("booking:manage");
    vi.mocked(requireCapability).mockRejectedValueOnce(new Error("Tidak berhak"));
    await expect(checkPatientNik("7171010190000013")).rejects.toThrow("Tidak berhak");
  });
});
