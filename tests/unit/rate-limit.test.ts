import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("mengizinkan sampai batas lalu menolak", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect([1, 2, 3, 4].map(() => limiter.take("1.2.3.4", 1_000))).toEqual([true, true, true, false]);
  });

  it("menghitung setiap kunci secara terpisah", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("b", 0)).toBe(true);
    expect(limiter.take("a", 0)).toBe(false);
  });

  it("mengizinkan lagi setelah jendela waktu lewat", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 59_999)).toBe(false);
    expect(limiter.take("a", 60_000)).toBe(true);
  });

  it("peek melaporkan kunci yang sudah habis tanpa menghitung", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.peek("a", 0)).toBe(true);
    expect(limiter.peek("a", 0)).toBe(true);
    limiter.take("a", 0);
    limiter.take("a", 0);
    expect(limiter.peek("a", 1)).toBe(false);
    expect(limiter.peek("b", 1)).toBe(true);
    expect(limiter.peek("a", 60_000)).toBe(true);
  });

  it("undo mengembalikan satu percobaan terakhir", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.take("a", 0);
    limiter.take("a", 0);
    expect(limiter.peek("a", 1)).toBe(false);
    limiter.undo("a");
    expect(limiter.peek("a", 1)).toBe(true);
    limiter.undo("tidak-ada");
    expect(limiter.take("a", 1)).toBe(true);
    expect(limiter.take("a", 1)).toBe(false);
  });
});
