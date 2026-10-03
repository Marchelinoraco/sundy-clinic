import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FINE_POINTER_QUERY,
  REDUCED_MOTION_QUERY,
  useFinePointer,
  usePrefersReducedMotion,
} from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

function Probe() {
  const reduce = usePrefersReducedMotion();
  const fine = useFinePointer();
  return <p>{`kurangi:${reduce} kursor:${fine}`}</p>;
}

describe("preferensi gerak", () => {
  it("mengikuti media query dan berubah saat setelan pengunjung berubah", () => {
    render(<Probe />);
    expect(screen.getByText("kurangi:false kursor:false")).toBeInTheDocument();

    act(() => {
      setMediaMatches(REDUCED_MOTION_QUERY, true);
      setMediaMatches(FINE_POINTER_QUERY, true);
    });
    expect(screen.getByText("kurangi:true kursor:true")).toBeInTheDocument();
  });

  it("merender keadaan tanpa gerak dan tanpa kursor di server", () => {
    expect(renderToString(<Probe />)).toContain("kurangi:true kursor:false");
  });
});
