// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { unwrap } from "./unwrap";
import {
  createPatient,
  findPatientsByWhatsapp,
  listRecentPatients,
  searchPatients,
} from "@/server/patient";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Staf Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

describe("data pasien", () => {
  beforeEach(async () => {
    await prisma.patient.deleteMany();
    await prisma.patientNumberCounter.deleteMany();
  });

  afterAll(async () => {
    // beforeEach hanya membersihkan sebelum giliran berikutnya — pasien dari
    // giliran terakhir tertinggal dan terbawa ke berkas atau uji lain.
    await prisma.patient.deleteMany();
    await prisma.patientNumberCounter.deleteMany();
    await prisma.$disconnect();
  });

  it("membuat pasien dengan nomor rekam medis SDY-<tahun>-0001 untuk pasien pertama tahun ini", async () => {
    const patient = await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    const year = new Date().getFullYear();
    expect(patient.medicalRecordNumber).toBe(`SDY-${year}-0001`);
    expect(patient.programStatus).toBe("AKTIF");
  });

  it("menaikkan nomor urut untuk pasien berikutnya di tahun yang sama", async () => {
    await unwrap(createPatient({ name: "Pasien Satu", whatsapp: "6281111111111" }));
    const second = await unwrap(createPatient({ name: "Pasien Dua", whatsapp: "6282222222222" }));
    const year = new Date().getFullYear();
    expect(second.medicalRecordNumber).toBe(`SDY-${year}-0002`);
  });

  it("mengalokasikan nomor rekam medis unik walau dibuat bersamaan", async () => {
    // Race condition sungguhan: 10 pembuatan pasien ditembakkan berbarengan.
    // Tanpa penguncian atomik pada baris penghitung, dua di antaranya bisa
    // mendapat nomor yang sama.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        unwrap(createPatient({ name: `Pasien Bersamaan ${i}`, whatsapp: `62800000000${i}` })),
      ),
    );
    const numbers = results.map((p) => p.medicalRecordNumber);
    expect(new Set(numbers).size).toBe(10);
  });

  it("mencari pasien berdasarkan nama sebagian", async () => {
    await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    const found = await searchPatients("rahayu");
    expect(found.map((p) => p.name)).toContain("Siti Rahayu");
  });

  it("mencari pasien berdasarkan nomor WhatsApp", async () => {
    await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    const found = await searchPatients("81234567890");
    expect(found.map((p) => p.name)).toContain("Siti Rahayu");
  });

  it("mendeteksi kemungkinan duplikat lewat nomor WhatsApp yang sama", async () => {
    await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    const matches = await findPatientsByWhatsapp("6281234567890");
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("Siti Rahayu");
  });

  it("menyimpan nomor WhatsApp dalam bentuk seragam 62…", async () => {
    const patient = await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "0812-3456-7890" }));
    expect(patient.whatsapp).toBe("6281234567890");
  });

  it("mendeteksi duplikat walau nomor diketik dengan awalan 0", async () => {
    await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    const matches = await findPatientsByWhatsapp("0812 3456 7890");
    expect(matches.map((p) => p.name)).toEqual(["Siti Rahayu"]);
  });

  it("menemukan pasien saat admin mencari dengan awalan 0", async () => {
    await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    const found = await searchPatients("0812345");
    expect(found.map((p) => p.name)).toContain("Siti Rahayu");
  });

  it("menolak pasien tanpa nama", async () => {
    const result = await createPatient({ name: "   ", whatsapp: "6281234567890" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/nama/i) });
    expect(await prisma.patient.count()).toBe(0);
  });

  it("menolak nomor WhatsApp yang tidak sah tanpa memakan nomor rekam medis", async () => {
    const result = await createPatient({ name: "Siti Rahayu", whatsapp: "0812" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/whatsapp/i) });

    // Nomor urut tidak boleh terbuang oleh input yang ditolak.
    const next = await unwrap(createPatient({ name: "Siti Rahayu", whatsapp: "6281234567890" }));
    expect(next.medicalRecordNumber).toBe(`SDY-${new Date().getFullYear()}-0001`);
  });

  it("mendaftar pasien terbaru lebih dulu", async () => {
    await unwrap(createPatient({ name: "Pasien Lama", whatsapp: "6281111111111" }));
    await unwrap(createPatient({ name: "Pasien Baru", whatsapp: "6282222222222" }));
    const list = await listRecentPatients();
    expect(list.map((p) => p.name)).toEqual(["Pasien Baru", "Pasien Lama"]);
  });
});
