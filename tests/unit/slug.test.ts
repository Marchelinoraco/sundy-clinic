import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("membuat slug dari nama bergelar", () => {
    expect(slugify("Dr. Diane Paparang, Sp.GK, AIFO-K")).toBe("dr-diane-paparang-sp-gk-aifo-k");
  });

  it("merapikan spasi berlebih", () => {
    expect(slugify("Terapis   SunDY  Mahakeret")).toBe("terapis-sundy-mahakeret");
  });

  it("tidak menyisakan tanda hubung di ujung", () => {
    expect(slugify("  Siti Rahayu!  ")).toBe("siti-rahayu");
  });
});
