import { describe, expect, it } from "vitest";
import { bookingCodeFromParam, generateBookingCode } from "@/lib/booking-code";

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

describe("bookingCodeFromParam", () => {
  it("membersihkan kode dari URL: spasi dibuang, huruf dibesarkan", () => {
    expect(bookingCodeFromParam(" sdy-7kq2 ")).toBe("SDY-7KQ2");
  });

  it("kosong untuk nilai yang tidak mirip kode, terlalu panjang, ganda, atau tidak ada", () => {
    expect(bookingCodeFromParam("<script>")).toBe("");
    expect(bookingCodeFromParam("A".repeat(21))).toBe("");
    expect(bookingCodeFromParam(["SDY-7KQ2", "SDY-AAAA"])).toBe("");
    expect(bookingCodeFromParam(undefined)).toBe("");
  });
});
