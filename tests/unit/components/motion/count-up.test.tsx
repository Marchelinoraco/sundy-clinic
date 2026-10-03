import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp, countUpValue } from "@/components/motion/count-up";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { mockElementTop, setMediaMatches, triggerIntersection } from "../../helpers/browser-mocks";

describe("countUpValue", () => {
  it("mulai dari 0 dan berakhir tepat di nilai akhir", () => {
    expect(countUpValue(0, 700)).toBe(0);
    expect(countUpValue(1, 700)).toBe(700);
    expect(countUpValue(1.4, 700)).toBe(700);
    expect(countUpValue(-1, 700)).toBe(0);
  });

  it("naik cepat di awal lalu melambat menjelang akhir", () => {
    expect(countUpValue(0.5, 700)).toBeGreaterThan(350);
    expect(countUpValue(0.5, 700)).toBeLessThan(700);
  });
});

describe("CountUp", () => {
  beforeEach(() => {
    // Bingkai animasi dijalankan per 16 ms supaya uji tidak bergantung pada rAF jsdom.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("merender nilai akhir sejak awal untuk angka yang sudah terlihat", () => {
    mockElementTop(100);
    render(<CountUp value={700} suffix="+" />);
    expect(screen.getByText("700+")).toBeInTheDocument();
  });

  it("menghitung dari 0 sampai nilai akhir, dengan akhiran, setelah masuk layar", async () => {
    mockElementTop(2000);
    const { container } = render(<CountUp value={700} suffix="+" durationMs={60} />);
    const number = container.firstElementChild as HTMLElement;
    expect(screen.getByText("0+")).toHaveAttribute("aria-hidden", "true");

    act(() => triggerIntersection(number, true));
    await waitFor(() => expect(number.textContent).toBe("700+"));
  });

  it("langsung bernilai akhir bila kurangi gerakan", () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    mockElementTop(2000);
    render(<CountUp value={35} />);
    expect(screen.getByText("35")).toBeInTheDocument();
  });

  it("langsung bernilai akhir bila kurangi gerakan dinyalakan sebelum angka terlihat", () => {
    mockElementTop(2000);
    const { container } = render(<CountUp value={700} suffix="+" />);
    expect(screen.getByText("0+")).toBeInTheDocument();

    act(() => setMediaMatches(REDUCED_MOTION_QUERY, true));
    expect(container.firstElementChild?.textContent).toBe("700+");
  });

  it("membacakan nilai akhir ke pembaca layar selama angka belum selesai berhitung", () => {
    // Pembaca layar bisa sampai di angka ini tanpa menggulir layar; "0+ customer" adalah informasi salah.
    mockElementTop(2000);
    render(<CountUp value={700} suffix="+" />);
    expect(screen.getByText("0+")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("700+")).toHaveClass("sr-only");
  });
});
