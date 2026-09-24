// @vitest-environment node
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("penjaga sesi", () => {
  it("memetakan peran ke kemampuan yang dipakai halaman admin", () => {
    // requireCapability() membutuhkan next/headers dan hanya berjalan di
    // dalam permintaan Next, jadi perilakunya diuji ujung-ke-ujung pada
    // Task 9. Yang diuji di sini adalah keputusan yang dipakainya.
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
    expect(can("RESEPSIONIS", "staff:manage")).toBe(false);
    expect(can("SUPER_ADMIN", "staff:manage")).toBe(true);
  });
});
