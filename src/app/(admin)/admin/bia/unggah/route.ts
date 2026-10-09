import { UserFacingError } from "@/lib/action-result";
import { BIA_MAX_BYTES } from "@/lib/bia";
import { can } from "@/lib/permissions";
import { uploadBiaFile } from "@/server/bia-upload";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

const json = (body: { ok: true; fileId: string } | { ok: false; error: string }, status: number) => Response.json(body, { status });

/** Asal permintaan harus situs ini sendiri (cookie sesi saja tidak cukup bagi rute yang menulis). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Satu berkas hasil BIA per permintaan (spec hasil BIA 4.3). Pemeriksaan hak diulang di `uploadBiaFile`. */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return json({ ok: false, error: "Masuk dulu." }, 401);
  if (!can(staff.role, "bia:upload")) return json({ ok: false, error: "Anda tidak berhak mengunggah hasil BIA." }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: "Permintaan tidak sah." }, 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Permintaan bukan unggahan berkas." }, 400);
  }
  const appointmentId = form.get("appointmentId");
  const file = form.get("file");
  if (typeof appointmentId !== "string" || !(file instanceof File)) return json({ ok: false, error: "Pilih berkas yang akan diunggah." }, 400);
  if (file.size > BIA_MAX_BYTES) return json({ ok: false, error: "Berkas terlalu besar (maks. 10 MB)." }, 413);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await uploadBiaFile({ actor: staff, appointmentId, originalName: file.name, bytes });
    return json({ ok: true, fileId: saved.fileId }, 200);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ ok: false, error: error.message }, 422);
    console.error("Gagal menyimpan hasil BIA", error);
    return json({ ok: false, error: "Gagal menyimpan berkas. Coba lagi." }, 500);
  }
}
