import { describe, expect, it } from "vitest";
import { USAGE_FREQUENCIES, composeUsage, isIncompleteUsage, newUsageParts, parseUsage, usageProblem } from "@/lib/usage";

describe("aturan pakai (spec aturan pakai AP1–AP6)", () => {
  it("pilihan frekuensi dan waktu bawaan baris baru", () => {
    expect(USAGE_FREQUENCIES).toEqual(["1xSehari", "1xSeminggu", "1-2xSehari", "2-3xSehari", "3xSehari"]);
    expect(newUsageParts()).toEqual({ frequency: "", custom: "", timing: "SEBELUM MAKAN" });
  });

  it("digabung jadi satu teks: frekuensi atau teks sendiri, lalu waktu", () => {
    expect(composeUsage({ frequency: "3xSehari", custom: "", timing: "SEBELUM MAKAN" })).toBe("3xSehari SEBELUM MAKAN");
    expect(composeUsage({ frequency: "3xSehari", custom: "", timing: "  " })).toBe("3xSehari");
    expect(composeUsage({ frequency: "LAINNYA", custom: " bila perlu ", timing: "SESUDAH MAKAN" })).toBe("bila perlu SESUDAH MAKAN");
  });

  it("dibuka lagi: diawali pilihan → pilihan + waktu; selain itu → Lainnya utuh; tanpa mengubah teks", () => {
    expect(parseUsage("3xSehari SEBELUM MAKAN")).toEqual({ frequency: "3xSehari", custom: "", timing: "SEBELUM MAKAN" });
    expect(parseUsage("1xSeminggu")).toEqual({ frequency: "1xSeminggu", custom: "", timing: "" });
    expect(parseUsage("1-2xSehari pagi")).toEqual({ frequency: "1-2xSehari", custom: "", timing: "pagi" });
    expect(parseUsage("3 x 1 sesudah makan")).toEqual({ frequency: "LAINNYA", custom: "3 x 1 sesudah makan", timing: "" });
    expect(parseUsage("1xSeharian")).toEqual({ frequency: "LAINNYA", custom: "1xSeharian", timing: "" });
    for (const text of ["3xSehari SEBELUM MAKAN", "1xSeminggu", "1-2xSehari pagi", "3 x 1 sesudah makan", "1xSeharian"]) {
      expect(composeUsage(parseUsage(text))).toBe(text);
    }
  });

  it("masalah isian: belum dipilih, Lainnya kosong, terlalu panjang", () => {
    expect(usageProblem({ frequency: "", custom: "", timing: "SEBELUM MAKAN" }, 200)).toBe("Pilih aturan pakai obat.");
    expect(usageProblem({ frequency: "LAINNYA", custom: "  ", timing: "" }, 200)).toBe("Isi aturan pakai obat.");
    expect(usageProblem({ frequency: "LAINNYA", custom: "x".repeat(201), timing: "" }, 200)).toBe("Aturan pakai terlalu panjang (maks. 200 karakter).");
    expect(usageProblem({ frequency: "2-3xSehari", custom: "", timing: "SEBELUM MAKAN" }, 200)).toBeNull();
    expect(isIncompleteUsage({ frequency: "", custom: "", timing: "SEBELUM MAKAN" })).toBe(true);
    expect(isIncompleteUsage({ frequency: "LAINNYA", custom: " ", timing: "" })).toBe(true);
    expect(isIncompleteUsage({ frequency: "1xSehari", custom: "", timing: "" })).toBe(false);
  });
});
