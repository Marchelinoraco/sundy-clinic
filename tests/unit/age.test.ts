import { describe, expect, it } from "vitest";
import { ageInYears } from "@/lib/age";

const birth = new Date("1990-05-17T00:00:00Z"); // kolom @db.Date

describe("ageInYears", () => {
  it("umur bertambah tepat di hari ulang tahun (WITA)", () => {
    expect(ageInYears(birth, new Date("2026-05-16T12:00:00+08:00"))).toBe(35);
    expect(ageInYears(birth, new Date("2026-05-17T00:30:00+08:00"))).toBe(36);
  });

  it("lahir 29 Februari: bertambah 1 Maret pada tahun bukan kabisat", () => {
    const leap = new Date("2000-02-29T00:00:00Z");
    expect(ageInYears(leap, new Date("2026-02-28T12:00:00+08:00"))).toBe(25);
    expect(ageInYears(leap, new Date("2026-03-01T12:00:00+08:00"))).toBe(26);
  });
});
