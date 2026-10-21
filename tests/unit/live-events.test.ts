import { describe, expect, it } from "vitest";
import { eventHref, eventMessage, freshEvents, LIVE_OVERLAP_MS, nextSince, watchedKinds, type LiveEvent } from "@/lib/live-events";

const event = (patch: Partial<LiveEvent> = {}): LiveEvent => ({
  id: "RESEP_BARU:d1:1000",
  kind: "RESEP_BARU",
  patientName: "Ani Pratiwi",
  at: "2026-10-08T02:00:00.000Z",
  entityId: "d1",
  ...patch,
});

describe("peristiwa yang diawasi per peran", () => {
  it("Apoteker resep baru dan permintaan restock; resepsionis resep, siap ditagih, dan hasil restock; Super Admin semuanya", () => {
    expect(watchedKinds("APOTEKER")).toEqual(["RESEP_BARU", "RESTOCK_BARU"]);
    expect(watchedKinds("RESEPSIONIS")).toEqual(["RESEP_BARU", "RESEP_SELESAI", "SIAP_DITAGIH", "RESTOCK_SELESAI", "RESTOCK_DITOLAK"]);
    expect(watchedKinds("SUPER_ADMIN")).toEqual(["RESEP_BARU", "RESEP_SELESAI", "SIAP_DITAGIH", "RESTOCK_BARU", "RESTOCK_SELESAI", "RESTOCK_DITOLAK"]);
  });

  it("Dokter dan Admin Keuangan tidak mengawasi apa pun", () => {
    for (const role of ["DOKTER", "ADMIN_KEUANGAN"] as const) expect(watchedKinds(role)).toEqual([]);
  });

  it("Perawat mengawasi check-in; Super Admin dan resepsionis tidak (spec peran perawat 9)", () => {
    expect(watchedKinds("TERAPIS")).toEqual(["PASIEN_CHECKIN"]);
    expect(watchedKinds("SUPER_ADMIN")).not.toContain("PASIEN_CHECKIN");
    expect(watchedKinds("RESEPSIONIS")).not.toContain("PASIEN_CHECKIN");
  });
});

describe("pesan dan tautan", () => {
  it("pesan dan tujuan check-in (spec peran perawat 9)", () => {
    const e = event({ id: "PASIEN_CHECKIN:a1:1", kind: "PASIEN_CHECKIN", patientName: "Mario Sului", entityId: "a1", serviceName: "Konsultasi gizi", startLabel: "11.00" });
    expect(eventMessage(e, "TERAPIS")).toEqual({ title: "Pasien check-in: Mario Sului", description: "Konsultasi gizi · 11.00" });
    expect(eventHref(e, "TERAPIS")).toBe("/admin/perawat/a1");
  });

  it("teks dan tujuan peristiwa restock (spec stok meja 5)", () => {
    const baru = event({ id: "RESTOCK_BARU:r1:1", kind: "RESTOCK_BARU", patientName: "Rina", entityId: "r1", count: 3 });
    expect(eventMessage(baru, "APOTEKER")).toEqual({ title: "Permintaan restock dari Rina: 3 barang", description: "Kirim stok dari gudang ke meja." });
    expect(eventHref(baru, "APOTEKER")).toBe("/admin/stok/permintaan/r1");
    const selesai = event({ kind: "RESTOCK_SELESAI", patientName: "Apoteker Uji", entityId: "r1", count: 2 });
    expect(eventMessage(selesai, "RESEPSIONIS")).toEqual({ title: "Restock dikirim: 2 barang", description: "Dikirim oleh Apoteker Uji." });
    expect(eventHref(selesai, "RESEPSIONIS")).toBe("/admin/stok-meja");
    const ditolak = event({ kind: "RESTOCK_DITOLAK", patientName: "Apoteker Uji", entityId: "r1", reason: "Stok kosong" });
    expect(eventMessage(ditolak, "RESEPSIONIS")).toEqual({ title: "Permintaan restock ditolak: Stok kosong", description: "Ditolak oleh Apoteker Uji." });
  });

  it("resep baru: Apoteker diminta menyiapkan obat; resepsionis diberi tahu tagihan tertahan", () => {
    expect(eventMessage(event(), "APOTEKER")).toEqual({ title: "Resep baru: Ani Pratiwi", description: "Obat perlu disiapkan." });
    expect(eventMessage(event(), "RESEPSIONIS")).toEqual({ title: "Resep baru: Ani Pratiwi", description: "Tagihan tertahan sampai obat diserahkan." });
  });

  it("obat diserahkan, tanpa obat, dan siap ditagih", () => {
    expect(eventMessage(event({ kind: "RESEP_SELESAI" }), "RESEPSIONIS")).toEqual({
      title: "Obat sudah diserahkan: Ani Pratiwi",
      description: "Tagihan bisa difinalkan dan dibayar.",
    });
    expect(eventMessage(event({ kind: "RESEP_SELESAI", detail: "TANPA_OBAT" }), "RESEPSIONIS")).toEqual({
      title: "Tanpa obat: Ani Pratiwi",
      description: "Tagihan bisa difinalkan.",
    });
    expect(eventMessage(event({ kind: "SIAP_DITAGIH" }), "RESEPSIONIS")).toEqual({
      title: "Siap ditagih: Ani Pratiwi",
      description: "Catatan dokter sudah final.",
    });
  });

  it("tautan: Apoteker ke rincian resep; resepsionis ke daftar tagihan; Super Admin ke rincian resep", () => {
    expect(eventHref(event(), "APOTEKER")).toBe("/admin/resep/d1");
    expect(eventHref(event(), "RESEPSIONIS")).toBe("/admin/tagihan");
    expect(eventHref(event(), "SUPER_ADMIN")).toBe("/admin/resep/d1");
    expect(eventHref(event({ kind: "SIAP_DITAGIH" }), "SUPER_ADMIN")).toBe("/admin/tagihan");
    expect(eventHref(event({ kind: "RESEP_SELESAI" }), "RESEPSIONIS")).toBe("/admin/tagihan");
  });
});

describe("duplikat dan kursor", () => {
  it("peristiwa yang sudah terlihat tidak muncul lagi; urutan dipertahankan", () => {
    const seen = new Set<string>();
    const a = event({ id: "a" });
    const b = event({ id: "b" });
    expect(freshEvents(seen, [a, b]).map((e) => e.id)).toEqual(["a", "b"]);
    expect(freshEvents(seen, [a, b])).toEqual([]);
    expect(freshEvents(seen, [b, event({ id: "c" })]).map((e) => e.id)).toEqual(["c"]);
    expect(freshEvents(seen, [event({ id: "d" }), event({ id: "d" })]).map((e) => e.id)).toEqual(["d"]);
  });

  it("kursor berikutnya mundur sebesar jendela tumpang tindih dari waktu server", () => {
    expect(LIVE_OVERLAP_MS).toBe(30_000);
    expect(nextSince("2026-10-08T02:00:30.000Z")).toBe("2026-10-08T02:00:00.000Z");
  });
});
