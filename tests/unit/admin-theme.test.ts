import { getContrastRatio } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { adminTheme, DARK, SUNDY } from "@/components/admin/mui/theme";
import { COLOR_SCHEME_SELECTOR, MODE_STORAGE_KEY } from "@/lib/color-mode";

type Tone = { main: string; contrastText: string };
type Scheme = { palette: { primary: Tone; error: Tone; warning: Tone; info: Tone; success: Tone; background: { default: string; paper: string }; text: { primary: string; secondary: string } } };
// Tipe `Theme` tidak memuat `colorSchemes`, padahal tema dengan variabel CSS memilikinya saat dijalankan.
const schemes = (adminTheme as unknown as { colorSchemes: Record<"light" | "dark", Scheme> }).colorSchemes;

describe("tema SunDY", () => {
  it("memakai warna merek: emas utama, latar krem (terang) dan cokelat sangat tua (gelap)", () => {
    expect(schemes.light.palette.primary.main).toBe(SUNDY.gold500);
    expect(schemes.light.palette.background.default).toBe(SUNDY.cream50);
    expect(schemes.dark.palette.background.default).toBe(DARK.background);
    expect(schemes.dark.palette.primary.main).toBe(DARK.primary);
  });

  for (const scheme of ["light", "dark"] as const) {
    it(`kontras minimal 4,5:1 di skema ${scheme}`, () => {
      const p = schemes[scheme].palette;
      expect(getContrastRatio(p.text.primary, p.background.default)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.text.secondary, p.background.default)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.text.primary, p.background.paper)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.text.secondary, p.background.paper)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(p.primary.contrastText, p.primary.main)).toBeGreaterThanOrEqual(4.5);
    });

    it(`warna status terbaca sebagai teks dan sebagai latar chip di skema ${scheme}`, () => {
      const p = schemes[scheme].palette;
      for (const tone of [p.error, p.warning, p.info, p.success]) {
        expect(getContrastRatio(tone.main, p.background.default)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(tone.main, p.background.paper)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(tone.contrastText, tone.main)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("huruf: badan Plus Jakarta Sans, judul Cormorant; tombol tanpa huruf kapital semua; sudut 12px", () => {
    expect(adminTheme.typography.fontFamily).toContain("--font-jakarta");
    expect(String(adminTheme.typography.h1.fontFamily)).toContain("--font-cormorant");
    expect(adminTheme.typography.button.textTransform).toBe("none");
    expect(adminTheme.shape.borderRadius).toBe(12);
  });

  it("kunci penyimpanan dan pemilih skema konsisten", () => {
    expect(MODE_STORAGE_KEY).toBe("sundy-mode-admin");
    expect(COLOR_SCHEME_SELECTOR).toBe("data");
  });
});
