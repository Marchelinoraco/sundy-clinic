// @vitest-environment node
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(admin)/admin/qz/sertifikat/route";
import { POST } from "@/app/(admin)/admin/qz/tanda-tangan/route";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { state } = vi.hoisted(() => ({ state: { role: null as Role | null } }));
vi.mock("@/server/session", () => ({
  getCurrentStaff: vi.fn(async () => (state.role ? { userId: "u", staffId: "s", name: "Uji", role: state.role, email: "u@uji.test" } : null)),
}));

const ORIGIN = "https://sundyclinic.com";
const CERT = "-----BEGIN CERTIFICATE-----\nUJI\n-----END CERTIFICATE-----\n";
const sign = (body: string, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/qz/tanda-tangan`, { method: "POST", body, headers: { "content-type": "text/plain", ...headers } }));
const certificate = () => GET();

let dir: string;
let publicKey: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sundy-qz-"));
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKey = pair.publicKey;
  await writeFile(path.join(dir, "private-key.pem"), pair.privateKey);
  await writeFile(path.join(dir, "digital-certificate.txt"), CERT);
});
beforeEach(() => {
  state.role = "RESEPSIONIS";
  process.env.QZ_PRIVATE_KEY_FILE = path.join(dir, "private-key.pem");
  process.env.QZ_CERTIFICATE_FILE = path.join(dir, "digital-certificate.txt");
});
afterAll(async () => {
  delete process.env.QZ_PRIVATE_KEY_FILE;
  delete process.env.QZ_CERTIFICATE_FILE;
  await rm(dir, { recursive: true, force: true });
});

describe("sertifikat QZ", () => {
  it("staf yang login mendapat teks sertifikat tanpa cache", async () => {
    const response = await certificate();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CERT);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("tanpa login 401; tanpa berkas 404", async () => {
    state.role = null;
    expect((await certificate()).status).toBe(401);
    state.role = "RESEPSIONIS";
    delete process.env.QZ_CERTIFICATE_FILE;
    expect((await certificate()).status).toBe(404);
  });
});

describe("tanda tangan QZ", () => {
  it("menandatangani teks permintaan dengan SHA512 yang lolos verifikasi kunci publik", async () => {
    const response = await sign("permintaan-qz-123");
    expect(response.status).toBe(200);
    const signature = await response.text();
    expect(createVerify("SHA512").update("permintaan-qz-123").verify(publicKey, signature, "base64")).toBe(true);
  });

  it("menolak tanpa login, tanpa invoice:manage, dan dari asal lain", async () => {
    state.role = null;
    expect((await sign("x")).status).toBe(401);
    state.role = "ADMIN_KEUANGAN";
    expect((await sign("x")).status).toBe(403);
    state.role = "RESEPSIONIS";
    expect((await sign("x", { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await sign("x", { host: "sundyclinic.com" })).status).toBe(403);
  });

  it("badan kosong atau lebih dari 8 KB ditolak", async () => {
    expect((await sign("")).status).toBe(400);
    expect((await sign("a".repeat(8 * 1024 + 1))).status).toBe(413);
  });

  it("tanpa kunci 404 (QZ Tray jatuh ke mode tanpa tanda tangan)", async () => {
    delete process.env.QZ_PRIVATE_KEY_FILE;
    expect((await sign("x")).status).toBe(404);
    process.env.QZ_PRIVATE_KEY_FILE = path.join(dir, "tidak-ada.pem");
    expect((await sign("x")).status).toBe(404);
  });
});
