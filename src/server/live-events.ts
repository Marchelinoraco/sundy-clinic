import { prisma } from "@/lib/db";
import type { can } from "@/lib/permissions";
import { watchedKinds, type LiveEvent } from "@/lib/live-events";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";

// Tanpa "use server": dipanggil rute pemberitahuan, bukan browser. Hanya nama pasien yang dibawa; isi Catatan
// untuk Apoteker dan data klinis tidak pernah ikut.

type Role = Parameters<typeof can>[0];

const MAX_LOOKBACK_MS = 10 * 60_000;
const LIMIT = 20;

/**
 * Peristiwa sejak `since` (eksklusif) sampai `now`, untuk peran ini (spec pemberitahuan): resep baru
 * (penyerahan dibuat), obat diserahkan atau tanpa obat (penyerahan selesai), siap ditagih (catatan final tanpa resep), restock meja (permintaan dibuat, dikirim, ditolak),
 * dan pasien check-in untuk perawat.
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
      // Resep dokter dibuat langsung Selesai dan tidak perlu Apoteker (spec resep dokter 6).
      where: { createdAt: range, source: "APOTEKER" },
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
      where: { completedAt: range, status: { in: ["SELESAI", "TANPA_OBAT"] }, source: "APOTEKER" },
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
      // Kunjungan yang menunggu penyerahan Apoteker diberitahukan lewat Resep baru/selesai; sisanya (termasuk resep dokter
      // dan draf lama berisi Catatan untuk Apoteker yang difinalkan sesudah resep dokter) langsung siap ditagih.
      where: { status: "FINAL", finalizedAt: range, NOT: { appointment: { dispensing: { is: { source: "APOTEKER" } } } } },
      orderBy: { finalizedAt: "asc" },
      take: LIMIT,
      select: { id: true, finalizedAt: true, appointment: { select: { patient: { select: { name: true } } } } },
    });
    for (const row of rows) {
      const at = row.finalizedAt as Date;
      events.push({ id: `SIAP_DITAGIH:${row.id}:${at.getTime()}`, kind: "SIAP_DITAGIH", patientName: nameOf(row.appointment.patient), at: at.toISOString(), entityId: row.id });
    }
  }

  if (kinds.includes("RESTOCK_BARU")) {
    const rows = await prisma.restockRequest.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: "asc" },
      take: LIMIT,
      select: { id: true, createdAt: true, requestedByName: true, _count: { select: { lines: true } } },
    });
    for (const row of rows) {
      events.push({ id: `RESTOCK_BARU:${row.id}:${row.createdAt.getTime()}`, kind: "RESTOCK_BARU", patientName: row.requestedByName, at: row.createdAt.toISOString(), entityId: row.id, count: row._count.lines });
    }
  }
  if (kinds.includes("RESTOCK_SELESAI")) {
    const rows = await prisma.restockRequest.findMany({
      where: { decidedAt: range, status: { in: ["SELESAI", "DITOLAK"] } },
      orderBy: { decidedAt: "asc" },
      take: LIMIT,
      select: { id: true, status: true, decidedAt: true, decidedByName: true, rejectReason: true, lines: { select: { sentQuantity: true } } },
    });
    for (const row of rows) {
      const at = row.decidedAt as Date;
      const kind = row.status === "SELESAI" ? ("RESTOCK_SELESAI" as const) : ("RESTOCK_DITOLAK" as const);
      events.push({
        id: `${kind}:${row.id}:${at.getTime()}`,
        kind,
        patientName: row.decidedByName ?? "-",
        at: at.toISOString(),
        entityId: row.id,
        ...(kind === "RESTOCK_SELESAI" ? { count: row.lines.filter((line) => (line.sentQuantity ?? 0) > 0).length } : { reason: row.rejectReason ?? "" }),
      });
    }
  }

  if (kinds.includes("PASIEN_CHECKIN")) {
    // Pasien klinik yang baru check-in, untuk perawat (spec peran perawat 9). Konsultasi online tidak check-in di klinik.
    const rows = await prisma.appointment.findMany({
      where: { checkedInAt: range, channel: "KLINIK" },
      orderBy: { checkedInAt: "asc" },
      take: LIMIT,
      select: { id: true, type: true, checkedInAt: true, startAt: true, service: { select: { name: true } }, patient: { select: { name: true } } },
    });
    for (const row of rows) {
      const at = row.checkedInAt as Date;
      events.push({
        id: `PASIEN_CHECKIN:${row.id}:${at.getTime()}`,
        kind: "PASIEN_CHECKIN",
        patientName: nameOf(row.patient),
        at: at.toISOString(),
        entityId: row.id,
        serviceName: row.service?.name ?? (row.type === "KONSULTASI" ? "Konsultasi" : "Treatment"),
        startLabel: minutesToTimeLabel(witaMinutesOfDay(row.startAt)),
      });
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  return { watching: true, serverTime, events };
}
