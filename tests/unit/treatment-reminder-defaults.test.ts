import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NO_RETURN_REMINDER_SLUGS } from "@/lib/treatment-reminder";

const sql = (name: string) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const quotedSlugs = (text: string) => [...text.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);

// Nilai awal jarak pengingat (spec pengingat treatment PT3): layanan bukan treatment dan treatment intim tidak diingatkan.
describe("nilai awal jarak pengingat", () => {
  it("konsultasi, BIA, meal plan, dan HIFU Miss V tidak diingatkan", () => {
    expect([...NO_RETURN_REMINDER_SLUGS].sort()).toEqual(
      ["bia", "hifu-miss-v", "konsultasi-bia", "konsultasi-dokter", "konsultasi-online", "meal-plan", "timbang-bia"].sort(),
    );
  });

  it("migrasi mengosongkan persis layanan di daftar itu", () => {
    const first = sql("20261026090000_pengingat_treatment");
    const excludedFromWeekly = quotedSlugs(first.slice(first.indexOf("NOT IN")));
    const cleared = quotedSlugs(sql("20261026100000_pengingat_pengecualian"));
    expect([...new Set([...excludedFromWeekly, ...cleared])].sort()).toEqual([...NO_RETURN_REMINDER_SLUGS].sort());
  });
});
