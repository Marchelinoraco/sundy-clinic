import { postPhoto, type PhotoResult } from "../photo-upload";

export type { PhotoResult };

/** Satu foto per permintaan ke rute unggah panel (spec profil dokter 6). */
export function sendStaffPhoto(staffId: string, file: File): Promise<PhotoResult> {
  return postPhoto("/admin/staf/foto", { staffId }, file);
}
