import { act, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StickyBookingBar } from "@/components/public/sticky-booking-bar";
import { triggerIntersection } from "../helpers/browser-mocks";

const WHATSAPP = "https://wa.me/6285172228900?text=Halo";

function renderBar() {
  render(
    <>
      <div id="aksi-booking">Tombol utama</div>
      <StickyBookingBar watchId="aksi-booking" price="Rp 499.000" whatsappHref={WHATSAPP} />
    </>,
  );
  return {
    bar: document.querySelector("[data-sticky-booking-bar]") as HTMLElement,
    actions: document.getElementById("aksi-booking") as HTMLElement,
  };
}

describe("StickyBookingBar", () => {
  it("dipasang di body dan tersembunyi selama tombol utama belum tergulir lewat", () => {
    const { bar } = renderBar();
    expect(bar.parentElement).toBe(document.body);
    expect(bar).toHaveAttribute("data-visible", "false");
    expect(bar).toHaveAttribute("inert");
  });

  it("tampil setelah tombol utama tergulir lewat ke atas, berisi harga, Daftar, dan WhatsApp", () => {
    const { bar, actions } = renderBar();
    act(() => triggerIntersection(actions, false, { top: -240 }));

    expect(bar).toHaveAttribute("data-visible", "true");
    expect(bar).not.toHaveAttribute("inert");
    expect(within(bar).getByText("Rp 499.000")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Daftar" })).toHaveAttribute("href", "/daftar");
    expect(within(bar).getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", WHATSAPP);
  });

  it("tidak tampil saat tombol utama masih di bawah layar", () => {
    const { bar, actions } = renderBar();
    act(() => triggerIntersection(actions, false, { top: 900 }));
    expect(bar).toHaveAttribute("data-visible", "false");
  });

  it("tersembunyi lagi saat tombol utama kembali terlihat", () => {
    const { bar, actions } = renderBar();
    act(() => triggerIntersection(actions, false, { top: -240 }));
    act(() => triggerIntersection(actions, true, { top: 200 }));
    expect(bar).toHaveAttribute("data-visible", "false");
  });
});
