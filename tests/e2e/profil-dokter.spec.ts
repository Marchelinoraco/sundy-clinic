import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

test.setTimeout(240_000);

test("pemilik mengedit profil dokter: teks dan foto tampil di /tentang; setelah disembunyikan fotonya tidak bisa dibuka", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Dr. Profil ${suffix}`;
  const specialty = `Spesialis Uji ${suffix}`;
  const bio = `Deskripsi uji ${suffix}.`;
  const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#c8a97e" } }).png().toBuffer();

  // Tambah dokter yang tampil di situs.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Tambah staf" }).click();
  const add = page.getByRole("dialog", { name: "Tambah staf" });
  await add.getByLabel("Nama").fill(name);
  await add.getByLabel("Peran").selectOption("DOKTER");
  await add.getByLabel("Tampil di situs publik").check();
  await add.getByLabel("Email login").fill(`e2e-staf-profil-${suffix}@sundy.test`.toLowerCase());
  await add.getByRole("button", { name: "Tambah staf" }).click();
  await page.getByRole("dialog", { name: `Kata sandi sementara — ${name}` }).getByRole("button", { name: "Tutup" }).click();

  // Ubah: spesialisasi, deskripsi, dan foto.
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Ubah" }).click();
  const edit = page.getByRole("dialog", { name: `Ubah — ${name}` });
  await edit.getByLabel("Spesialisasi").fill(specialty);
  await edit.getByLabel("Deskripsi singkat").fill(bio);
  await edit.getByLabel("Berkas foto dokter").setInputFiles({ name: "dokter.png", mimeType: "image/png", buffer: photo });
  await expect(edit.getByRole("img", { name: "Pratinjau foto baru" })).toBeVisible();
  await edit.getByRole("button", { name: "Pakai foto ini" }).click();
  await expect(page.getByText("Foto diganti dan sudah tampil di situs.")).toBeVisible({ timeout: 30_000 });
  await edit.getByRole("button", { name: "Simpan" }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });

  // Halaman publik menampilkan teks dan fotonya.
  await page.goto("/tentang");
  const profile = page.getByRole("article").filter({ hasText: name });
  await expect(profile.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  await expect(profile).toContainText(specialty);
  await expect(profile).toContainText(bio);
  const image = profile.getByRole("img", { name });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const src = (await image.getAttribute("src")) ?? "";
  const photoUrl = decodeURIComponent(new URL(src, "http://localhost").searchParams.get("url") ?? src);
  expect(photoUrl).toMatch(/^\/foto-dokter\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);

  // Rute foto melayani tanpa login dengan cache panjang.
  const direct = await request.get(photoUrl);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"]).toBe("image/webp");
  // Cache singkat: foto dokter yang disembunyikan atau dihapus lenyap dalam hitungan menit, tidak bertahan setahun di cache gambar atau Cloudflare.
  expect(direct.headers()["cache-control"]).toBe("public, max-age=300");

  // Disembunyikan dari situs: fotonya tidak bisa dibuka lagi dan dokternya hilang dari halaman.
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Ubah" }).click();
  const hide = page.getByRole("dialog", { name: `Ubah — ${name}` });
  await hide.getByLabel("Tampil di situs publik").uncheck();
  await hide.getByRole("button", { name: "Simpan" }).click();
  await expect(hide).toBeHidden({ timeout: 30_000 });
  expect((await request.get(photoUrl)).status()).toBe(404);
  await page.goto("/tentang");
  await expect(page.getByRole("heading", { name })).toHaveCount(0);

  // Hapus foto dari dokter yang sudah disembunyikan (memastikan tombol Hapus foto bekerja di dialog).
  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Ubah" }).click();
  const remove = page.getByRole("dialog", { name: `Ubah — ${name}` });
  // Dokter yang belum tampil di situs tetap punya pratinjau foto di dialog (lewat rute admin, bukan rute publik yang 404).
  const current = remove.getByRole("img", { name: "Foto saat ini" });
  await expect(current).toBeVisible();
  await expect.poll(() => current.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  await remove.getByRole("button", { name: "Hapus foto" }).click();
  await expect(page.getByText("Foto dihapus.")).toBeVisible({ timeout: 30_000 });
  await expect(remove.getByText("Belum ada foto unggahan. Situs memakai foto bawaan bila ada.")).toBeVisible();
});
