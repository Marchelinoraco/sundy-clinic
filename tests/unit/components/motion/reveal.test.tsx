import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { mockElementTop, setMediaMatches, triggerIntersection } from "../../helpers/browser-mocks";

afterEach(() => vi.restoreAllMocks());

function renderReveal(delay?: number) {
  render(
    <Reveal delay={delay}>
      <p>Isi kartu</p>
    </Reveal>,
  );
  return screen.getByText("Isi kartu").parentElement as HTMLElement;
}

describe("Reveal", () => {
  it("membiarkan elemen yang sudah terlihat saat halaman dibuka", () => {
    mockElementTop(120);
    expect(renderReveal()).toHaveAttribute("data-reveal", "static");
  });

  it("tidak menyembunyikan elemen di atas layar, misalnya saat halaman dimuat ulang di tengah", () => {
    mockElementTop(-900);
    expect(renderReveal()).toHaveAttribute("data-reveal", "static");
  });

  it("menyembunyikan elemen di bawah layar lalu memunculkannya sekali saat masuk layar", () => {
    mockElementTop(2000);
    const element = renderReveal();
    expect(element).toHaveAttribute("data-reveal", "armed");

    act(() => triggerIntersection(element, true));
    expect(element).toHaveAttribute("data-reveal", "shown");

    // Sekali saja: keluar layar lagi tidak menyembunyikannya kembali.
    act(() => triggerIntersection(element, false));
    expect(element).toHaveAttribute("data-reveal", "shown");
  });

  it("langsung menampilkan keadaan akhir bila pengunjung memilih kurangi gerakan", () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    mockElementTop(2000);
    expect(renderReveal()).toHaveAttribute("data-reveal", "static");
  });

  it("menampilkan elemen yang sedang menunggu begitu kurangi gerakan dinyalakan", () => {
    mockElementTop(2000);
    const element = renderReveal();
    expect(element).toHaveAttribute("data-reveal", "armed");

    act(() => setMediaMatches(REDUCED_MOTION_QUERY, true));
    expect(element).toHaveAttribute("data-reveal", "static");
  });

  it("tetap terlihat bila kurangi gerakan dinyalakan lalu dimatikan setelah elemen tergulir masuk", () => {
    mockElementTop(2000);
    const element = renderReveal();
    act(() => setMediaMatches(REDUCED_MOTION_QUERY, true));
    expect(element).toHaveAttribute("data-reveal", "static");

    // Pengunjung menggulir ke elemen itu, lalu mematikan kurangi gerakan lagi.
    mockElementTop(100);
    act(() => setMediaMatches(REDUCED_MOTION_QUERY, false));
    expect(element).toHaveAttribute("data-reveal", "static");
  });

  it("memberi jeda bergiliran saat elemen muncul", () => {
    mockElementTop(2000);
    const element = renderReveal(140);
    act(() => triggerIntersection(element, true));
    expect(element.style.transitionDelay).toBe("140ms");
  });
});

describe("staggerDelay", () => {
  it("menambah 70 ms per kartu dan berhenti di kartu ketujuh", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(140);
    expect(staggerDelay(6)).toBe(420);
    expect(staggerDelay(20)).toBe(420);
  });
});
