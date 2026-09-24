import type { ActionResult } from "@/lib/action-result";

/** Mengambil data dari ActionResult sukses; gagal keras bila aksi mengembalikan galat. */
export async function unwrap<T>(pending: Promise<ActionResult<T>>): Promise<T> {
  const result = await pending;
  if (!result.ok) throw new Error(`Aksi gagal tanpa diduga: ${result.error}`);
  return result.data;
}
