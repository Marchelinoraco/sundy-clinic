import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";

describe("WhatsAppFab", () => {
  it("menautkan ke WhatsApp klinik dengan pesan terisi", () => {
    render(<WhatsAppFab />);
    const link = screen.getByRole("link", { name: /chat via whatsapp/i });
    expect(link.getAttribute("href")).toContain("https://wa.me/6285172228900?text=");
  });

  it("membuka di tab baru dengan rel yang aman", () => {
    render(<WhatsAppFab />);
    const link = screen.getByRole("link", { name: /chat via whatsapp/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
