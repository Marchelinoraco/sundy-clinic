import { photoDir, processPublicPhoto, readPublicPhoto, removePublicPhoto, writePublicPhoto, type ProcessedPhoto } from "@/server/public-photo";

/** Foto dokter di halaman publik (spec profil dokter 4): pembungkus penyimpanan foto publik bersama, folder "dokter". */
export type { ProcessedPhoto };

export const processDoctorPhoto = processPublicPhoto;

export function doctorPhotoDir(): string {
  return photoDir("dokter");
}

export function writeDoctorPhoto(staffId: string, photo: ProcessedPhoto): Promise<string> {
  return writePublicPhoto("dokter", staffId, photo);
}

export function readDoctorPhotoFile(name: string): Promise<Buffer> {
  return readPublicPhoto("dokter", name);
}

export function removeDoctorPhotoFile(name: string): Promise<void> {
  return removePublicPhoto("dokter", name);
}
