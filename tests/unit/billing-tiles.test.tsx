import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BillingTiles } from "@/components/admin/billing/billing-tiles";
import { renderAdmin } from "./helpers/render-admin";

describe("kotak tagihan di dasbor", () => {
  it("resepsionis melihat Perlu ditagih", () => {
    renderAdmin(<BillingTiles billable={3} unpaid={null} />);
    const tile = screen.getByRole("link", { name: /Perlu ditagih/ });
    expect(tile).toHaveAttribute("href", "/admin/tagihan");
    expect(tile).toHaveTextContent("3");
    expect(screen.queryByText("Tagihan belum lunas")).toBeNull();
  });

  it("Admin Keuangan melihat Tagihan belum lunas", () => {
    renderAdmin(<BillingTiles billable={null} unpaid={{ count: 2, balance: 170000 }} />);
    const tile = screen.getByRole("link", { name: /Tagihan belum lunas/ });
    expect(tile).toHaveAttribute("href", "/admin/tagihan?lihat=BELUM_LUNAS");
    expect(tile).toHaveTextContent("Rp 170.000");
  });

  it("tanpa keduanya tidak merender apa pun", () => {
    const { container } = renderAdmin(<BillingTiles billable={null} unpaid={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
