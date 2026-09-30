import { describe, expect, it } from "vitest";
import * as options from "@/lib/kuis/v2/options";
import { STEP_IDS } from "@/lib/kuis/v2/steps";
import { stepText } from "@/lib/kuis/v2/texts";

describe("teks kuis v2 untuk customer (spec V8)", () => {
  it("judul, petunjuk, dan pilihan tidak memakai kata 'pasien' atau 'berobat'", () => {
    const contexts = [
      { patientType: "BARU", purpose: "SLIMMING" },
      { patientType: "LAMA", purpose: "GIZI_KLINIK" },
      { patientType: "LAMA", purpose: "AESTHETIC" },
    ] as const;
    for (const answers of contexts) {
      for (const step of STEP_IDS) {
        const { title, hint } = stepText(step, answers);
        expect(`${title} ${hint ?? ""}`).not.toMatch(/pasien|berobat/i);
      }
    }
    const labels = (Object.values(options) as unknown[])
      .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value))
      .flatMap((value) => Object.values(value))
      .filter((value): value is string => typeof value === "string");
    expect(labels.join(" ")).not.toMatch(/pasien|berobat/i);
  });

  it("menanyakan konsultasi atau treatment, dan memberi contoh porsi di layar makan", () => {
    expect(stepText("U1", {}).title).toBe("Pernah konsultasi atau treatment di SunDY Clinic?");
    expect(stepText("F2", {}).hint).toContain("nasi 1 piring, paha ayam goreng 1 potong");
    expect(stepText("F5", {}).hint).toContain("martabak");
  });
});
