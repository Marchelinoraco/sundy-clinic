import { can } from "./permissions";

// Aturan murni pemberitahuan langsung (resep baru, obat diserahkan, siap ditagih). Dipakai server dan browser.

type Role = Parameters<typeof can>[0];

/** Jeda antar pemeriksaan di layar admin yang terbuka. */
export const LIVE_POLL_MS = 10_000;
/** Kursor berikutnya mundur sebesar ini; peristiwa yang terlihat dua kali dibuang lewat id. */
export const LIVE_OVERLAP_MS = 30_000;

export type LiveEventKind = "RESEP_BARU" | "RESEP_SELESAI" | "SIAP_DITAGIH";

export type LiveEvent = {
  /** Unik per peristiwa: jenis, entitas, dan waktu. */
  id: string;
  kind: LiveEventKind;
  patientName: string;
  /** Waktu peristiwa (ISO). */
  at: string;
  /** id penyerahan (resep) atau kunjungan (siap ditagih). */
  entityId: string;
  /** Hanya untuk RESEP_SELESAI: penyerahan ditandai tanpa obat. */
  detail?: "TANPA_OBAT";
};

/** Jenis peristiwa yang boleh diterima peran ini (spec pemberitahuan): Apoteker resep baru; resepsionis semuanya. */
export function watchedKinds(role: Role): LiveEventKind[] {
  const kinds: LiveEventKind[] = [];
  if (can(role, "dispense:read") || can(role, "invoice:manage")) kinds.push("RESEP_BARU");
  if (can(role, "invoice:manage")) kinds.push("RESEP_SELESAI", "SIAP_DITAGIH");
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
  }
}

/** Layar tujuan tombol "Buka": Apoteker ke rincian resep, selebihnya ke daftar tagihan. */
export function eventHref(event: LiveEvent, role: Role): string {
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
