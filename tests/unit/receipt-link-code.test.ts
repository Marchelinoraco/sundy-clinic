import { describe, expect, it } from "vitest";
import { quizLinkCode, quizLinkKey } from "@/server/quiz-link-code";
import { isValidReceiptCode, parseReceiptCode, receiptCode, receiptKey, receiptUrl } from "@/server/receipt-link-code";

const KEY = receiptKey("rahasia-uji");
const ID = "cmabc123def456ghi789";

describe("kode tautan struk", () => {
  it("berbentuk {id}.{tanda tangan 22 karakter} dan sah untuk versinya", () => {
    const code = receiptCode(ID, 0, KEY);
    expect(code).toMatch(/^cmabc123def456ghi789\.[A-Za-z0-9_-]{22}$/);
    expect(isValidReceiptCode(code, 0, KEY)).toBe(true);
  });

  it("versi lain (sesudah Ganti tautan) tidak sah", () => {
    expect(isValidReceiptCode(receiptCode(ID, 0, KEY), 1, KEY)).toBe(false);
  });

  it("tanda tangan yang diubah atau kunci lain tidak sah", () => {
    const code = receiptCode(ID, 0, KEY);
    const tampered = `${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`;
    expect(isValidReceiptCode(tampered, 0, KEY)).toBe(false);
    expect(isValidReceiptCode(code, 0, receiptKey("rahasia-lain"))).toBe(false);
  });

  it("kode link kuis untuk id yang sama tidak sah sebagai kode struk", () => {
    expect(isValidReceiptCode(quizLinkCode(ID, 0, quizLinkKey("rahasia-uji")), 0, KEY)).toBe(false);
  });

  it("parse menolak yang bukan bentuk kode", () => {
    for (const value of [null, undefined, 12, "", "abc", "ID.pendek", `${ID}.`, `${ID.toUpperCase()}.${"a".repeat(22)}`]) {
      expect(parseReceiptCode(value), String(value)).toBeNull();
    }
    expect(parseReceiptCode(receiptCode(ID, 3, KEY))?.invoiceId).toBe(ID);
  });

  it("URL menaruh kode di belakang #", () => {
    expect(receiptUrl("https://sundyclinic.com", ID, 0, KEY)).toBe(`https://sundyclinic.com/struk#${receiptCode(ID, 0, KEY)}`);
  });

  it("tanpa BETTER_AUTH_SECRET kunci tidak bisa dibuat", () => {
    expect(() => receiptKey("")).toThrow(/BETTER_AUTH_SECRET/);
  });
});
