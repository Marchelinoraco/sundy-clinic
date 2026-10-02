import { describe, expect, it } from "vitest";
import { parseDateParam, parseTimeParam } from "@/lib/booking-prefill";

describe("isian awal Booking Baru (spec D 5.8)", () => {
  it("jam: HH.MM atau HH:MM", () => {
    expect(parseTimeParam("11.00")).toBe(660);
    expect(parseTimeParam("9:30")).toBe(570);
    expect(parseTimeParam("25.00")).toBeNull();
    expect(parseTimeParam("11.75")).toBeNull();
    expect(parseTimeParam("pagi")).toBeNull();
    expect(parseTimeParam(undefined)).toBeNull();
  });

  it("tanggal: YYYY-MM-DD yang nyata", () => {
    expect(parseDateParam("2031-02-12")).toBe("2031-02-12");
    expect(parseDateParam("2031-02-30")).toBeNull();
    expect(parseDateParam("12-02-2031")).toBeNull();
    expect(parseDateParam(undefined)).toBeNull();
  });
});
