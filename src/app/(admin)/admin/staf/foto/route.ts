import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_MAX_BYTES } from "@/lib/doctor-profile";
import { can } from "@/lib/permissions";
import { isSameOrigin } from "@/server/same-origin";
import { getCurrentStaff } from "@/server/session";
import { uploadStaffPhoto } from "@/server/staff-photo";

export const dynamic = "force-dynamic";

const json = (body: { ok: true; photoUrl: string } | { ok: false; error: string }, status: number) => Response.json(body, { status });
const TOO_BIG = "Foto terlalu besar (maks. 8 MB).";

/** Satu foto profil staf per permintaan (spec profil dokter 4 dan 6). Pemeriksaan hak diulang oleh pemanggil layanan lewat peran pelaku. */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return json({ ok: false, error: "Masuk dulu." }, 401);
  if (!can(staff.role, "staff:manage")) return json({ ok: false, error: "Anda tidak berhak mengubah foto staf." }, 403);
  if (!isSameOrigin(request)) return json({ ok: false, error: "Permintaan tidak sah." }, 403);

  // Tolak sebelum isinya dibaca ke memori (+ sedikit ruang untuk bidang formulir).
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DOCTOR_PHOTO_MAX_BYTES + 512 * 1024) return json({ ok: false, error: TOO_BIG }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Permintaan bukan unggahan berkas." }, 400);
  }
  const staffId = form.get("staffId");
  const file = form.get("file");
  if (typeof staffId !== "string" || !(file instanceof File)) return json({ ok: false, error: "Pilih foto yang akan diunggah." }, 400);
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) return json({ ok: false, error: TOO_BIG }, 413);

  try {
    const saved = await uploadStaffPhoto({ actor: staff, staffId, bytes: new Uint8Array(await file.arrayBuffer()) });
    return json({ ok: true, photoUrl: saved.photoUrl }, 200);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ ok: false, error: error.message }, 422);
    console.error("Gagal menyimpan foto staf", error);
    return json({ ok: false, error: "Gagal menyimpan foto. Coba lagi." }, 500);
  }
}
