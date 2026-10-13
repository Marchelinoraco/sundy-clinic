import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/server/same-origin";

const request = (headers: Record<string, string>) => new Request("https://sundyclinic.com/admin/staf/foto", { method: "POST", headers });

describe("asal permintaan", () => {
  it("sama bila host Origin sama dengan header host", () => {
    expect(isSameOrigin(request({ origin: "https://sundyclinic.com", host: "sundyclinic.com" }))).toBe(true);
    expect(isSameOrigin(request({ origin: "http://localhost:3100", host: "localhost:3100" }))).toBe(true);
  });

  it("menolak Origin asing, tanpa Origin, tanpa host, dan Origin yang bukan alamat", () => {
    expect(isSameOrigin(request({ origin: "https://jahat.example", host: "sundyclinic.com" }))).toBe(false);
    expect(isSameOrigin(request({ host: "sundyclinic.com" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "https://sundyclinic.com" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "bukan-alamat", host: "sundyclinic.com" }))).toBe(false);
  });

  it("X-Forwarded-Host dari klien tidak dipercaya", () => {
    expect(isSameOrigin(request({ origin: "https://jahat.example", host: "sundyclinic.com", "x-forwarded-host": "jahat.example" }))).toBe(false);
  });
});
