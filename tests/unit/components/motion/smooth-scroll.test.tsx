import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LENIS_OPTIONS, SmoothScroll } from "@/components/motion/smooth-scroll";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

vi.mock("lenis/react", () => ({
  ReactLenis: ({ root }: { root?: boolean }) => <div data-testid="lenis" data-root={String(root)} />,
}));

describe("SmoothScroll", () => {
  it("memasang gulir halus global di perangkat berkursor", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    render(<SmoothScroll />);
    expect(screen.getByTestId("lenis")).toHaveAttribute("data-root", "true");
  });

  it("membiarkan gulir asli di layar sentuh", () => {
    render(<SmoothScroll />);
    expect(screen.queryByTestId("lenis")).not.toBeInTheDocument();
  });

  it("membiarkan gulir asli bila kurangi gerakan", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    render(<SmoothScroll />);
    expect(screen.queryByTestId("lenis")).not.toBeInTheDocument();
  });

  it("tidak mengambil alih gulir di dalam panel dialog", () => {
    document.body.innerHTML =
      '<div role="dialog"><ul><li id="di-dialog">Menu</li></ul></div><p id="di-luar">Isi</p>';
    expect(LENIS_OPTIONS.prevent(document.getElementById("di-dialog") as HTMLElement)).toBe(true);
    expect(LENIS_OPTIONS.prevent(document.getElementById("di-luar") as HTMLElement)).toBe(false);
    expect(LENIS_OPTIONS.syncTouch).toBe(false);
  });
});
