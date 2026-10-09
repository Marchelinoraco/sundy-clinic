import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingSummary, bookingSummaryItems } from "@/components/admin/booking-summary";
import { renderAdmin } from "../helpers/render-admin";

const empty = {
  patientName: null,
  serviceName: null,
  startAt: null,
  staffName: null,
  branchName: null,
  source: "WHATSAPP" as const,
  bookingFee: 100000,
};

describe("ringkasan Booking Baru", () => {
  it("baris yang belum diisi bertuliskan belum dipilih; sumber dan biaya selalu terisi", () => {
    renderAdmin(<BookingSummary items={bookingSummaryItems(empty)} />);
    const values = Object.fromEntries(
      screen.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(values).toEqual({
      Pasien: "belum dipilih",
      Layanan: "belum dipilih",
      Jadwal: "belum dipilih",
      Tenaga: "belum dipilih",
      Cabang: "belum dipilih",
      Sumber: "WhatsApp",
      "Biaya booking": "Rp 100.000",
    });
  });

  it("terisi bertahap", () => {
    const items = bookingSummaryItems({
      ...empty,
      patientName: "Maria Wenas",
      serviceName: "Konsultasi Dokter",
      startAt: new Date("2026-10-05T03:30:00Z"),
      staffName: "dr. Diane",
      branchName: "SunDY Mahakeret",
      source: "TELEPON",
    });
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ["Pasien", "Maria Wenas"],
      ["Layanan", "Konsultasi Dokter"],
      ["Jadwal", "Sen, 5 Okt · 11.30"],
      ["Tenaga", "dr. Diane"],
      ["Cabang", "SunDY Mahakeret"],
      ["Sumber", "Telepon"],
      ["Biaya booking", "Rp 100.000"],
    ]);
  });

  it("walk-in tanpa biaya booking", () => {
    const fee = bookingSummaryItems({ ...empty, source: "WALK_IN" }).find((item) => item.label === "Biaya booking");
    expect(fee?.value).toBe("tanpa biaya booking");
  });
});
