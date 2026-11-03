"use client";

import { siteServicePhotoPreviewUrl } from "@/lib/service-catalog";
import { removeSiteServicePhoto } from "@/server/site-service-admin";
import { PhotoUploadField } from "../photo-upload-field";

/** Foto layanan situs (spec layanan situs 5.3). */
export function SiteServicePhotoField({
  siteServiceId,
  imageUrl,
  visibleOnSite,
  onChange,
}: {
  siteServiceId: string;
  imageUrl: string | null;
  visibleOnSite: boolean;
  onChange: (imageUrl: string | null) => void;
}) {
  return (
    <PhotoUploadField
      endpoint="/admin/layanan/foto"
      fields={{ siteServiceId }}
      previewUrl={siteServicePhotoPreviewUrl(imageUrl)}
      inputLabel="Berkas foto layanan"
      emptyText="Belum ada foto unggahan. Situs memakai foto kategori."
      savedText={visibleOnSite ? "Foto diganti dan sudah tampil di situs." : "Foto disimpan. Foto tampil setelah layanan ini aktif di situs."}
      removedText="Foto dihapus. Situs memakai foto kategori."
      onRemove={() => removeSiteServicePhoto(siteServiceId)}
      onChange={onChange}
    />
  );
}
