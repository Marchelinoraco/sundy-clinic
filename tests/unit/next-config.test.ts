// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config", () => {
  it("menghasilkan server mandiri untuk VPS", () => {
    expect(nextConfig.output).toBe("standalone");
  });

  it("tetap mengaktifkan authInterrupts yang dipakai forbidden()", () => {
    expect(nextConfig.experimental?.authInterrupts).toBe(true);
  });

  it("mengimpor komponen Radix satu per satu, bukan seluruh paket radix-ui", () => {
    // Paket payung radix-ui mengimpor semua komponen Radix. Header situs publik memakai panel
    // menu (Dialog); tanpa optimasi ini setiap halaman publik membawa ±500 modul Radix lain di
    // server dev, sehingga server uji e2e lambat dan kehabisan memori.
    expect(nextConfig.experimental?.optimizePackageImports).toContain("radix-ui");
  });
});
