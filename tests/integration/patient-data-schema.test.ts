// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const WA = "6281200009101";
const base = { medicalRecordNumber: "SDY-2026-9101", name: "Skema Data", whatsapp: WA };

async function cleanup() {
  await prisma.patient.deleteMany({ where: { whatsapp: WA } });
}

describe("skema data pasien: kontak darurat, email, status pernikahan", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("menyimpan semua kolom baru", async () => {
    const created = await prisma.patient.create({
      data: { ...base, email: "budi@example.com", emergencyContactName: "Ani", emergencyContactPhone: "6281200009102", maritalStatus: "MENIKAH" },
    });
    expect(created).toMatchObject({
      email: "budi@example.com",
      emergencyContactName: "Ani",
      emergencyContactPhone: "6281200009102",
      maritalStatus: "MENIKAH",
    });
  });

  it("pasien tanpa data baru tetap sah (pasien lama dan pendaftaran online)", async () => {
    const created = await prisma.patient.create({ data: base });
    expect(created).toMatchObject({ email: null, emergencyContactName: null, emergencyContactPhone: null, maritalStatus: null });
  });

  it("nama dan nomor kontak darurat terisi bersamaan atau kosong bersamaan", async () => {
    await expect(prisma.patient.create({ data: { ...base, emergencyContactName: "Ani" } })).rejects.toThrow(/patient_emergency_pair/);
    await expect(prisma.patient.create({ data: { ...base, emergencyContactPhone: "6281200009102" } })).rejects.toThrow(
      /patient_emergency_pair/,
    );
  });

  it("email harus berbentuk email", async () => {
    for (const email of ["budi", "budi@", "@example.com", "budi@example", "bu di@example.com"]) {
      await expect(prisma.patient.create({ data: { ...base, email } })).rejects.toThrow(/patient_email_format/);
    }
  });
});
