import { describe, expect, it } from "vitest";
import { resolveTab } from "@/lib/page-tabs";

const TABS = ["jam-kerja", "pengecualian", "hari-libur"] as const;

describe("resolveTab", () => {
  it("memakai tab yang dikenal", () => {
    expect(resolveTab("pengecualian", TABS)).toBe("pengecualian");
  });

  it("tab tidak dikenal, kosong, atau ganda kembali ke tab pertama atau cadangan", () => {
    expect(resolveTab("salah", TABS)).toBe("jam-kerja");
    expect(resolveTab(undefined, TABS)).toBe("jam-kerja");
    expect(resolveTab(["pengecualian", "hari-libur"], TABS)).toBe("jam-kerja");
    expect(resolveTab(undefined, TABS, "hari-libur")).toBe("hari-libur");
  });
});
