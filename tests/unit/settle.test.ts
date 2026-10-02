import { describe, expect, it, vi } from "vitest";
import { settle } from "@/lib/settle";

describe("settle (spec D 4.7)", () => {
  it("hasil sukses dibungkus ok", async () => {
    expect(await settle(Promise.resolve(3), "angka")).toEqual({ ok: true, data: 3 });
  });

  it("galat tidak dilempar ulang, tetapi dicatat di log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await settle(Promise.reject(new Error("putus")), "jadwal")).toEqual({ ok: false });
    expect(log).toHaveBeenCalledWith("[dasbor] jadwal gagal dimuat", expect.any(Error));
    log.mockRestore();
  });
});
