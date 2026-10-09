import { expect, type Page } from "@playwright/test";

export const choose = (page: Page, name: string | RegExp) =>
  page.getByRole("radio", typeof name === "string" ? { name, exact: true } : { name }).click();

export const tick = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).click();

export const next = (page: Page) => page.getByRole("button", { name: "Lanjut", exact: true }).click();

export const inGroup = (page: Page, group: string, option: string) =>
  page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name: option, exact: true }).click();

export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/masuk");
  // Tunggu skrip halaman selesai dimuat: `next dev` mengompilasi saat pertama dibuka, dan klik
  // sebelum React terpasang tidak menjalankan proses masuk.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Kata Sandi").fill(account.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** Tanggal WITA ("YYYY-MM-DD") hari `weekday` (0 = Minggu) berikutnya, paling cepat besok. */
export function upcomingWeekday(weekday: number): string {
  const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(nowWita.getUTCFullYear(), nowWita.getUTCMonth(), nowWita.getUTCDate()));
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

/** F1–F7 dengan jawaban yang sama untuk semua uji; dokter melihatnya di tabel "Kebiasaan sehari". */
export async function fillFormRecall(page: Page) {
  await page.getByLabel("Jam bangun").selectOption({ label: "06.00" });
  await page.getByLabel("Jam tidur").selectOption({ label: "22.00" });
  await next(page);
  const meals = [
    ["sarapan", "07.00", "Nasi kuning 1 piring, teh manis 1 gelas"],
    ["makan siang", "12.00", "Nasi 1 piring, ikan bakar 1 potong, sayur"],
    ["makan malam", "19.00", "Nasi ½ piring, ayam goreng 1 potong"],
  ] as const;
  for (const [meal, time, food] of meals) {
    await page.getByLabel(`Jam ${meal}`).selectOption({ label: time });
    await page.getByLabel("Apa yang Anda makan & minum, berapa porsinya?").fill(food);
    await next(page);
  }
  await choose(page, "Hampir setiap hari");
  await page.getByLabel("Jam cemilan").selectOption({ label: "16.00" });
  await page.getByLabel("Cemilan apa, berapa banyak?").fill("Pisang goreng 2 potong");
  await next(page);
  await choose(page, "Kadang-kadang");
  await page.getByLabel("Jenis olahraga").fill("Jalan kaki");
  await page.getByLabel("Berapa menit sekali olahraga").fill("30");
  await inGroup(page, "Berapa kali seminggu", "2×");
  await page.getByLabel("Jam olahraga").selectOption({ label: "17.00" });
  await next(page);
  await inGroup(page, "Merokok", "Tidak");
  await inGroup(page, "Minum alkohol", "Tidak");
  await inGroup(page, "Minuman bersoda", "Kadang");
  await next(page);
}
