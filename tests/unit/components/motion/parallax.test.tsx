import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampParallax, MAX_PARALLAX, Parallax, parallaxOffset } from "@/components/motion/parallax";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { mockElementTop, setMediaMatches } from "../../helpers/browser-mocks";

describe("clampParallax", () => {
  it("membatasi pergeseran paling jauh 60 px ke dua arah", () => {
    expect(MAX_PARALLAX).toBe(60);
    expect(clampParallax(30)).toBe(30);
    expect(clampParallax(100)).toBe(60);
    expect(clampParallax(-90)).toBe(-60);
  });
});

describe("Parallax", () => {
  it("tidak menggeser isi bila kurangi gerakan", () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    render(
      <Parallax distance={40}>
        <p>Foto</p>
      </Parallax>,
    );
    const wrapper = screen.getByText("Foto").parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute("data-parallax", "mati");
    expect(wrapper.style.transform).toBe("");
  });

  it("menggeser isi mengikuti gulir bila gerak diizinkan", () => {
    render(
      <Parallax distance={40}>
        <p>Foto</p>
      </Parallax>,
    );
    expect(screen.getByText("Foto").parentElement).toHaveAttribute("data-parallax", "aktif");
  });
});

describe("parallaxOffset", () => {
  // Layar setinggi 800 px, elemen setinggi 200 px, pergeseran terjauh 40 px.
  it("bergeser +jarak saat elemen baru masuk dari bawah dan -jarak saat keluar di atas", () => {
    expect(parallaxOffset(800, 200, 800, 40)).toBe(40);
    expect(parallaxOffset(-200, 200, 800, 40)).toBe(-40);
  });

  it("tidak bergeser saat elemen tepat di tengah perjalanannya melintasi layar", () => {
    expect(parallaxOffset(300, 200, 800, 40)).toBe(0);
  });

  it("tetap di batasnya saat elemen jauh di luar layar", () => {
    expect(parallaxOffset(5000, 200, 800, 40)).toBe(40);
    expect(parallaxOffset(-5000, 200, 800, 40)).toBe(-40);
  });
});

describe("Parallax saat digulir", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("menggeser isi mengikuti posisinya di layar, dengan gerak transform saja", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    mockElementTop(800);
    render(
      <Parallax distance={40}>
        <p>Foto</p>
      </Parallax>,
    );
    const wrapper = screen.getByText("Foto").parentElement as HTMLElement;
    // mockElementTop memberi tinggi 100 px: di tepi bawah layar, isi bergeser +40 px.
    expect(wrapper.style.transform).toBe("translate3d(0, 40px, 0)");

    // Posisi tanpa geseran dihitung dari posisi terukur dikurangi geseran yang sedang dipakai.
    mockElementTop(390);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(wrapper.style.transform).toBe("translate3d(0, 0px, 0)");
  });
});
