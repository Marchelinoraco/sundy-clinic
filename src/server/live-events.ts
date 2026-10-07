import { prisma } from "@/lib/db";
import type { can } from "@/lib/permissions";
import { watchedKinds, type LiveEvent } from "@/lib/live-events";

// Tanpa "use server": dipanggil rute pemberitahuan, bukan browser. Hanya nama pasien yang dibawa; isi Catatan
// untuk Apoteker dan data klinis tidak pernah ikut.

type Role = Parameters<typeof can>[0];

const MAX_LOOKBACK_MS = 10 * 60_000;
const LIMIT = 20;

/**
 * Peristiwa sejak `since` (eksklusif) sampai `now`, untuk peran ini (spec pemberitahuan): resep baru
 * (penyerahan dibuat), obat diserahkan atau tanpa obat (penyerahan selesai), dan siap ditagih (catatan final tanpa resep).
 * `since` yang terlalu lama dibatasi 10 menit. Dihitung dari data yang sudah ada, tanpa tabel baru.
 */
export async function liveEventsFor(role: Role, since: Date, now: Date = new Date()): Promise<{ watching: boolean; serverTime: string; events: LiveEvent[] }> {
  const kinds = watchedKinds(role);
  const serverTime = now.toISOString();
  if (kinds.length === 0) return { watching: false, serverTime, events: [] };

  const floor = new Date(now.getTime() - MAX_LOOKBACK_MS);
  const from = since < floor ? floor : since;
  const range = { gt: from, lte: now };
  const events: LiveEvent[] = [];
  const nameOf = (patient: { name: string } | null) => patient?.name ?? "-";

  if (kinds.includes("RESEP_BARU")) {
    const rows = await prisma.dispensing.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: "asc" },
      take: LIMIT,
      select: { id: true, createdAt: true, appointment: { select: { patient: { select: { name: true } } } } },
    });
    for (const row of rows) {
      events.push({ id: `RESEP_BARU:${row.id}:${row.createdAt.getTime()}`, kind: "RESEP_BARU", patientName: nameOf(row.appointment.patient), at: row.createdAt.toISOString(), entityId: row.id });
    }
  }
  if (kinds.includes("RESEP_SELESAI")) {
    const rows = await prisma.dispensing.findMany({
      where: { completedAt: range, status: { in: ["SELESAI", "TANPA_OBAT"] } },
      orderBy: { completedAt: "asc" },
      take: LIMIT,
      select: { id: true, status: true, completedAt: true, appointment: { select: { patient: { select: { name: true } } } } },
    });
    for (const row of rows) {
      const at = row.completedAt as Date;
      events.push({
        id: `RESEP_SELESAI:${row.id}:${at.getTime()}`,
        kind: "RESEP_SELESAI",
        patientName: nameOf(row.appointment.patient),
        at: at.toISOString(),
        entityId: row.id,
        ...(row.status === "TANPA_OBAT" ? { detail: "TANPA_OBAT" as const } : {}),
      });
    }
  }
  if (kinds.includes("SIAP_DITAGIH")) {
    const rows = await prisma.encounter.findMany({
      where: { status: "FINAL", pharmacyNote: null, finalizedAt: range },
      orderBy: { finalizedAt: "asc" },
      take: LIMIT,
      select: { id: true, finalizedAt: true, appointment: { select: { patient: { select: { name: true } } } } },
    });
    for (const row of rows) {
      const at = row.finalizedAt as Date;
      events.push({ id: `SIAP_DITAGIH:${row.id}:${at.getTime()}`, kind: "SIAP_DITAGIH", patientName: nameOf(row.appointment.patient), at: at.toISOString(), entityId: row.id });
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  return { watching: true, serverTime, events };
}
