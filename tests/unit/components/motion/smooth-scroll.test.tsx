import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LENIS_OPTIONS, SmoothScroll, usesNativeScroll } from "@/components/motion/smooth-scroll";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { setMediaMatches } from "../../helpers/browser-mocks";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

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

describe("SmoothScroll di alur kuis dan saat pindah halaman", () => {
  afterEach(() => {
    navigation.pathname = "/";
  });

  it("membiarkan gulir asli di alur kuis, yang tidak diubah redesign ini", () => {
    // Kuis menggulir sendiri ke atas setiap ganti langkah, dan punya kolom teks yang bisa digulir.
    setMediaMatches(FINE_POINTER_QUERY, true);
    for (const path of ["/daftar", "/cek-booking", "/isi"]) {
      navigation.pathname = path;
      const { unmount } = render(<SmoothScroll />);
      expect(screen.queryByTestId("lenis"), path).not.toBeInTheDocument();
      unmount();
    }
    navigation.pathname = "/layanan";
    render(<SmoothScroll />);
    expect(screen.getByTestId("lenis")).toBeInTheDocument();
  });

  it("mengenali alur kuis beserta turunannya, tanpa ikut menangkap halaman lain", () => {
    expect(usesNativeScroll("/daftar")).toBe(true);
    expect(usesNativeScroll("/isi/kode")).toBe(true);
    expect(usesNativeScroll("/daftarkan")).toBe(false);
    expect(usesNativeScroll("/")).toBe(false);
  });

  it("menghentikan sisa luncuran saat pindah halaman, dan menyerahkan gulir ke elemen yang bisa digulir sendiri", () => {
    // Tanpa ini, luncuran gulir halaman lama menimpa gulir-ke-atas Next di halaman baru.
    expect(LENIS_OPTIONS.stopInertiaOnNavigate).toBe(true);
    expect(LENIS_OPTIONS.allowNestedScroll).toBe(true);
  });
});
