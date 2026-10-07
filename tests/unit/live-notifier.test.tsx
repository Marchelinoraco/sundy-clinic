import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveNotifier } from "@/components/admin/live-notifier";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const SINCE = "2026-10-08T01:00:00.000Z";
const eventA = { id: "RESEP_BARU:d1:1", kind: "RESEP_BARU", patientName: "Ani Pratiwi", at: "2026-10-08T01:00:05.000Z", entityId: "d1" };
const eventB = { id: "RESEP_BARU:d2:2", kind: "RESEP_BARU", patientName: "Budi Santoso", at: "2026-10-08T01:00:15.000Z", entityId: "d2" };

let oscillators = 0;
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  createOscillator() {
    oscillators += 1;
    return { type: "", frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
  resume() {
    return Promise.resolve();
  }
}

function respond(body: { watching?: boolean; serverTime: string; events: unknown[] }) {
  return { ok: true, json: async () => ({ watching: true, ...body }) } as Response;
}

const tick = async (ms = 10_000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  oscillators = 0;
  localStorage.clear();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pemberitahuan langsung", () => {
  it("memeriksa tiap 10 detik; peristiwa baru memunculkan pop-up, memuat ulang layar, dan tidak diulang", async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ serverTime: "2026-10-08T01:00:20.000Z", events: [eventA] }))
      .mockResolvedValueOnce(respond({ serverTime: "2026-10-08T01:00:30.000Z", events: [eventA, eventB] }));
    render(<LiveNotifier initialSince={SINCE} role="APOTEKER" />);
    expect(fetchMock).not.toHaveBeenCalled();

    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/admin/pemberitahuan?sejak=${encodeURIComponent(SINCE)}`);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("Resep baru: Ani Pratiwi", expect.objectContaining({ description: "Obat perlu disiapkan." }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    // Kursor berikutnya mundur 30 detik dari waktu server; peristiwa lama (A) tidak muncul lagi.
    await tick();
    expect(String(fetchMock.mock.calls[1][0])).toBe(`/admin/pemberitahuan?sejak=${encodeURIComponent("2026-10-08T00:59:50.000Z")}`);
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.toast).toHaveBeenLastCalledWith("Resep baru: Budi Santoso", expect.anything());
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("tanpa peristiwa baru tidak memuat ulang layar; tombol pop-up membuka layar yang tepat", async () => {
    fetchMock.mockResolvedValueOnce(respond({ serverTime: "2026-10-08T01:00:20.000Z", events: [] })).mockResolvedValueOnce(
      respond({ serverTime: "2026-10-08T01:00:30.000Z", events: [eventA] }),
    );
    render(<LiveNotifier initialSince={SINCE} role="APOTEKER" />);
    await tick();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await tick();
    const options = mocks.toast.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(options.action.label).toBe("Buka");
    options.action.onClick();
    expect(mocks.push).toHaveBeenCalledWith("/admin/resep/d1");
  });

  it("berhenti memeriksa bila server menyatakan tidak ada yang diawasi, dan peran tanpa pengawasan tidak memeriksa sama sekali", async () => {
    fetchMock.mockResolvedValue(respond({ watching: false, serverTime: "2026-10-08T01:00:20.000Z", events: [] }));
    const { unmount } = render(<LiveNotifier initialSince={SINCE} role="APOTEKER" />);
    await tick();
    await tick(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Bunyi notifikasi/ })).toBeNull();
    unmount();

    fetchMock.mockClear();
    render(<LiveNotifier initialSince={SINCE} role="DOKTER" />);
    await tick(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Bunyi notifikasi/ })).toBeNull();
  });

  it("tab tersembunyi tidak memeriksa; kembali terlihat langsung memeriksa", async () => {
    fetchMock.mockResolvedValue(respond({ serverTime: "2026-10-08T01:00:20.000Z", events: [] }));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<LiveNotifier initialSince={SINCE} role="APOTEKER" />);
    await tick(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("galat jaringan tidak menghentikan pemeriksaan berikutnya", async () => {
    fetchMock.mockRejectedValueOnce(new Error("putus")).mockResolvedValueOnce(respond({ serverTime: "2026-10-08T01:00:30.000Z", events: [eventA] }));
    render(<LiveNotifier initialSince={SINCE} role="APOTEKER" />);
    await tick();
    expect(mocks.toast).not.toHaveBeenCalled();
    await tick();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("bunyi: hidup bawaan setelah layar disentuh, bisa dimatikan, dan pilihan tersimpan", async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ serverTime: "2026-10-08T01:00:20.000Z", events: [eventA] }))
      .mockResolvedValueOnce(respond({ serverTime: "2026-10-08T01:00:30.000Z", events: [eventB] }));
    render(<LiveNotifier initialSince={SINCE} role="APOTEKER" />);
    expect(screen.getByRole("button", { name: "Bunyi notifikasi hidup" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body); // peramban baru mengizinkan bunyi setelah disentuh
    await tick();
    expect(oscillators).toBeGreaterThan(0);

    const before = oscillators;
    fireEvent.click(screen.getByRole("button", { name: "Bunyi notifikasi hidup" }));
    expect(screen.getByRole("button", { name: "Bunyi notifikasi mati" })).toBeInTheDocument();
    expect(localStorage.getItem("sundy-bunyi")).toBe("mati");
    await tick();
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(oscillators).toBe(before);
  });

  it("pilihan bunyi mati dari sesi sebelumnya dipulihkan", () => {
    localStorage.setItem("sundy-bunyi", "mati");
    render(<LiveNotifier initialSince={SINCE} role="RESEPSIONIS" />);
    expect(screen.getByRole("button", { name: "Bunyi notifikasi mati" })).toBeInTheDocument();
  });
});
