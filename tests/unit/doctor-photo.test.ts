// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_NAME } from "@/lib/doctor-profile";
import { doctorPhotoDir, processDoctorPhoto, readDoctorPhotoFile, removeDoctorPhotoFile, writeDoctorPhoto } from "@/server/doctor-photo";

const solid = (width: number, height: number, background = "#c8a97e") => sharp({ create: { width, height, channels: 3, background } });
const refuse = async (promise: Promise<unknown>, message: string) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(UserFacingError);
  expect((error as UserFacingError).message).toBe(message);
};

describe("pengolahan foto dokter", () => {
  it("menghasilkan WebP tanpa metadata: lokasi GPS dan hak cipta dari JPEG masukan terbuang", async () => {
    const input = await solid(800, 1000)
      .jpeg()
      .withExif({ IFD0: { Copyright: "Fotografer Uji" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "1/1 2/1 3/1", GPSLongitudeRef: "E", GPSLongitude: "4/1 5/1 6/1" } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // pastikan masukan memang membawa EXIF

    const out = await processDoctorPhoto(input);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.includes(Buffer.from("Fotografer Uji"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("mengoreksi orientasi EXIF (foto ponsel yang diputar) dan tidak menyisakan tanda orientasi", async () => {
    // 1000×800 dengan orientasi 6 (putar 90°) tampil sebagai 800×1000.
    const input = await solid(1000, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await processDoctorPhoto(input);
    expect([out.width, out.height]).toEqual([800, 1000]);
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1000]);
    expect(meta.orientation).toBeUndefined();
  });

  it("menyusutkan ke paling besar 1600 px sisi terpanjang dan tidak pernah memperbesar", async () => {
    const big = await processDoctorPhoto(await solid(3000, 4000).png().toBuffer());
    expect([big.width, big.height]).toEqual([1200, 1600]);
    const small = await processDoctorPhoto(await solid(800, 1000).png().toBuffer());
    expect([small.width, small.height]).toEqual([800, 1000]);
  });

  it("sidik jari 8 heks berasal dari isi hasil olahan, dan foto yang sama menghasilkan sidik jari yang sama", async () => {
    const input = await solid(800, 1000).png().toBuffer();
    const a = await processDoctorPhoto(input);
    const b = await processDoctorPhoto(input);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(a.fingerprint).toBe(createHash("sha256").update(a.bytes).digest("hex").slice(0, 8));
    expect(b.fingerprint).toBe(a.fingerprint);
    expect((await processDoctorPhoto(await solid(800, 1000, "#112233").png().toBuffer())).fingerprint).not.toBe(a.fingerprint);
  });

  it("menolak foto yang terlalu kecil, dinilai dari sisi terpendek setelah orientasi", async () => {
    const message = "Foto terlalu kecil. Sisi terpendek minimal 600 px.";
    await refuse(processDoctorPhoto(await solid(500, 700).png().toBuffer()), message);
    await refuse(processDoctorPhoto(await solid(4000, 500).png().toBuffer()), message);
    // 700×1200 dengan orientasi 6 tampil 1200×700: sisi terpendek 700 ≥ 600, lolos.
    await expect(processDoctorPhoto(await solid(700, 1200).jpeg().withMetadata({ orientation: 6 }).toBuffer())).resolves.toBeTruthy();
  });

  it("menolak berkas kosong, terlalu besar, bukan gambar, dan gambar rusak", async () => {
    await refuse(processDoctorPhoto(new Uint8Array(0)), "Berkas kosong.");
    await refuse(processDoctorPhoto(new Uint8Array(8 * 1024 * 1024 + 1).fill(0xff)), "Foto terlalu besar (maks. 8 MB).");
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    await refuse(processDoctorPhoto(html), "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>');
    await refuse(processDoctorPhoto(svg), "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");
    // Awal JPEG yang benar, isinya sampah: lolos pemeriksaan jenis, gagal dibaca sebagai gambar.
    const corrupt = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 200 }, (_, i) => (i * 7) % 256)]);
    await refuse(processDoctorPhoto(corrupt), "Foto tidak bisa dibaca sebagai gambar.");
  });

  it("menolak gambar berpiksel terlalu banyak (bom gambar) walau berkasnya kecil", async () => {
    const bomb = await solid(9000, 4500, "#ffffff").png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(8 * 1024 * 1024);
    await refuse(processDoctorPhoto(bomb), "Ukuran foto (piksel) terlalu besar.");
  }, 60_000);
});

describe("penyimpanan foto dokter", () => {
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;
  const photo = { bytes: Buffer.from("isi-foto-webp"), width: 800, height: 1000, fingerprint: "0a1b2c3d" };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-dokter-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  afterEach(async () => {
    await rm(path.join(root, "dokter"), { recursive: true, force: true });
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("menulis berkas bernama idstaf-sidikjari.webp di folder dokter tanpa sisa berkas sementara", async () => {
    expect(doctorPhotoDir()).toBe(path.join(root, "dokter"));
    const name = await writeDoctorPhoto("cmv0abc123", photo);
    expect(name).toBe("cmv0abc123-0a1b2c3d.webp");
    expect(name).toMatch(DOCTOR_PHOTO_NAME);
    expect((await stat(path.join(root, "dokter", name))).mode & 0o777).toBe(0o644);
    expect([...(await readDoctorPhotoFile(name))]).toEqual([...photo.bytes]);
    expect(await readdir(path.join(root, "dokter"))).toEqual([name]);
  });

  it("menulis ulang nama yang sama aman (foto yang sama), dan menghapus berkas, juga yang sudah tidak ada", async () => {
    const name = await writeDoctorPhoto("cmv0abc123", photo);
    expect(await writeDoctorPhoto("cmv0abc123", photo)).toBe(name);
    await removeDoctorPhotoFile(name);
    await expect(readDoctorPhotoFile(name)).rejects.toThrow();
    await expect(removeDoctorPhotoFile(name)).resolves.toBeUndefined();
  });

  it("menolak nama yang mencoba keluar dari folder atau tidak berbentuk yang kita buat", async () => {
    for (const bad of ["../../etc/passwd", "../x-0a1b2c3d.webp", "/etc/passwd", "abc.webp", "abc-0a1b2c3d.png", "a/b-0a1b2c3d.webp"]) {
      await expect(readDoctorPhotoFile(bad)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
      await expect(removeDoctorPhotoFile(bad)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
    }
    // id staf berpola aneh tidak bisa menyusun nama yang sah.
    await expect(writeDoctorPhoto("../escape", photo)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
    await expect(writeDoctorPhoto("ID-Besar", photo)).rejects.toThrow("Nama berkas foto dokter tidak sah.");
  });
});
