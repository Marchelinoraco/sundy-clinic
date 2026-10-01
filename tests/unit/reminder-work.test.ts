import { describe, expect, it } from "vitest";
import {
  groupReminderWork,
  latestValidMessage,
  messageStatusLabels,
  reminderDay,
  type MessageRecord,
} from "@/lib/reminder-work";

// Feb 2031: Kamis 6, Jumat 7, Sabtu 8, Minggu 9, Senin 10, Selasa 11, Rabu 12, Kamis 13,
// Jumat 14, Sabtu 15, Minggu 16, Senin 17.
const wita = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2031, 1, day, hour - 8, minute));
const NO_HOLIDAYS = new Set<string>();

let seq = 0;
function msg(kind: MessageRecord["kind"], scheduledFor: Date, sentAt: Date, extra: Partial<MessageRecord> = {}): MessageRecord {
  seq += 1;
  return { id: `m${seq}`, kind, scheduledFor, sentAt, sentByName: "Rina", revokedAt: null, reply: null, ...extra };
}
const booking = (id: string, startAt: Date, messages: MessageRecord[] = []) => ({ id, startAt, messages });

describe("reminderDay", () => {
  it("hari sebelumnya pada hari kerja biasa", () => {
    expect(reminderDay("2031-02-11", NO_HOLIDAYS)).toBe("2031-02-10");
  });

  it("jadwal Senin diingatkan Sabtu, karena Minggu tutup", () => {
    expect(reminderDay("2031-02-10", NO_HOLIDAYS)).toBe("2031-02-08");
  });

  it("melewati tanggal libur", () => {
    expect(reminderDay("2031-02-13", new Set(["2031-02-12"]))).toBe("2031-02-11");
  });

  it("melewati libur berurutan dan hari Minggu sekaligus", () => {
    expect(reminderDay("2031-02-17", new Set(["2031-02-14", "2031-02-15"]))).toBe("2031-02-13");
  });
});

describe("latestValidMessage", () => {
  const start = wita(11, 11);

  it("memakai kiriman terakhir yang belum dibatalkan untuk jadwal yang sama", () => {
    const older = msg("KONFIRMASI", start, wita(7, 9));
    const newer = msg("KONFIRMASI", start, wita(7, 10));
    const revoked = msg("KONFIRMASI", start, wita(7, 11), { revokedAt: wita(7, 12) });
    const oldSchedule = msg("KONFIRMASI", wita(10, 11), wita(7, 13));
    expect(latestValidMessage([older, newer, revoked, oldSchedule], "KONFIRMASI", start)).toBe(newer);
  });

  it("null bila tidak ada catatan yang berlaku", () => {
    expect(latestValidMessage([msg("PENGINGAT", start, wita(10, 9))], "KONFIRMASI", start)).toBeNull();
  });
});

