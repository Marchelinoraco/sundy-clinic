// @vitest-environment node
import { IntakePurpose } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { INTAKE_PURPOSE_LABEL } from "@/lib/intake-purpose";

describe("INTAKE_PURPOSE_LABEL", () => {
  it("memberi label untuk setiap nilai tujuan di basis data, termasuk gizi klinik", () => {
    expect(Object.keys(INTAKE_PURPOSE_LABEL).sort()).toEqual(Object.values(IntakePurpose).sort());
    expect(INTAKE_PURPOSE_LABEL.GIZI_KLINIK).toBe("Gizi klinik");
    expect(INTAKE_PURPOSE_LABEL.BELUM_YAKIN).toBe("Belum yakin (kuis lama)");
  });
});
