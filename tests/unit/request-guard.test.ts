// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const headerValues = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
}));

import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp, guardRate, rateLimitKey } from "@/server/request-guard";

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

describe("rateLimitKey", () => {
  it("membiarkan IPv4 apa adanya", () => {
    expect(rateLimitKey("36.85.1.2")).toBe("36.85.1.2");
    expect(rateLimitKey("tanpa-ip")).toBe("tanpa-ip");
  });

  it("mengelompokkan IPv6 per /64, juga untuk penulisan singkat", () => {
    const key = rateLimitKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(rateLimitKey("2001:0db8:0001:0002::1")).toBe(key);
    expect(rateLimitKey("2001:db8:1:2:ffff::")).toBe(key);
    expect(rateLimitKey("2001:db8:1:3::1")).not.toBe(key);
    expect(rateLimitKey("2001:db8::1")).toBe(rateLimitKey("2001:db8:0:0:9::2"));
  });

  it("memperlakukan IPv4 yang dibungkus IPv6 sebagai IPv4", () => {
    expect(rateLimitKey("::ffff:36.85.1.2")).toBe("36.85.1.2");
  });
});

describe("guardRate untuk IPv6", () => {
  it("menghitung dua alamat dalam /64 yang sama sebagai satu pengunjung", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    headerValues.set("x-real-ip", "2001:db8:1:2::1");
    await guardRate(limiter);
    headerValues.set("x-real-ip", "2001:db8:1:2:abcd::9");
    await expect(guardRate(limiter)).rejects.toThrow("Terlalu banyak percobaan");
  });
});
