import { describe, expect, it } from "vitest";
import {
  appendToSubjective,
  FOOD_RECALL_AUTHOR_LABEL,
  FOOD_RECALL_RECEIVED,
  foodRecallHeader,
  foodRecallView,
  foodRecallLinkState,
  foodRecallMessageText,
  foodRecallRows,
  foodRecallSubjectiveText,
  parseStoredEntries,
  recallDateFor,
  recallDateLabel,
  recallDateShortLabel,
  shouldOfferFoodRecall,
  validateCustomerEntries,
  validateStaffEntries,
  type FoodRecallEntry,
} from "@/lib/food-recall";
import { combineWitaDateAndMinutes } from "@/lib/time";

const ENTRIES: FoodRecallEntry[] = [
  { hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M", by: "CUSTOMER" },
  { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning 1 piring, teh manis", by: "CUSTOMER" },
  { hour: 7, kind: "OLAHRAGA", text: "Jalan pagi 20 menit", by: "DOKTER" },
];

describe("tanggal H-1", () => {
  it("sehari sebelum tanggal booking dalam WITA, termasuk awal bulan dan tahun", () => {
    expect(recallDateFor(combineWitaDateAndMinutes("2026-10-03", 11 * 60))).toBe("2026-10-02");
    expect(recallDateFor(combineWitaDateAndMinutes("2026-10-01", 6 * 60))).toBe("2026-09-30");
    expect(recallDateFor(combineWitaDateAndMinutes("2027-01-01", 0))).toBe("2026-12-31");
  });

  it("label panjang dan pendek berbahasa Indonesia", () => {
    expect(recallDateLabel("2026-10-02")).toBe("Jumat, 2 Oktober");
    expect(recallDateShortLabel("2026-10-02")).toBe("Jumat, 2 Okt");
  });
});

describe("validasi baris", () => {
  it("kiriman customer: minimal 1, paling banyak 40, semua ditandai CUSTOMER", () => {
    expect(validateCustomerEntries([])).toEqual({ ok: false, message: "Tambahkan minimal satu catatan." });
    const many = Array.from({ length: 41 }, () => ({ hour: 8, kind: "MAKAN_MINUM", text: "Roti" }));
    expect(validateCustomerEntries(many)).toEqual({ ok: false, message: "Paling banyak 40 catatan." });
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: "Roti", by: "DOKTER" }]).ok).toBe(false);
    expect(validateCustomerEntries([{ hour: 8, kind: "MAKAN_MINUM", text: " Roti " }])).toEqual({
      ok: true,
      entries: [{ hour: 8, kind: "MAKAN_MINUM", text: "Roti", by: "CUSTOMER" }],
    });
  });

  it("jam 00–23, lima jenis; Bangun tidur boleh tanpa isi, jenis lain tidak (spec recall R2–R4)", () => {
    expect(
      validateCustomerEntries([
        { hour: 0, kind: "BANGUN_TIDUR", text: "" },
        { hour: 23, kind: "ISTIRAHAT", text: "tidur malam" },
      ]),
    ).toEqual({
      ok: true,
      entries: [
        { hour: 0, kind: "BANGUN_TIDUR", text: "", by: "CUSTOMER" },
        { hour: 23, kind: "ISTIRAHAT", text: "tidur malam", by: "CUSTOMER" },
      ],
    });
    // Review Focus 3: spasi saja tersimpan kosong untuk Bangun tidur.
    expect(validateCustomerEntries([{ hour: 5, kind: "BANGUN_TIDUR", text: "   " }])).toEqual({
      ok: true,
      entries: [{ hour: 5, kind: "BANGUN_TIDUR", text: "", by: "CUSTOMER" }],
    });
    for (const validate of [validateCustomerEntries, (raw: unknown) => validateStaffEntries(raw, "PERAWAT")]) {
      expect(validate([{ hour: 24, kind: "MAKAN_MINUM", text: "Roti" }]).ok).toBe(false);
      expect(validate([{ hour: -1, kind: "MAKAN_MINUM", text: "Roti" }]).ok).toBe(false);
      expect(validate([{ hour: 8, kind: "TIDUR", text: "Tidur" }]).ok).toBe(false);
      expect(validate([{ hour: 8, kind: "MAKAN_MINUM", text: "   " }]).ok).toBe(false);
      expect(validate([{ hour: 13, kind: "ISTIRAHAT", text: "" }]).ok).toBe(false);
    }
    expect(validateStaffEntries([{ hour: 5, kind: "BANGUN_TIDUR", text: "" }], "PERAWAT")).toEqual({
      ok: true,
      entries: [{ hour: 5, kind: "BANGUN_TIDUR", text: "", by: "PERAWAT" }],
    });
  });

  it("baris lama (jenis kuis v1, jam 06–22) tetap terbaca dan lolos simpanan staf (Review Focus 1)", () => {
    const stored = parseStoredEntries([{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" }]);
    expect(stored).toEqual([{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" }]);
    expect(validateStaffEntries(stored).ok).toBe(true);
  });

  it("simpanan dokter: baris customer tetap CUSTOMER, baris baru menjadi DOKTER", () => {
    const result = validateStaffEntries([
      { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
      { hour: 9, kind: "OLAHRAGA", text: "Senam" },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
        { hour: 9, kind: "OLAHRAGA", text: "Senam", by: "DOKTER" },
      ],
    });
  });

  it("baris tersimpan yang rusak dibaca sebagai kosong", () => {
    expect(parseStoredEntries("bukan larik")).toEqual([]);
    expect(parseStoredEntries([{ hour: "tujuh" }])).toEqual([]);
    expect(parseStoredEntries(ENTRIES)).toEqual(ENTRIES);
  });
});

describe("tabel dan teks untuk dokter", () => {
  it("tabel 00.00–23.00 dengan penulis tiap baris (spec recall R4)", () => {
    const rows = foodRecallRows([...ENTRIES, { hour: 0, kind: "BANGUN_TIDUR", text: "", by: "PERAWAT" }]);
    expect(rows).toHaveLength(24);
    expect(rows[0]).toEqual({ hour: 0, label: "00.00", entries: [{ kindLabel: "Bangun tidur", text: "", by: "PERAWAT" }] });
    expect(rows[23].label).toBe("23.00");
    expect(rows[7]).toEqual({
      hour: 7,
      label: "07.00",
      entries: [
        { kindLabel: "Makan/minum", text: "Nasi kuning 1 piring, teh manis", by: "CUSTOMER" },
        { kindLabel: "Olahraga", text: "Jalan pagi 20 menit", by: "DOKTER" },
      ],
    });
  });

  it("teks Salin ke S: judul, lalu satu catatan per baris terurut per jam", () => {
    expect(foodRecallHeader("2026-10-02")).toBe("Recall H-1 (Jumat, 2 Okt)");
    expect(foodRecallSubjectiveText("2026-10-02", ENTRIES)).toBe(
      [
        "Recall H-1 (Jumat, 2 Okt):",
        "07.00 Makan/minum — Nasi kuning 1 piring, teh manis",
        "07.00 Olahraga — Jalan pagi 20 menit",
        "12.00 Kapsul/obat — Kapsul M",
      ].join("\n"),
    );
  });

  it("Bangun tidur tanpa isi tanpa tanda pisah, jam 00.00 paling atas (Review Focus 4, 5)", () => {
    const entries: FoodRecallEntry[] = [
      { hour: 13, kind: "ISTIRAHAT", text: "tidur siang 1 jam", by: "CUSTOMER" },
      { hour: 0, kind: "BANGUN_TIDUR", text: "", by: "CUSTOMER" },
      { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
    ];
    expect(foodRecallSubjectiveText("2026-10-02", entries)).toBe(
      ["Recall H-1 (Jumat, 2 Okt):", "00.00 Bangun tidur", "07.00 Makan/minum — Nasi", "13.00 Istirahat — tidur siang 1 jam"].join("\n"),
    );
  });

  it("menambahkan di akhir S dengan satu baris kosong pemisah", () => {
    expect(appendToSubjective("", "Food recall")).toBe("Food recall");
    expect(appendToSubjective("  ", "Food recall")).toBe("Food recall");
    expect(appendToSubjective("Keluhan BB naik\n", "Food recall")).toBe("Keluhan BB naik\n\nFood recall");
  });
});

describe("penawaran dan status link", () => {
  it("otomatis untuk Slimming, gizi klinik, atau paket aktif", () => {
    expect(shouldOfferFoodRecall({ intakePurpose: "SLIMMING", hasActivePackage: false })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: "GIZI_KLINIK", hasActivePackage: false })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: null, hasActivePackage: true })).toBe(true);
    expect(shouldOfferFoodRecall({ intakePurpose: "AESTHETIC", hasActivePackage: false })).toBe(false);
    expect(shouldOfferFoodRecall({ intakePurpose: null, hasActivePackage: false })).toBe(false);
  });

  const startAt = combineWitaDateAndMinutes("2026-10-03", 11 * 60);
  const sameDay = combineWitaDateAndMinutes("2026-10-03", 16 * 60);
  const nextDay = combineWitaDateAndMinutes("2026-10-04", 9 * 60);
  const open = { appointmentStatus: "HADIR", startAt, encounterStatus: null, completedAt: null } as const;

  it("berlaku pada tanggal booking selama booking Hadir", () => {
    expect(foodRecallLinkState(open, sameDay)).toBe("OPEN");
    expect(foodRecallLinkState({ ...open, encounterStatus: "DRAF" }, sameDay)).toBe("OPEN");
  });

  it("tidak berlaku di hari lain atau bila booking bukan Hadir", () => {
    expect(foodRecallLinkState(open, nextDay)).toBe("CLOSED");
    expect(foodRecallLinkState({ ...open, appointmentStatus: "DIBATALKAN" }, sameDay)).toBe("CLOSED");
    expect(foodRecallLinkState({ ...open, appointmentStatus: "TIDAK_HADIR" }, sameDay)).toBe("CLOSED");
  });

  it("sudah diterima dokter bila catatan final atau dokter sudah melengkapi", () => {
    expect(foodRecallLinkState({ ...open, appointmentStatus: "SELESAI", encounterStatus: "FINAL" }, sameDay)).toBe("RECEIVED");
    expect(foodRecallLinkState({ ...open, completedAt: sameDay }, sameDay)).toBe("RECEIVED");
  });

  it("pesan WA memakai nama depan dan tanpa kata pasien", () => {
    const text = foodRecallMessageText({ patientName: "Siti Rahayu", link: "https://sundyclinic.com/food-recall#x" });
    expect(text).toContain("Halo Siti, ini SunDY Clinic.");
    expect(text).toContain("https://sundyclinic.com/food-recall#x");
    expect(text).not.toMatch(/pasien|berobat/i);
    expect(text).toContain("termasuk jam bangun dan istirahat, sebelum konsultasi (±3 menit): ");
  });

  it("pesan halaman tablet setelah diterima dokter (spec recall R1)", () => {
    expect(FOOD_RECALL_RECEIVED).toBe("Recall Anda sudah diterima dokter.");
  });
});

describe("foodRecallView", () => {
  const appointment = { id: "a1", startAt: combineWitaDateAndMinutes("2026-10-03", 11 * 60) };
  const stored = {
    status: "DIISI" as const,
    recallDate: new Date("2026-10-02T00:00:00Z"),
    entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" }],
    submittedAt: new Date("2026-10-03T02:00:00Z"),
    completedAt: null,
    completedByName: null,
    updatedAt: new Date("2026-10-03T02:00:00Z"),
  };

  it("belum ditawarkan: tanggal H-1 tetap dihitung dari tanggal booking", () => {
    expect(foodRecallView(appointment, null)).toEqual({
      appointmentId: "a1",
      state: "NOT_OFFERED",
      recallDate: "2026-10-02",
      recallDateLabel: "Jumat, 2 Oktober",
      entries: [],
      submittedAt: null,
      completedAt: null,
      completedByName: null,
      version: null,
    });
  });

  it("ditawarkan tetapi belum diisi, dan sudah diisi", () => {
    expect(foodRecallView(appointment, { ...stored, status: "DITAWARKAN", entries: [] }).state).toBe("WAITING");
    expect(foodRecallView(appointment, stored)).toMatchObject({ state: "FILLED", entries: stored.entries, version: "2026-10-03T02:00:00.000Z" });
  });
});

describe("food recall oleh perawat (spec peran perawat 7)", () => {
  it("baris tanpa tanda dari perawat bertanda PERAWAT; tanda lama dipertahankan", () => {
    const result = validateStaffEntries(
      [
        { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
        { hour: 8, kind: "KAPSUL_OBAT", text: "Vitamin", by: "DOKTER" },
        { hour: 9, kind: "OLAHRAGA", text: "Jalan" },
      ],
      "PERAWAT",
    );
    expect(result.ok && result.entries.map((entry) => entry.by)).toEqual(["CUSTOMER", "DOKTER", "PERAWAT"]);
  });

  it("tanpa argumen penulis, baris baru tetap milik dokter", () => {
    const result = validateStaffEntries([{ hour: 9, kind: "OLAHRAGA", text: "Jalan" }]);
    expect(result.ok && result.entries[0].by).toBe("DOKTER");
  });

  it("baris tabel membawa penulis, dan label penulis untuk lencana", () => {
    expect(foodRecallRows([{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "PERAWAT" }])[7].entries[0].by).toBe("PERAWAT");
    expect(FOOD_RECALL_AUTHOR_LABEL).toEqual({ CUSTOMER: "pasien", DOKTER: "dokter", PERAWAT: "perawat" });
  });

  it("baris tersimpan bertanda PERAWAT terbaca", () => {
    expect(parseStoredEntries([{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "PERAWAT" }])).toHaveLength(1);
  });

  it("baris tersimpan dibaca per baris: penulis tak dikenal tetap tampil sebagai staf, baris rusak saja yang dibuang (aman untuk rilis berikutnya)", () => {
    const entries = parseStoredEntries([
      { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
      { hour: 8, kind: "OLAHRAGA", text: "Jalan", by: "BIDAN" },
      { hour: 9, kind: "MAKAN_MINUM" },
    ]);
    expect(entries).toEqual([
      { hour: 7, kind: "MAKAN_MINUM", text: "Nasi", by: "CUSTOMER" },
      { hour: 8, kind: "OLAHRAGA", text: "Jalan", by: "DOKTER" },
    ]);
  });
});
