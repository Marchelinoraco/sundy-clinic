import { fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { vi } from "vitest";

type Queries = Pick<typeof screen, "getByRole">;

/**
 * Input tersembunyi isian tanggal MUI X 9. Nama aksesibel ada di kelompok (`role="group"`) berisi bagian
 * hari/bulan/tahun; input di dalamnya memuat teks terformat "DD/MM/YYYY" atau "MM/YYYY".
 */
export function dateFieldInput(label: string, scope: Queries = screen): HTMLInputElement {
  const input = scope.getByRole("group", { name: label }).querySelector("input");
  if (!input) throw new Error(`Isian tanggal "${label}" tidak punya input`);
  return input;
}

/** Mengisi DateField/MonthField dengan "YYYY-MM-DD"/"YYYY-MM", seperti pengguna mengetik tanggal lengkap. */
export function setDateField(label: string, text: string, scope: Queries = screen): void {
  const [year, month, day] = text.split("-");
  fireEvent.change(dateFieldInput(label, scope), { target: { value: day ? `${day}/${month}/${year}` : `${month}/${year}` } });
}

/** Nilai isian tanggal sebagai "YYYY-MM-DD"/"YYYY-MM"; "" bila kosong. */
export function dateFieldValue(label: string, scope: Queries = screen): string {
  const parts = dateFieldInput(label, scope).value.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  if (parts.length === 2) return `${parts[1]}-${parts[0]}`;
  return "";
}

/** Memilih opsi Autocomplete (pasien/barang). Daftar opsi tampil di portal, jadi dicari di seluruh dokumen. */
export async function pickOption(user: UserEvent, label: string, option: string | RegExp, scope: Queries = screen): Promise<void> {
  await user.click(scope.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/**
 * jsdom tidak menghitung tata letak; DataGrid butuh ukuran agar kolom dan baris dirender.
 * Pakai `beforeEach(() => mockGridLayout())` — fungsi yang dikembalikan memulihkan tiruan.
 */
export function mockGridLayout(width = 1200, height = 800): () => void {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
  const spies = [
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width),
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(height),
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(width),
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(height),
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect),
  ];
  return () => spies.forEach((spy) => spy.mockRestore());
}
