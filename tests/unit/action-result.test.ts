import { describe, expect, it } from "vitest";
import { runAction, UserFacingError } from "@/lib/action-result";

describe("runAction", () => {
  it("membungkus hasil sukses", async () => {
    await expect(runAction(async () => 42)).resolves.toEqual({ ok: true, data: 42 });
  });

  it("mengembalikan pesan UserFacingError sebagai nilai, bukan melemparnya", async () => {
    const result = await runAction(async () => {
      throw new UserFacingError("Slot baru saja terisi. Pilih jam lain.");
    });
    expect(result).toEqual({ ok: false, error: "Slot baru saja terisi. Pilih jam lain." });
  });

  it("tetap melempar galat tak terduga agar detail internal tidak bocor ke admin", async () => {
    await expect(
      runAction(async () => {
        throw new Error("koneksi basis data putus");
      }),
    ).rejects.toThrow("koneksi basis data putus");
  });
});
