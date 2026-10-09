// @vitest-environment node
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BIA_STORAGE_NAME, patientFilesDir, readBiaFile, removeBiaFile, writeBiaFile } from "@/server/bia-storage";

let root: string;
const original = process.env.PATIENT_FILES_DIR;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sundy-bia-"));
  process.env.PATIENT_FILES_DIR = root;
});
afterEach(async () => {
  await rm(path.join(root, "bia"), { recursive: true, force: true });
});
afterAll(async () => {
  if (original === undefined) delete process.env.PATIENT_FILES_DIR;
  else process.env.PATIENT_FILES_DIR = original;
  await rm(root, { recursive: true, force: true });
});

describe("penyimpanan berkas BIA", () => {
  it("memakai folder dari lingkungan, dan /www/sundy-files bila tidak diisi", () => {
    expect(patientFilesDir()).toBe(root);
    delete process.env.PATIENT_FILES_DIR;
    expect(patientFilesDir()).toBe("/www/sundy-files");
    process.env.PATIENT_FILES_DIR = root;
  });

  it("menulis berkas bernama acak di bawah tahun/bulan, dengan izin 0600 dan folder 0700, tanpa sisa berkas sementara", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const name = await writeBiaFile(bytes, "jpg", new Date("2026-10-09T03:00:00Z"));
    expect(name).toMatch(BIA_STORAGE_NAME);
    expect(name.startsWith("2026/10/")).toBe(true);
    const file = path.join(root, "bia", name);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
    expect([...(await readBiaFile(name))]).toEqual([...bytes]);
    expect(await readdir(path.dirname(file))).toEqual([path.basename(file)]);
  });

  it("dua penulisan menghasilkan dua nama berbeda", async () => {
    const a = await writeBiaFile(new Uint8Array([1]), "pdf");
    const b = await writeBiaFile(new Uint8Array([1]), "pdf");
    expect(a).not.toBe(b);
  });

  it("menghapus berkas, dan menghapus yang tidak ada tidak galat", async () => {
    const name = await writeBiaFile(new Uint8Array([1, 2]), "png");
    await removeBiaFile(name);
    await expect(readBiaFile(name)).rejects.toThrow();
    await expect(removeBiaFile(name)).resolves.toBeUndefined();
  });

  it("menolak nama yang mencoba keluar dari folder atau tidak berbentuk yang kita buat", async () => {
    for (const bad of ["../../etc/passwd", "2026/10/../../x.jpg", "/etc/passwd", "2026/10/abc.jpg", "2026/10/00000000-0000-4000-8000-000000000000.exe"]) {
      await expect(readBiaFile(bad)).rejects.toThrow("Nama berkas BIA tidak sah.");
      await expect(removeBiaFile(bad)).rejects.toThrow("Nama berkas BIA tidak sah.");
    }
    await expect(writeBiaFile(new Uint8Array([1]), "exe")).rejects.toThrow("Ekstensi berkas BIA tidak sah.");
  });
});
