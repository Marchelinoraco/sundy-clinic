import { expect, test, type Locator, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import { E2E_KEUANGAN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec kategori layanan): Admin Keuangan menambah kategori, mengurutkan, mengganti nama dan foto,
// mengisi layanan, gagal menghapus selama berisi, memindahkan layanannya, lalu menghapus kategori; dialog paket memakai "Layanan".
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => `${testInfo.project.name === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;

async function pilihMemuat(select: Locator, text: string) {
  await select.selectOption((await select.locator("option", { hasText: text }).first().getAttribute("value")) ?? "");
}

test("Admin Keuangan mengelola kategori layanan dan memakai jasa di paket", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const firstName = `E2E Kategori ${t}`;
  const renamed = `E2E Kategori ${t} Baru`;
  const serviceName = `Jasa Kategori E2E ${t}`;
  const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#7e9ec8" } }).png().toBuffer();

  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/layanan");
  await tungguHidrasi(page);

  // Tambah kategori tanpa sakelar: tampil paling bawah dengan tandanya.
  await page.getByRole("button", { name: "Kelola kategori" }).click();
  const manager = page.getByRole("dialog", { name: "Kelola kategori" });
  await manager.getByRole("button", { name: "+ Kategori" }).click();
  const add = page.getByRole("dialog", { name: "Tambah kategori" });
  await add.getByLabel("Nama kategori").fill(firstName);
  await add.getByRole("checkbox", { name: "Pasien boleh memilih sendiri di situs" }).uncheck();
  await add.getByRole("button", { name: "Simpan" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });
  const items = manager.getByRole("listitem");
  await expect(items.last()).toHaveAccessibleName(firstName, { timeout: 30_000 });
  await expect(items.last()).toContainText("Tidak dipesan sendiri");

  // Naikkan satu posisi.
  await manager.getByRole("button", { name: `Naikkan ${firstName}` }).click();
  await expect(items.nth(-2)).toHaveAccessibleName(firstName, { timeout: 30_000 });

  // Ganti nama dan unggah foto.
  await manager.getByRole("button", { name: `Ubah ${firstName}` }).click();
  const edit = page.getByRole("dialog", { name: `Ubah — ${firstName}` });
  await edit.getByLabel("Berkas foto kategori").setInputFiles({ name: "kategori.png", mimeType: "image/png", buffer: photo });
  await expect(edit.getByRole("img", { name: "Pratinjau foto baru" })).toBeVisible();
  await edit.getByRole("button", { name: "Pakai foto ini" }).click();
  await expect(page.getByText("Foto kategori diganti dan sudah tampil di situs.")).toBeVisible({ timeout: 30_000 });
  await edit.getByLabel("Nama kategori").fill(renamed);
  await edit.getByRole("button", { name: "Simpan" }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });
  const item = manager.getByRole("listitem", { name: renamed, exact: true });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item.locator("img")).toHaveAttribute("src", /^\/foto-kategori\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);
  await manager.getByRole("button", { name: "Close" }).click();

  // Isi kategori dengan satu layanan internal.
  await page.getByRole("button", { name: "+ Layanan internal" }).click();
  const internal = page.getByRole("dialog", { name: "Tambah layanan internal" });
  await internal.getByLabel("Nama").fill(serviceName);
  await internal.getByLabel("Kategori").selectOption({ label: renamed });
  await internal.getByLabel("Harga berlaku").fill("50000");
  await internal.getByLabel("Durasi (menit)").fill("30");
  await internal.getByRole("button", { name: "Simpan" }).click();
  await expect(internal).toBeHidden({ timeout: 30_000 });

  // Hapus ditolak selama berisi.
  await page.getByRole("button", { name: "Kelola kategori" }).click();
  await expect(item).toContainText("1 layanan internal · 0 layanan situs", { timeout: 30_000 });
  await manager.getByRole("button", { name: `Hapus ${renamed}` }).click();
  await manager.getByRole("button", { name: "Ya, hapus" }).click();
  await expect(manager.getByRole("alert")).toContainText("masih berisi 1 layanan internal", { timeout: 30_000 });
  await manager.getByRole("button", { name: "Close" }).click();

  // Pindahkan layanannya ke Facial Treatment, lalu hapus kategori.
  await page.getByRole("button", { name: `Ubah ${serviceName}` }).click();
  const move = page.getByRole("dialog", { name: `Ubah — ${serviceName}` });
  await move.getByLabel("Kategori").selectOption({ label: "Facial Treatment" });
  await move.getByRole("button", { name: "Simpan" }).click();
  await expect(move).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Kelola kategori" }).click();
  await expect(item).toContainText("0 layanan internal · 0 layanan situs", { timeout: 30_000 });
  await manager.getByRole("button", { name: `Hapus ${renamed}` }).click();
  await manager.getByRole("button", { name: "Ya, hapus" }).click();
  await expect(item).toBeHidden({ timeout: 30_000 });
  await manager.getByRole("button", { name: "Close" }).click();

  // Dialog paket menyebut isinya "Layanan"; jasa konsultasi bisa dipilih.
  await page.goto("/admin/paket?tab=katalog");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Paket" }).click();
  const create = page.getByRole("dialog", { name: "Tambah paket" });
  await pilihMemuat(create.getByLabel("Layanan 1"), "Konsultasi Dokter");
  await expect(create.getByRole("group", { name: "Isi paket 1" })).toContainText("Harga jual");
  await expect(create.getByRole("button", { name: "+ Layanan" })).toBeVisible();
});
