export type Settled<T> = { ok: true; data: T } | { ok: false };

/** Bagian dasbor dimuat sendiri-sendiri: satu yang gagal tidak menjatuhkan yang lain (spec D 4.7). */
export async function settle<T>(promise: Promise<T>, label: string): Promise<Settled<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    console.error(`[dasbor] ${label} gagal dimuat`, error);
    return { ok: false };
  }
}
