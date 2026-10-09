import { describe, expect, it } from "vitest";
import { TEMP_PASSWORD_LENGTH, generateTempPassword } from "@/server/temp-password";

describe("kata sandi sementara", () => {
  it("16 karakter, tanpa karakter yang mudah tertukar, memuat huruf besar, kecil, dan angka", () => {
    expect(TEMP_PASSWORD_LENGTH).toBe(16);
    for (let i = 0; i < 500; i += 1) {
      const password = generateTempPassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
    }
  });

  it("tidak berulang pada 1.000 panggilan", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateTempPassword()));
    expect(seen.size).toBe(1000);
  });

  it("memakai sumber acak yang diberikan (uji deterministik) dan mengacak urutan golongan", () => {
    let n = 0;
    const counter = (max: number) => n++ % max;
    const a = generateTempPassword(counter);
    n = 0;
    expect(generateTempPassword(counter)).toBe(a);
    // Tiga karakter pertama tidak selalu huruf besar-kecil-angka berurutan.
    const firsts = new Set(Array.from({ length: 200 }, () => generateTempPassword().slice(0, 3).replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[2-9]/g, "9")));
    expect(firsts.size).toBeGreaterThan(3);
  });
});
