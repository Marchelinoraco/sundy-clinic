import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardNumbersCard } from "@/components/admin/dashboard-numbers";
import type { DashboardNumbers } from "@/server/dashboard";
import { renderAdmin } from "../helpers/render-admin";

const numbers: DashboardNumbers = {
  period: "minggu",
  label: "Sen, 10 Feb – Rab, 12 Feb",
  previousLabel: "minggu lalu",
  current: {
    bookings: 23,
    bySource: { SITUS: 9, WHATSAPP: 10, TELEPON: 2, WALK_IN: 2 },
    newPatients: 6,
    noShow: 1,
    cancelled: 2,
    expired: 0,
    feeReceived: 1500000,
  },
  previous: {
    bookings: 19,
    bySource: { SITUS: 8, WHATSAPP: 8, TELEPON: 2, WALK_IN: 1 },
    newPatients: 6,
    noShow: 0,
    cancelled: 1,
    expired: 1,
    feeReceived: 1700000,
  },
};

describe("DashboardNumbersCard (spec D 4.5)", () => {
  it("angka periode dengan selisih terhadap pembanding", () => {
    renderAdmin(<DashboardNumbersCard numbers={numbers} />);
    const card = screen.getByRole("region", { name: "Angka" });
    expect(card).toHaveTextContent("Sen, 10 Feb – Rab, 12 Feb");
    expect(within(card).getByText("Booking").parentElement).toHaveTextContent("23+4 dibanding minggu lalu");
    expect(within(card).getByText("Pasien baru").parentElement).toHaveTextContent("6sama dibanding minggu lalu");
    expect(within(card).getByText("Biaya booking masuk").parentElement).toHaveTextContent("Rp 1.500.000−200.000 dibanding minggu lalu");
    expect(card).toHaveTextContent("Situs 9 · WhatsApp 10 · Telepon 2 · Walk-in 2");
    expect(card).toHaveTextContent("Tidak hadir 1 · Dibatalkan 2 · Kedaluwarsa 0");
    expect(within(card).getByRole("img", { name: "Grafik booking per sumber: Situs 9, WhatsApp 10, Telepon 2, Walk-in 2" })).toBeInTheDocument();
  });

  it("pilihan periode sebagai tautan", () => {
    renderAdmin(<DashboardNumbersCard numbers={numbers} />);
    const nav = screen.getByRole("navigation", { name: "Periode angka" });
    expect(within(nav).getByRole("link", { name: "Minggu ini" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Bulan ini" })).toHaveAttribute("href", "/admin?periode=bulan");
  });
});
