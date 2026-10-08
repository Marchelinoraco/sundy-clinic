import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardWork } from "@/components/admin/dashboard-work";
import { renderAdmin } from "../helpers/render-admin";

const WORK = {
  pending: 3,
  pendingOverdue: 1,
  messages: { confirm: 1, remind: 2 },
  today: { total: 8, unfilledIntakes: 2, attended: 3, noShow: 1 },
};

describe("DashboardWork (spec D 4.2)", () => {
  it("empat kotak bertautan dengan keterangannya", () => {
    renderAdmin(<DashboardWork work={WORK} today="2031-02-12" />);
    const pending = screen.getByRole("link", { name: /Menunggu konfirmasi/ });
    expect(pending).toHaveAttribute("href", "/admin/booking");
    expect(pending).toHaveTextContent("1 lewat batas transfer");
    expect(pending).toHaveAttribute("data-attention", "true");

    const messages = screen.getByRole("link", { name: /Pesan WA belum dikirim/ });
    expect(messages).toHaveAttribute("href", "/admin/pengingat");
    expect(messages).toHaveTextContent("3");
    expect(messages).toHaveTextContent("konfirmasi 1 · pengingat 2");

    const today = screen.getByRole("link", { name: /Booking hari ini/ });
    expect(today).toHaveAttribute("href", "/admin/booking?tanggal=2031-02-12");
    expect(today).toHaveTextContent("2 isian belum diisi");
    expect(today).not.toHaveAttribute("data-attention");

    const attended = screen.getByRole("link", { name: /Sudah hadir/ });
    expect(attended).toHaveTextContent("3 / 8");
    expect(attended).toHaveTextContent("1 tidak hadir");
  });

  it("tanpa pekerjaan: tanpa garis emas dan tanpa keterangan kosong", () => {
    renderAdmin(
      <DashboardWork
        work={{ pending: 0, pendingOverdue: 0, messages: { confirm: 0, remind: 0 }, today: { total: 0, unfilledIntakes: 0, attended: 0, noShow: 0 } }}
        today="2031-02-12"
      />,
    );
    expect(screen.getByRole("link", { name: /Menunggu konfirmasi/ })).not.toHaveAttribute("data-attention");
    expect(screen.getByRole("link", { name: /Pesan WA belum dikirim/ })).not.toHaveAttribute("data-attention");
    expect(screen.queryByText(/lewat batas transfer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/isian belum diisi/)).not.toBeInTheDocument();
  });
});
