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
});
