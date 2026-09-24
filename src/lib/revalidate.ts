import { revalidatePath as nextRevalidatePath } from "next/cache";

/**
 * Membungkus revalidatePath milik next/cache agar aman dipanggil baik dari
 * permintaan Next.js sungguhan (Server Action, Route Handler) maupun dari
 * konteks Node biasa — uji integrasi dan skrip sekali pakai memanggil
 * server action "use server" secara langsung, melewati mesin HTTP yang
 * biasanya menyiapkan penyimpanan bercakupan-permintaan milik Next. Tanpa
 * ini, setiap server action yang menulis data melempar galat "static
 * generation store missing" begitu dipanggil di luar permintaan browser
 * sungguhan — termasuk dari uji integrasi.
 */
export function safeRevalidatePath(path: string): void {
  try {
    nextRevalidatePath(path);
  } catch (error) {
    const isOutsideRequestScope =
      error instanceof Error && error.message.includes("static generation store missing");
    if (!isOutsideRequestScope) throw error;
  }
}
