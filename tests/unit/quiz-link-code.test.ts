import { describe, expect, it } from "vitest";
import {
  isValidQuizLinkCode,
  parseQuizLinkCode,
  quizLinkCode,
  quizLinkFor,
  quizLinkKey,
  quizLinkUrl,
} from "@/server/quiz-link-code";

const KEY = quizLinkKey("rahasia-uji-yang-cukup-panjang");
const ID = "cmupobz6200022ovuddaolzdc";

describe("kode link kuis (spec C3 bagian 6)", () => {
  it("memuat ID booking dan tanda tangan 16 byte base64url", () => {
    const code = quizLinkCode(ID, 0, KEY);
    expect(code).toMatch(/^cmupobz6200022ovuddaolzdc\.[A-Za-z0-9_-]{22}$/);
    expect(parseQuizLinkCode(code)).toEqual({ appointmentId: ID, signature: code.split(".")[1] });
  });

  it("sama untuk versi yang sama, berbeda untuk versi berikutnya", () => {
    expect(quizLinkCode(ID, 0, KEY)).toBe(quizLinkCode(ID, 0, KEY));
    expect(quizLinkCode(ID, 1, KEY)).not.toBe(quizLinkCode(ID, 0, KEY));
  });

  it("kode versi lama ditolak setelah Ganti link", () => {
    const old = quizLinkCode(ID, 0, KEY);
    expect(isValidQuizLinkCode(old, 0, KEY)).toBe(true);
    expect(isValidQuizLinkCode(old, 1, KEY)).toBe(false);
  });

  it("tanda tangan atau ID yang diubah ditolak", () => {
    const code = quizLinkCode(ID, 0, KEY);
    const [id, signature] = code.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(isValidQuizLinkCode(`${id}.${flipped}`, 0, KEY)).toBe(false);
    expect(isValidQuizLinkCode(`cmupobz6200022ovuddaolzdd.${signature}`, 0, KEY)).toBe(false);
  });

  it("kunci lain menolak kode", () => {
    expect(isValidQuizLinkCode(quizLinkCode(ID, 0, KEY), 0, quizLinkKey("kunci-lain-yang-panjang"))).toBe(false);
  });

  it("format rusak ditolak tanpa galat", () => {
    for (const bad of ["", "abc", `${ID}.`, `${ID}.pendek`, `${ID.toUpperCase()}.${"A".repeat(22)}`, 42, null]) {
      expect(parseQuizLinkCode(bad)).toBeNull();
    }
    expect(isValidQuizLinkCode("bukan-kode", 0, KEY)).toBe(false);
  });

  it("URL memakai tanda # agar kode tidak pernah terkirim ke server", () => {
    expect(quizLinkUrl("https://sundyclinic.com", ID, 2, KEY)).toBe(
      `https://sundyclinic.com/isi#${quizLinkCode(ID, 2, KEY)}`,
    );
  });

  it("quizLinkFor hanya untuk link yang berlaku, dengan versi isian", () => {
    const now = new Date("2026-10-05T02:00:00Z");
    const booking = {
      id: ID,
      source: "WHATSAPP" as const,
      status: "MENUNGGU_KONFIRMASI" as const,
      startAt: new Date("2026-10-06T03:00:00Z"),
      patientId: "p1",
      intake: { status: "MENUNGGU_DIISI" as const, linkVersion: 3 },
    };
    expect(quizLinkFor(booking, "https://sundyclinic.com", now, KEY)).toBe(
      quizLinkUrl("https://sundyclinic.com", ID, 3, KEY),
    );
    expect(quizLinkFor({ ...booking, intake: { status: "TERISI", linkVersion: 3 } }, "https://x", now, KEY)).toBeNull();
    expect(quizLinkFor({ ...booking, source: "SITUS" }, "https://x", now, KEY)).toBeNull();
  });

  it("tanpa BETTER_AUTH_SECRET: galat yang jelas", () => {
    expect(() => quizLinkKey("")).toThrow("BETTER_AUTH_SECRET");
  });
});
