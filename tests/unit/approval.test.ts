import { describe, expect, it } from "vitest";
import { PIN_FORMAT, pinLockedMessage, validatePin } from "@/lib/approval";

describe("PIN persetujuan (spec PIN P8)", () => {
  it("tepat 6 angka", () => {
    expect(validatePin("123456")).toBeNull();
    for (const bad of ["12345", "1234567", "12a456", 123456, "", null, " 123456"]) expect(validatePin(bad)).toBe(PIN_FORMAT);
  });

  it("pesan kunci menyebut nama dan jam buka (WITA)", () => {
    expect(pinLockedMessage("Rina", new Date("2026-10-24T02:15:00Z"))).toBe("PIN Rina terkunci sampai 10.15.");
  });
});
