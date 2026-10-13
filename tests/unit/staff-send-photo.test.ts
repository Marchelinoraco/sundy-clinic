import { afterEach, describe, expect, it, vi } from "vitest";
import { sendStaffPhoto } from "@/components/admin/staff/send-photo";

const file = (size = 10, name = "dokter.png") => new File([new Uint8Array(size)], name, { type: "image/png" });
afterEach(() => vi.unstubAllGlobals());

describe("mengirim foto staf", () => {
  it("mengirim id staf dan berkas ke rute unggah dan mengembalikan alamat fotonya", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, photoUrl: "/foto-dokter/abc-0a1b2c3d.webp" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: true, photoUrl: "/foto-dokter/abc-0a1b2c3d.webp" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/staf/foto");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("staffId")).toBe("s1");
    expect((body.get("file") as File).name).toBe("dokter.png");
  });

  it("meneruskan pesan penolakan server, dan pesan umum bila jawaban bukan JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." }, { status: 422 })));
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: false, error: "Gagal mengunggah. Coba lagi." });
  });

  it("menolak berkas di atas 8 MB tanpa mengirimnya, dan melaporkan koneksi terputus", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendStaffPhoto("s1", file(8 * 1024 * 1024 + 1))).toEqual({ ok: false, error: "Foto terlalu besar (maks. 8 MB)." });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await sendStaffPhoto("s1", file())).toEqual({ ok: false, error: "Koneksi terputus. Coba lagi." });
  });
});
