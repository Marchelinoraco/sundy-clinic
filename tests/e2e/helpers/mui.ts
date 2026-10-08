import { expect, type Locator, type Page } from "@playwright/test";

type Scope = Page | Locator;
const pageOf = (scope: Scope): Page => ("keyboard" in scope ? scope : scope.page());

/**
 * Mengisi DateField/MonthField seperti pengguna: klik bagian pertama, lalu ketik angka (hari, bulan,
 * tahun berpindah sendiri). `text` berformat "YYYY-MM-DD" atau "YYYY-MM".
 */
export async function isiTanggal(scope: Scope, label: string, text: string): Promise<void> {
  const [year, month, day] = text.split("-");
  const shown = day ? `${day}/${month}/${year}` : `${month}/${year}`;
  const group = scope.getByRole("group", { name: label, exact: true });
  await group.getByRole("spinbutton").first().click();
  await pageOf(scope).keyboard.type(shown.replaceAll("/", ""));
  await expect(group.locator("input")).toHaveValue(shown);
}

/** Memilih opsi Autocomplete (pasien/barang): ketik teks opsi, lalu klik opsi yang sama persis. */
export async function pilihOpsi(scope: Scope, label: string, option: string): Promise<void> {
  const input = scope.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(option);
  await pageOf(scope).getByRole("option", { name: option, exact: true }).click();
  await expect(input).toHaveValue(option);
}
