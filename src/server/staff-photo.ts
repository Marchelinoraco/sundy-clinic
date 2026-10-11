import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { doctorPhotoName, doctorPhotoUrl, roleHasPublicProfile } from "@/lib/doctor-profile";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { processDoctorPhoto, readDoctorPhotoFile, removeDoctorPhotoFile, writeDoctorPhoto } from "@/server/doctor-photo";
import type { CurrentStaff } from "@/server/session";

/**
 * Layanan foto profil dokter (spec profil dokter 4.5). Sengaja BUKAN berkas "use server": `uploadStaffPhoto` menerima byte,
 * dan semua ekspor berkas "use server" menjadi titik masuk yang bisa dipanggil klien. Pintu masuknya rute `POST /admin/staf/foto`
 * dan aksi `removeStaffPhoto`, keduanya sudah memeriksa hak `staff:manage`.
 */
function revalidatePublic() {
  safeRevalidatePath("/admin/staf");
  safeRevalidatePath("/tentang");
  safeRevalidatePath("/");
}

const NOT_FOUND = "Staf tidak ditemukan.";

export async function uploadStaffPhoto(input: { actor: CurrentStaff; staffId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }> {
  const staff = await prisma.staff.findUnique({ where: { id: String(input.staffId ?? "") }, select: { id: true, name: true, role: true, photoUrl: true } });
  if (!staff) throw new UserFacingError(NOT_FOUND);
  if (!roleHasPublicProfile(staff.role)) throw new UserFacingError("Foto hanya untuk dokter dan terapis.");

  const processed = await processDoctorPhoto(input.bytes);
  const name = await writeDoctorPhoto(staff.id, processed);
  const photoUrl = doctorPhotoUrl(name);
  const oldName = doctorPhotoName(staff.photoUrl);

  try {
    await prisma.staff.update({ where: { id: staff.id }, data: { photoUrl } });
  } catch (error) {
    // Foto yang sama (nama sama dengan yang lama) berarti berkasnya masih dipakai: jangan dihapus.
    if (name !== oldName) await removeDoctorPhotoFile(name).catch(() => undefined);
    throw error;
  }
  if (oldName && oldName !== name) await removeDoctorPhotoFile(oldName).catch(() => undefined);

  // Foto sudah terpasang: kegagalan menulis audit tidak boleh membuat unggahan dianggap gagal.
  await recordAudit({ actor: input.actor, action: "staff.photo.update", entity: "Staff", entityId: staff.id, summary: staff.name }).catch((error) =>
    console.error("Gagal mencatat audit foto staf", staff.id, error),
  );
  revalidatePublic();
  return { photoUrl };
}

export async function removeStaffPhotoFor(actor: CurrentStaff, staffId: string): Promise<void> {
  const staff = await prisma.staff.findUnique({ where: { id: String(staffId ?? "") }, select: { id: true, name: true, photoUrl: true } });
  if (!staff) throw new UserFacingError(NOT_FOUND);
  const name = doctorPhotoName(staff.photoUrl);
  if (!name) throw new UserFacingError("Staf ini belum punya foto unggahan.");

  await prisma.staff.update({ where: { id: staff.id }, data: { photoUrl: null } });
  await removeDoctorPhotoFile(name).catch(() => undefined);
  await recordAudit({ actor, action: "staff.photo.remove", entity: "Staff", entityId: staff.id, summary: staff.name });
  revalidatePublic();
}

/**
 * Isi foto untuk rute publik. Hanya foto milik staf AKTIF, `showOnWebsite`, berperan dokter/terapis yang `photoUrl`-nya sama
 * persis dengan nama ini; selain itu null. Jalur yang tidak terdaftar di basis data tidak pernah dibaca dari disk.
 */
export async function findPublicDoctorPhoto(name: string): Promise<Buffer | null> {
  const safe = doctorPhotoName(doctorPhotoUrl(String(name ?? "")));
  if (!safe) return null;
  const owner = await prisma.staff.findFirst({
    where: { photoUrl: doctorPhotoUrl(safe), isActive: true, showOnWebsite: true, role: { in: ["DOKTER", "TERAPIS"] } },
    select: { id: true },
  });
  if (!owner) return null;
  try {
    return await readDoctorPhotoFile(safe);
  } catch {
    return null;
  }
}
