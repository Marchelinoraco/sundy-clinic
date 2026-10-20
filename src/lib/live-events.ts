import { can } from "./permissions";

// Aturan murni pemberitahuan langsung (resep, siap ditagih, restock meja, check-in untuk perawat). Dipakai server dan browser.

type Role = Parameters<typeof can>[0];

/** Jeda antar pemeriksaan di layar admin yang terbuka. */
export const LIVE_POLL_MS = 10_000;
/** Server tidak melihat lebih jauh dari ini ke belakang; tab yang tersembunyi lebih lama memuat ulang layarnya saat kembali. */
export const LIVE_MAX_LOOKBACK_MS = 10 * 60_000;
/** Kursor berikutnya mundur sebesar ini; peristiwa yang terlihat dua kali dibuang lewat id. */
export const LIVE_OVERLAP_MS = 30_000;

export type LiveEventKind = "RESEP_BARU" | "RESEP_SELESAI" | "SIAP_DITAGIH" | "RESTOCK_BARU" | "RESTOCK_SELESAI" | "RESTOCK_DITOLAK" | "PASIEN_CHECKIN";

export type LiveEvent = {
  /** Unik per peristiwa: jenis, entitas, dan waktu. */
  id: string;
  kind: LiveEventKind;
  /** Nama pasien; untuk restock, nama staf peminta atau pemutus. */
  patientName: string;
  /** Waktu peristiwa (ISO). */
  at: string;
  /** id penyerahan, kunjungan, atau permintaan restock. */
  entityId: string;
  /** Hanya untuk RESEP_SELESAI: penyerahan ditandai tanpa obat. */
  detail?: "TANPA_OBAT";
  /** Restock: jumlah barang. */
  count?: number;
  /** RESTOCK_DITOLAK: alasan Apoteker. */
  reason?: string;
  /** PASIEN_CHECKIN: layanan booking dan jam mulainya ("11.00"). */
  serviceName?: string;
  startLabel?: string;
};

/** Jenis peristiwa yang boleh diterima peran ini (spec pemberitahuan): Apoteker resep baru; resepsionis semuanya. */
export function watchedKinds(role: Role): LiveEventKind[] {
  const kinds: LiveEventKind[] = [];
  if (can(role, "dispense:read") || can(role, "invoice:manage")) kinds.push("RESEP_BARU");
  if (can(role, "invoice:manage")) kinds.push("RESEP_SELESAI", "SIAP_DITAGIH");
  if (can(role, "stock:manage")) kinds.push("RESTOCK_BARU");
  if (can(role, "restock:request")) kinds.push("RESTOCK_SELESAI", "RESTOCK_DITOLAK");
  if (can(role, "checkin:notify")) kinds.push("PASIEN_CHECKIN");
  return kinds;
}

export function eventMessage(event: LiveEvent, role: Role): { title: string; description: string } {
  switch (event.kind) {
    case "RESEP_BARU":
      return {
        title: `Resep baru: ${event.patientName}`,
        description: can(role, "dispense:read") ? "Obat perlu disiapkan." : "Tagihan tertahan sampai obat diserahkan.",
      };
    case "RESEP_SELESAI":
      return event.detail === "TANPA_OBAT"
        ? { title: `Tanpa obat: ${event.patientName}`, description: "Tagihan bisa difinalkan." }
        : { title: `Obat sudah diserahkan: ${event.patientName}`, description: "Tagihan bisa difinalkan dan dibayar." };
    case "SIAP_DITAGIH":
      return { title: `Siap ditagih: ${event.patientName}`, description: "Catatan dokter sudah final." };
    case "RESTOCK_BARU":
      return { title: `Permintaan restock dari ${event.patientName}: ${event.count ?? 0} barang`, description: "Kirim stok dari gudang ke meja." };
    case "RESTOCK_SELESAI":
      return { title: `Restock dikirim: ${event.count ?? 0} barang`, description: `Dikirim oleh ${event.patientName}.` };
    case "RESTOCK_DITOLAK":
      return { title: `Permintaan restock ditolak: ${event.reason ?? ""}`, description: `Ditolak oleh ${event.patientName}.` };
    case "PASIEN_CHECKIN":
      return { title: `Pasien check-in: ${event.patientName}`, description: [event.serviceName, event.startLabel].filter(Boolean).join(" · ") };
  }
}

/** Layar tujuan tombol "Buka": perawat ke halaman Tangani, Apoteker ke rincian resep, selebihnya ke daftar tagihan. */
export function eventHref(event: LiveEvent, role: Role): string {
  if (event.kind === "PASIEN_CHECKIN") return `/admin/perawat/${event.entityId}`;
  if (event.kind === "RESTOCK_BARU") return `/admin/stok/permintaan/${event.entityId}`;
  if (event.kind === "RESTOCK_SELESAI" || event.kind === "RESTOCK_DITOLAK") return "/admin/stok-meja";
  if (event.kind === "RESEP_BARU" && can(role, "dispense:read")) return `/admin/resep/${event.entityId}`;
  return "/admin/tagihan";
}

/** Peristiwa yang belum pernah terlihat; id-nya langsung dicatat ke `seen`. Urutan masuk dipertahankan. */
export function freshEvents(seen: Set<string>, incoming: LiveEvent[]): LiveEvent[] {
  const fresh: LiveEvent[] = [];
  for (const event of incoming) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    fresh.push(event);
  }
  return fresh;
}

/** Kursor pemeriksaan berikutnya dari waktu server. */
export function nextSince(serverTime: string): string {
  return new Date(new Date(serverTime).getTime() - LIVE_OVERLAP_MS).toISOString();
}