describe("groupReminderWork", () => {
  it("memisahkan konfirmasi yang belum dikirim, pengingat hari ini, dan yang sudah diingatkan", () => {
    const now = wita(10, 9); // Senin 09.00
    const confirmedFriday = (start: Date) => msg("KONFIRMASI", start, wita(7, 10));

    const a = booking("a", wita(11, 11), [confirmedFriday(wita(11, 11))]);
    const b = booking("b", wita(11, 13)); // belum ada konfirmasi
    const c = booking("c", wita(11, 15), [msg("KONFIRMASI", wita(11, 15), wita(10, 8))]); // dikonfirmasi pada hari pengingat
    const d = booking("d", wita(10, 15), [msg("KONFIRMASI", wita(10, 15), wita(6, 10))]); // hari pengingat Sabtu: terlambat
    const e = booking("e", wita(12, 11), [confirmedFriday(wita(12, 11))]); // hari pengingat besok
    const f = booking("f", wita(11, 16), [
      confirmedFriday(wita(11, 16)),
      msg("PENGINGAT", wita(11, 16), wita(10, 8, 30)),
    ]);
    const g = booking("g", wita(10, 8), [confirmedFriday(wita(10, 8))]); // jadwal sudah lewat
    const h = booking("h", wita(11, 17), [msg("KONFIRMASI", wita(11, 10), wita(7, 10))]); // konfirmasi untuk jadwal lama
    const i = booking("i", wita(11, 18), [msg("KONFIRMASI", wita(11, 18), wita(7, 10), { revokedAt: wita(7, 11) })]);

    const groups = groupReminderWork([a, b, c, d, e, f, g, h, i], { now, closedDates: NO_HOLIDAYS });

    expect(groups.confirm.map((x) => x.id)).toEqual(["b", "h", "i"]);
    expect(groups.remind.map((x) => [x.id, x.overdue, x.shifted])).toEqual([
      ["d", true, true],
      ["a", false, false],
    ]);
    expect(groups.reminded.map((x) => [x.id, x.reminder.sentAt])).toEqual([["f", wita(10, 8, 30)]]);
  });

  it("jadwal Senin muncul pada hari Sabtu, dengan keterangan hari sebelumnya tutup", () => {
    const now = wita(8, 10); // Sabtu
    const monday = booking("senin", wita(10, 11), [msg("KONFIRMASI", wita(10, 11), wita(6, 10))]);
    const groups = groupReminderWork([monday], { now, closedDates: NO_HOLIDAYS });
    expect(groups.remind.map((x) => [x.id, x.reminderDay, x.overdue, x.shifted])).toEqual([
      ["senin", "2031-02-08", false, true],
    ]);
  });

  it("hari pengingat dihitung dari tanggal WITA, termasuk untuk booking pagi hari", () => {
    // Selasa 07.00 WITA = Senin 23.00 UTC. Pengingatnya hari Senin, bukan Sabtu.
    const now = wita(10, 9);
    const early = booking("pagi", wita(11, 7), [msg("KONFIRMASI", wita(11, 7), wita(7, 10))]);
    const groups = groupReminderWork([early], { now, closedDates: NO_HOLIDAYS });
    expect(groups.remind.map((x) => [x.id, x.reminderDay, x.overdue])).toEqual([["pagi", "2031-02-10", false]]);
  });

  it("pengingat yang dibatalkan membuat booking kembali perlu diingatkan", () => {
    const now = wita(10, 9);
    const start = wita(11, 11);
    const groups = groupReminderWork(
      [
        booking("x", start, [
          msg("KONFIRMASI", start, wita(7, 10)),
          msg("PENGINGAT", start, wita(10, 8), { revokedAt: wita(10, 8, 5) }),
        ]),
      ],
      { now, closedDates: NO_HOLIDAYS },
    );
    expect(groups.remind.map((x) => x.id)).toEqual(["x"]);
    expect(groups.reminded).toEqual([]);
  });
});

describe("messageStatusLabels", () => {
  it("menulis kiriman terakhir yang berlaku per jenis, dengan tanggal bila bukan hari ini", () => {
    const now = wita(10, 12);
    const start = wita(11, 11);
    expect(
      messageStatusLabels(
        [
          msg("PENGINGAT", start, wita(10, 9, 40), { reply: "AKAN_DATANG" }),
          msg("KONFIRMASI", start, wita(7, 10, 12)),
          msg("INSTRUKSI_TRANSFER", start, wita(10, 9, 5)),
          msg("KONFIRMASI", wita(9, 11), wita(10, 11)), // jadwal lama
          msg("PENGINGAT", start, wita(10, 11), { revokedAt: wita(10, 11, 1) }),
        ],
        start,
        now,
      ),
    ).toEqual([
      "Instruksi transfer terkirim 09.05",
      "Konfirmasi terkirim Jum, 7 Feb 10.12 · Rina",
      "Diingatkan 09.40 · Akan datang",
    ]);
  });

  it("kosong bila belum ada pesan", () => {
    expect(messageStatusLabels([], wita(11, 11), wita(10, 12))).toEqual([]);
  });
});
