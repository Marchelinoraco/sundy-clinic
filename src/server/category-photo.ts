import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { categoryPhotoName, categoryPhotoUrl } from "@/lib/service-category";
import { recordAudit } from "@/server/audit";
import { revalidateSitePages } from "@/server/catalog-revalidate";
import { processPublicPhoto, readPublicPhoto, removePublicPhoto, writePublicPhoto } from "@/server/public-photo";
import type { CurrentStaff } from "@/server/session";

/**
 * Foto kategori layanan (spec kategori layanan KL9). Sengaja BUKAN berkas "use server": `uploadCategoryPhoto` menerima byte.
 * Pintu masuknya rute `POST /admin/layanan/foto-kategori` dan aksi `removeServiceCategoryPhoto`, keduanya memeriksa `catalog:manage`.
 */
const NOT_FOUND = "Kategori tidak ditemukan.";

async function revalidateCategoryPages(categoryId: string): Promise<void> {
  const linked = await prisma.siteService.findMany({ where: { categoryId }, select: { slug: true } });
  revalidateSitePages(linked.map((row) => row.slug));
}

export async function uploadCategoryPhoto(input: { actor: CurrentStaff; categoryId: string; bytes: Uint8Array }): Promise<{ photoUrl: string }> {
  const row = await prisma.serviceCategory.findUnique({ where: { id: String(input.categoryId ?? "") }, select: { id: true, name: true, imageUrl: true } });
  if (!row) throw new UserFacingError(NOT_FOUND);

  const processed = await processPublicPhoto(input.bytes);
  const name = await writePublicPhoto("kategori", row.id, processed);
  const photoUrl = categoryPhotoUrl(name);
  const oldName = categoryPhotoName(row.imageUrl);

  try {
    await prisma.serviceCategory.update({ where: { id: row.id }, data: { imageUrl: photoUrl } });
  } catch (error) {
    // Foto yang sama (nama sama dengan yang lama) berarti berkasnya masih dipakai: jangan dihapus.
    if (name !== oldName) await removePublicPhoto("kategori", name).catch(() => undefined);
    throw error;
  }
  if (oldName && oldName !== name) await removePublicPhoto("kategori", oldName).catch(() => undefined);

  // Foto sudah terpasang: kegagalan menulis audit tidak boleh membuat unggahan dianggap gagal.
  await recordAudit({ actor: input.actor, action: "service_category.photo", entity: "ServiceCategory", entityId: row.id, summary: `${row.name}: foto diganti` }).catch(
    (error) => console.error("Gagal mencatat audit foto kategori", row.id, error),
  );
  await revalidateCategoryPages(row.id);
  return { photoUrl };
}

export async function removeCategoryPhotoFor(actor: CurrentStaff, id: string): Promise<void> {
  const row = await prisma.serviceCategory.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true, imageUrl: true } });
  if (!row) throw new UserFacingError(NOT_FOUND);
  const name = categoryPhotoName(row.imageUrl);
  if (!name) throw new UserFacingError("Kategori ini belum punya foto unggahan.");

  await prisma.serviceCategory.update({ where: { id: row.id }, data: { imageUrl: null } });
  await removePublicPhoto("kategori", name).catch(() => undefined);
  await recordAudit({ actor, action: "service_category.photo", entity: "ServiceCategory", entityId: row.id, summary: `${row.name}: foto dihapus` });
  await revalidateCategoryPages(row.id);
}

/** Membuang berkas foto kategori yang sudah dihapus dari basis data; kegagalan diabaikan. */
export async function discardCategoryPhoto(imageUrl: string | null): Promise<void> {
  const name = categoryPhotoName(imageUrl);
  if (name) await removePublicPhoto("kategori", name).catch(() => undefined);
}

/**
 * Isi foto untuk rute publik: hanya foto yang tercatat sebagai `imageUrl` sebuah kategori; selain itu null. Kategori tidak punya
 * status aktif, jadi panel juga memakai rute ini untuk pratinjau. Jalur yang tidak terdaftar tidak pernah dibaca dari disk.
 */
export async function findPublicCategoryPhoto(name: string): Promise<Buffer | null> {
  const safe = categoryPhotoName(categoryPhotoUrl(String(name ?? "")));
  if (!safe) return null;
  const owner = await prisma.serviceCategory.findFirst({ where: { imageUrl: categoryPhotoUrl(safe) }, select: { id: true } });
  if (!owner) return null;
  try {
    return await readPublicPhoto("kategori", safe);
  } catch {
    return null;
  }
}
