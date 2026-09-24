import { describe, expect, it } from "vitest";
import { CLINIC_NAME } from "@/lib/clinic";

describe("perkakas proyek", () => {
  it("menyelesaikan alias impor @/ ke src/", () => {
    expect(CLINIC_NAME).toBe("SunDY Clinic");
  });
});
