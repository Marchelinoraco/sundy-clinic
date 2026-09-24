import { describe, expect, it } from "vitest";
import { generateBookingCode } from "@/lib/booking-code";

describe("generateBookingCode", () => {
  it("berawalan SDY- diikuti 4 karakter", () => {
    expect(generateBookingCode()).toMatch(/^SDY-[A-Z0-9]{4}$/);
  });

  it("tidak memakai karakter yang mudah tertukar (0/O, 1/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBookingCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("menghasilkan kode berbeda pada pemanggilan berulang", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateBookingCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});
