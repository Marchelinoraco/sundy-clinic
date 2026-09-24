/**
 * Galat yang pesannya memang ditujukan untuk dibaca admin.
 *
 * Next.js mengganti pesan galat yang DILEMPAR server action dengan teks
 * generik di build production. Karena itu pesan untuk admin harus
 * dikembalikan sebagai nilai lewat runAction, bukan dilempar sampai client.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Galat selain UserFacingError tetap dilempar, sehingga detail internal tidak pernah sampai ke layar. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof UserFacingError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
