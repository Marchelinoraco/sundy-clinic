import { can } from "@/lib/permissions";
import { signQzRequest } from "@/server/qz-signing";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024;
const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * Asal permintaan harus situs ini sendiri, supaya situs lain tidak bisa meminjam tanda tangan SunDY untuk
 * mencetak lewat QZ Tray kasir. Disalin dari rute unggah BIA (lihat keputusan perencana 2).
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Tanda tangan SHA512 untuk qz.security.setSignaturePromise (spec struk WA 7.2). */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return text("Masuk dulu.", 401);
  if (!can(staff.role, "invoice:manage")) return text("Anda tidak berhak mencetak struk.", 403);
  if (!sameOrigin(request)) return text("Permintaan tidak sah.", 403);
  const body = await request.text();
  if (!body) return text("Permintaan kosong.", 400);
  if (Buffer.byteLength(body) > MAX_BYTES) return text("Permintaan terlalu besar.", 413);
  const signature = await signQzRequest(body);
  return signature ? text(signature, 200) : text("Kunci QZ belum diatur.", 404);
}
