import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Spec struk WA 7.3: cetak browser selebar kertas struk 80 mm. Nilai `size` yang tidak sah dibuang browser
// diam-diam (mis. "80mm auto"), sehingga struk melebar ke seluruh kertas A4.
describe("gaya cetak struk", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const page = /@page struk\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  it("halaman bernama struk tidak memakai nilai size yang tidak sah (\"80mm auto\" dibuang browser)", () => {
    expect(page).not.toMatch(/size:[^;]*auto/);
    expect(page).toMatch(/margin:\s*3mm/);
  });

  it("kertas struk punya lebar cetak tetap, bukan melebar sepenuh halaman", () => {
    const print = css.slice(css.indexOf("@page struk"));
    expect(print).toMatch(/\.struk-kertas\s*\{[^}]*\bwidth:\s*7\dmm/);
  });
});
