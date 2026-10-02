import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clampParallax, MAX_PARALLAX, Parallax } from "@/components/motion/parallax";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

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
