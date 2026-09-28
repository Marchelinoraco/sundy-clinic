// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const headerValues = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
}));

import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp, guardRate } from "@/server/request-guard";

afterEach(() => {
  headerValues.clear();
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("memakai X-Real-IP yang diisi Nginx", async () => {
    headerValues.set("x-real-ip", "36.85.1.2");
    headerValues.set("x-forwarded-for", "9.9.9.9");
    expect(await clientIp()).toBe("36.85.1.2");
  });

  it("jatuh ke alamat pertama X-Forwarded-For", async () => {
    headerValues.set("x-forwarded-for", "36.85.1.2, 10.0.0.1");
    expect(await clientIp()).toBe("36.85.1.2");
  });
});

describe("guardRate", () => {
  it("melempar pesan untuk pengguna setelah batas terlampaui", async () => {
    headerValues.set("x-real-ip", "36.85.1.2");
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    await guardRate(limiter);
    await expect(guardRate(limiter)).rejects.toThrow("Terlalu banyak percobaan");
  });

  it("dapat dimatikan untuk server uji ujung-ke-ujung", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    const limiter = createRateLimiter({ limit: 0, windowMs: 60_000 });
    await expect(guardRate(limiter)).resolves.toBeUndefined();
  });
});
