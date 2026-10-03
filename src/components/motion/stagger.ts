// Bukan berkas "use client": dipanggil langsung oleh komponen server yang menyusun kumpulan kartu.

/** Jeda bergiliran 70 ms per kartu, paling lama tujuh langkah supaya kartu terakhir tidak menunggu lama. */
export function staggerDelay(index: number): number {
  return Math.min(index, 6) * 70;
}
