// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(admin)/admin/pemberitahuan/route";
import { prisma } from "@/lib/db";
import { liveEventsFor } from "@/server/live-events";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER" | "TERAPIS";
const { actor, session } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
  session: { signedIn: true },
}));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => (session.signedIn ? actor : null)) }));

const SLUG = "pemberitahuan-uji";
const WA = "6281200009200";
const URL_BASE = "http://localhost/admin/pemberitahuan";

describe("peristiwa langsung", () => {
  let world: BillingWorld;
  let since: Date;
  const mine = <T extends { patientName: string }>(events: T[]) => events.filter((e) => e.patientName.includes(SLUG));

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    since = new Date(Date.now() - 60_000);
  });
  beforeEach(() => {
    actor.role = "APOTEKER";
    session.signedIn = true;
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("resep baru: Apoteker dan resepsionis menerima nama pasien dan id, tanpa isi catatan", async () => {
    const visit = await finalVisit(world, { pharmacyNote: "RAHASIA-CATATAN-DOKTER" });
    const dispensing = await seedDispensing(world, visit.appointmentId);
    for (const role of ["APOTEKER", "RESEPSIONIS", "SUPER_ADMIN"] as const) {
      const result = await liveEventsFor(role, since);
      expect(result.watching).toBe(true);
      const events = mine(result.events).filter((e) => e.kind === "RESEP_BARU");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ patientName: `Pasien ${SLUG}`, entityId: dispensing.id });
      expect(JSON.stringify(result)).not.toContain("RAHASIA-CATATAN-DOKTER");
    }
  });

  it("obat diserahkan dan tanpa obat: hanya untuk resepsionis, dengan penanda tanpa obat", async () => {
    const done = await seedDispensing(world, (await finalVisit(world, { pharmacyNote: "x" })).appointmentId, {
      status: "SELESAI",
      lines: [{ itemId: world.drugId, quantity: 1 }],
    });
    const none = await seedDispensing(world, (await finalVisit(world, { pharmacyNote: "x" })).appointmentId, { status: "TANPA_OBAT" });
    const events = mine((await liveEventsFor("RESEPSIONIS", since)).events).filter((e) => e.kind === "RESEP_SELESAI");
    expect(events.find((e) => e.entityId === done.id)?.detail).toBeUndefined();
    expect(events.find((e) => e.entityId === none.id)?.detail).toBe("TANPA_OBAT");
    expect(mine((await liveEventsFor("APOTEKER", since)).events).filter((e) => e.kind === "RESEP_SELESAI")).toEqual([]);
  });

  it("resep dokter tidak memicu Resep baru atau Resep selesai (spec resep dokter 6)", async () => {
    const visit = await finalVisit(world);
    const { id } = await seedDispensing(world, visit.appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 1 }] });
    await prisma.dispensing.update({ where: { id }, data: { source: "DOKTER" } });
    for (const role of ["APOTEKER", "RESEPSIONIS", "SUPER_ADMIN"] as const) {
      const events = mine((await liveEventsFor(role, since)).events);
      expect(events.filter((e) => e.entityId === id && (e.kind === "RESEP_BARU" || e.kind === "RESEP_SELESAI"))).toEqual([]);
    }
  });

  it("siap ditagih: catatan final tanpa resep, hanya untuk resepsionis", async () => {
    const visit = await finalVisit(world);
    const forReceptionist = mine((await liveEventsFor("RESEPSIONIS", since)).events).filter((e) => e.kind === "SIAP_DITAGIH");
    expect(forReceptionist.length).toBeGreaterThanOrEqual(1);
    expect(forReceptionist.some((e) => e.id.startsWith("SIAP_DITAGIH:"))).toBe(true);
    expect(mine((await liveEventsFor("APOTEKER", since)).events).filter((e) => e.kind === "SIAP_DITAGIH")).toEqual([]);
    // Kunjungan yang menunggu penyerahan Apoteker tidak dihitung sebagai "siap ditagih" biasa (Resep baru yang memberi tahu).
    const withNote = await finalVisit(world, { pharmacyNote: "Obat" });
    await seedDispensing(world, withNote.appointmentId);
    // Draf lama berisi catatan yang difinalkan sesudah resep dokter: tidak ada penyerahan, jadi langsung siap ditagih (spec resep dokter 3).
    const legacyNote = await finalVisit(world, { pharmacyNote: "Catatan lama" });
    const ids = mine((await liveEventsFor("RESEPSIONIS", since)).events).filter((e) => e.kind === "SIAP_DITAGIH").map((e) => e.entityId);
    expect(ids).not.toContain(withNote.encounterId);
    expect(ids).toContain(legacyNote.encounterId);
    expect(ids).toContain(visit.encounterId);
  });

  it("restock: Apoteker menerima permintaan baru; resepsionis menerima kiriman dan penolakan (spec stok meja 5)", async () => {
    const created = await prisma.restockRequest.create({
      data: { branchId: world.branchId, requestedById: "s1", requestedByName: `Rina ${SLUG}`, lines: { create: [{ itemId: world.drugId, itemName: "Obat", requestedQuantity: 4 }] } },
    });
    const forPharmacist = (await liveEventsFor("APOTEKER", since)).events.filter((e) => e.kind === "RESTOCK_BARU" && e.entityId === created.id);
    expect(forPharmacist).toEqual([expect.objectContaining({ patientName: `Rina ${SLUG}`, count: 1 })]);
    expect((await liveEventsFor("RESEPSIONIS", since)).events.some((e) => e.kind === "RESTOCK_BARU")).toBe(false);

    const done = await prisma.restockRequest.create({
      data: {
        branchId: world.branchId,
        requestedById: "s1",
        requestedByName: "Rina",
        status: "SELESAI",
        decidedAt: new Date(),
        decidedById: "a1",
        decidedByName: `Apoteker ${SLUG}`,
        lines: { create: [{ itemId: world.drugId, itemName: "Obat", requestedQuantity: 4, sentQuantity: 3 }, { itemId: world.productId, itemName: "Serum", requestedQuantity: 1, sentQuantity: 0 }] },
      },
    });
    const rejected = await prisma.restockRequest.create({
      data: { branchId: world.branchId, requestedById: "s1", requestedByName: "Rina", status: "DITOLAK", decidedAt: new Date(), decidedById: "a1", decidedByName: `Apoteker ${SLUG}`, rejectReason: "Stok kosong", lines: { create: [{ itemId: world.drugId, itemName: "Obat", requestedQuantity: 1 }] } },
    });
    const events = (await liveEventsFor("RESEPSIONIS", since)).events;
    expect(events.find((e) => e.kind === "RESTOCK_SELESAI" && e.entityId === done.id)).toMatchObject({ patientName: `Apoteker ${SLUG}`, count: 1 });
    expect(events.find((e) => e.kind === "RESTOCK_DITOLAK" && e.entityId === rejected.id)).toMatchObject({ reason: "Stok kosong" });
    expect((await liveEventsFor("APOTEKER", since)).events.some((e) => e.kind === "RESTOCK_SELESAI")).toBe(false);
  });

  it("kursor: hanya yang lebih baru dari 'sejak'; urut naik menurut waktu; serverTime ikut", async () => {
    const all = await liveEventsFor("RESEPSIONIS", since);
    const times = mine(all.events).map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Date(all.serverTime).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const future = await liveEventsFor("RESEPSIONIS", new Date(Date.now() + 60_000));
    expect(future.events).toEqual([]);
  });

  it("check-in klinik: hanya untuk perawat, dengan layanan dan jam WITA (spec peran perawat 9)", async () => {
    const checkedIn = async (code: string, hourUtc: number, channel: "KLINIK" | "ONLINE", checkedInAt: Date) => {
      const startAt = new Date(Date.UTC(2031, 0, 20, hourUtc, 0));
      return prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          channel,
          servicePrice: channel === "ONLINE" ? 250000 : null,
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60_000),
          status: "HADIR",
          checkedInAt,
          source: "WALK_IN",
          branchId: world.branchId,
          staffId: world.doctorId,
          serviceId: world.consultationId,
          patientId: world.patientId,
        },
        select: { id: true },
      });
    };
    const klinik = await checkedIn(`CHK-${SLUG}-1`, 2, "KLINIK", new Date());
    await checkedIn(`CHK-${SLUG}-2`, 4, "ONLINE", new Date());
    await checkedIn(`CHK-${SLUG}-3`, 6, "KLINIK", new Date(Date.now() - 2 * 60 * 60_000));

    const nurse = mine((await liveEventsFor("TERAPIS", since)).events);
    expect(nurse).toHaveLength(1);
    expect(nurse[0]).toMatchObject({ kind: "PASIEN_CHECKIN", entityId: klinik.id, startLabel: "10.00" });
    expect(nurse[0].serviceName).toBeTruthy();
    for (const role of ["RESEPSIONIS", "SUPER_ADMIN", "DOKTER"] as const) {
      expect((await liveEventsFor(role, since)).events.some((e) => e.kind === "PASIEN_CHECKIN")).toBe(false);
    }
  });

  it("Dokter dan Admin Keuangan tidak diawasi: kosong dan watching false", async () => {
    for (const role of ["DOKTER", "ADMIN_KEUANGAN"] as const) {
      const result = await liveEventsFor(role, since);
      expect(result).toMatchObject({ watching: false, events: [] });
    }
  });

  it("rute: 401 bila belum masuk, 400 untuk 'sejak' tidak sah, 200 dengan tanpa-cache untuk yang berhak", async () => {
    session.signedIn = false;
    expect((await GET(new Request(`${URL_BASE}?sejak=${since.toISOString()}`))).status).toBe(401);
    session.signedIn = true;
    expect((await GET(new Request(URL_BASE))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?sejak=bukan-tanggal`))).status).toBe(400);

    const ok = await GET(new Request(`${URL_BASE}?sejak=${encodeURIComponent(since.toISOString())}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = await ok.json();
    expect(body.watching).toBe(true);
    expect(mine(body.events).length).toBeGreaterThan(0);

    actor.role = "DOKTER";
    const doctor = await (await GET(new Request(`${URL_BASE}?sejak=${encodeURIComponent(since.toISOString())}`))).json();
    expect(doctor).toMatchObject({ watching: false, events: [] });
  });

  it("'sejak' yang terlalu lama dibatasi 10 menit ke belakang", async () => {
    const old = new Date(Date.now() - 3 * 3600_000);
    const result = await liveEventsFor("RESEPSIONIS", old);
    for (const event of result.events) expect(new Date(event.at).getTime()).toBeGreaterThan(Date.now() - 11 * 60_000);
  });
});
