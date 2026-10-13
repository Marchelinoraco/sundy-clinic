import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { siteServicePhotoName, siteServicePhotoUrl } from "@/lib/service-catalog";
import { recordAudit } from "@/server/audit";
import { revalidateSitePages } from "@/server/catalog-revalidate";
import { processPublicPhoto, readPublicPhoto, removePublicPhoto, writePublicPhoto } from "@/server/public-photo";
import type { CurrentStaff } from "@/server/session";

/**
 * Foto layanan situs (spec layanan situs 5.3). Sengaja BUKAN berkas "use server": `uploadSiteServicePhoto` menerima byte. Pintu
 * masuknya rute `POST /admin/layanan/foto` dan aksi `removeSiteServicePhoto`, keduanya memeriksa hak `catalog:manage`.
 */
const NOT_FOUND = "Layanan situs tidak ditemukan.";

export async function uploadSiteServicePhoto(input: { actor: CurrentStaff; siteServiceId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }> {
  const row = await prisma.siteService.findUnique({
    where: { id: String(input.siteServiceId ?? "") },
    select: { id: true, name: true, slug: true, imageUrl: true },
  });
  if (!row) throw new UserFacingError(NOT_FOUND);

  const processed = await processPublicPhoto(input.bytes);
  const name = await writePublicPhoto("layanan", row.id, processed);
  const photoUrl = siteServicePhotoUrl(name);
  const oldName = siteServicePhotoName(row.imageUrl);

  try {
    await prisma.siteService.update({ where: { id: row.id }, data: { imageUrl: photoUrl } });
  } catch (error) {
    // Foto yang sama (nama sama dengan yang lama) berarti berkasnya masih dipakai: jangan dihapus.
    if (name !== oldName) await removePublicPhoto("layanan", name).catch(() => undefined);
    throw error;
  }
  if (oldName && oldName !== name) await removePublicPhoto("layanan", oldName).catch(() => undefined);

  // Foto sudah terpasang: kegagalan menulis audit tidak boleh membuat unggahan dianggap gagal.
  await recordAudit({ actor: input.actor, action: "site_service.photo", entity: "SiteService", entityId: row.id, summary: `${row.name}: foto diganti` }).catch((error) =>
    console.error("Gagal mencatat audit foto layanan situs", row.id, error),
  );
  revalidateSitePages([row.slug]);
  return { photoUrl };
}

export async function removeSiteServicePhotoFor(actor: CurrentStaff, id: string): Promise<void> {
  const row = await prisma.siteService.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true, slug: true, imageUrl: true } });
  if (!row) throw new UserFacingError(NOT_FOUND);
  const name = siteServicePhotoName(row.imageUrl);
  if (!name) throw new UserFacingError("Layanan situs ini belum punya foto unggahan.");

  await prisma.siteService.update({ where: { id: row.id }, data: { imageUrl: null } });
  await removePublicPhoto("layanan", name).catch(() => undefined);
  await recordAudit({ actor, action: "site_service.photo", entity: "SiteService", entityId: row.id, summary: `${row.name}: foto dihapus` });
  revalidateSitePages([row.slug]);
}

/**
 * Isi foto untuk rute publik: hanya foto milik layanan situs AKTIF yang layanan internalnya juga aktif, dan `imageUrl`-nya sama
 * persis dengan nama ini; selain itu null. Jalur yang tidak terdaftar di basis data tidak pernah dibaca dari disk.
 */
export async function findPublicSiteServicePhoto(name: string): Promise<Buffer | null> {
  const safe = siteServicePhotoName(siteServicePhotoUrl(String(name ?? "")));
  if (!safe) return null;
  const owner = await prisma.siteService.findFirst({
    where: { imageUrl: siteServicePhotoUrl(safe), isActive: true, service: { isActive: true } },
    select: { id: true },
  });
  if (!owner) return null;
  try {
    return await readPublicPhoto("layanan", safe);
  } catch {
    return null;
  }
}
