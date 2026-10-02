import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Magnetic, magneticOffset } from "@/components/motion/magnetic";
import { Tilt, tiltAngles } from "@/components/motion/tilt";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

describe("magneticOffset", () => {
  const rect = { left: 100, top: 100, width: 200, height: 50 };

  it("tidak bergeser saat kursor tepat di tengah tombol", () => {
    expect(magneticOffset(rect, 200, 125)).toEqual({ x: 0, y: 0 });
  });

  it("bergeser sebanding jarak kursor dari tengah", () => {
    expect(magneticOffset(rect, 250, 125)).toEqual({ x: 4, y: 0 });
  });

  it("bergeser paling jauh 8 px walau kursor jauh di luar tombol", () => {
    expect(magneticOffset(rect, 300, 150)).toEqual({ x: 8, y: 8 });
    expect(magneticOffset(rect, 900, -400)).toEqual({ x: 8, y: -8 });
  });
});

describe("tiltAngles", () => {
  const rect = { left: 0, top: 0, width: 200, height: 100 };

  it("datar saat kursor di tengah kartu", () => {
    expect(tiltAngles(rect, 100, 50)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it("miring paling jauh 6 derajat di sudut kartu", () => {
    expect(tiltAngles(rect, 200, 0)).toEqual({ rotateX: 6, rotateY: 6 });
    expect(tiltAngles(rect, 0, 100)).toEqual({ rotateX: -6, rotateY: -6 });
    expect(tiltAngles(rect, 900, -300)).toEqual({ rotateX: 6, rotateY: 6 });
  });
});

describe("gerak mengikuti kursor", () => {
  it("mati di layar sentuh", () => {
    render(
      <>
        <Magnetic>
          <button type="button">Daftar</button>
        </Magnetic>
        <Tilt>
          <p>Kartu</p>
        </Tilt>
      </>,
    );
    const magnet = screen.getByRole("button").parentElement as HTMLElement;
    fireEvent.pointerMove(magnet, { clientX: 300, clientY: 150 });
    expect(magnet).toHaveAttribute("data-magnetic", "mati");
    expect(magnet.style.transform).toBe("");
    expect(screen.getByText("Kartu").parentElement).toHaveAttribute("data-tilt", "mati");
  });

  it("mati bila kurangi gerakan walau ada kursor", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    render(
      <Magnetic>
        <button type="button">Daftar</button>
      </Magnetic>,
    );
    expect(screen.getByRole("button").parentElement).toHaveAttribute("data-magnetic", "mati");
  });

  it("aktif di perangkat berkursor", () => {
    setMediaMatches(FINE_POINTER_QUERY, true);
    render(
      <>
        <Magnetic>
          <button type="button">Daftar</button>
        </Magnetic>
        <Tilt>
          <p>Kartu</p>
        </Tilt>
      </>,
    );
    expect(screen.getByRole("button").parentElement).toHaveAttribute("data-magnetic", "aktif");
    expect(screen.getByText("Kartu").parentElement).toHaveAttribute("data-tilt", "aktif");
  });
});
