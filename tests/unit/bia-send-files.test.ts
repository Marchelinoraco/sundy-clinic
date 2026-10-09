import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBiaFile } from "@/components/admin/bia/send-files";

const file = (size = 10, name = "hasil.png") => new File([new Uint8Array(size)], name, { type: "image/png" });

afterEach(() => vi.unstubAllGlobals());

describe("mengirim berkas BIA", () => {
  it("mengirim satu berkas dan id booking ke rute unggah", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, fileId: "f1" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/bia/unggah");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("appointmentId")).toBe("a1");
    expect((body.get("file") as File).name).toBe("hasil.png");
  });

  it("meneruskan pesan penolakan server, dan pesan umum bila jawaban bukan JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "Jenis berkas tidak didukung." }, { status: 422 })));
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: false, error: "Jenis berkas tidak didukung." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>413</html>", { status: 413 })));
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: false, error: "Gagal mengunggah. Coba lagi." });
  });

  it("menolak berkas di atas 10 MB tanpa mengirimnya, dan melaporkan koneksi terputus", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendBiaFile("a1", file(10 * 1024 * 1024 + 1, "besar.png"))).toEqual({ name: "besar.png", ok: false, error: "Berkas terlalu besar (maks. 10 MB)." });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await sendBiaFile("a1", file())).toEqual({ name: "hasil.png", ok: false, error: "Koneksi terputus. Coba lagi." });
  });
});
