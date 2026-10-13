import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationPage from "@/app/(public)/daftar/page";
import { CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";

const { OPTIONS } = vi.hoisted(() => ({
  OPTIONS: {
    branches: [],
    consultation: { id: "s1", name: "Konsultasi Dokter", promoPrice: null, durationMin: 30, requiresDoctor: true },
    treatments: [],
    staff: [],
    bookingFee: 100000,
  },
}));

vi.mock("@/server/public-booking-data", () => ({ getBookingOptions: vi.fn().mockResolvedValue(OPTIONS) }));
const { session } = vi.hoisted(() => ({ session: { staff: null as null | { name: string } } }));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => session.staff) }));
vi.mock("@/components/pendaftaran/registration-flow", () => ({
  RegistrationFlow: () => <div data-testid="registration-flow" />,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  session.staff = null;
});

describe("halaman Daftar: ditutup sementara (REGISTRATION_CLOSED)", () => {
  it("terbuka seperti biasa bila REGISTRATION_CLOSED tidak diisi", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "");
    render(await RegistrationPage());
    expect(screen.getByTestId("registration-flow")).toBeInTheDocument();
  });

  it("menampilkan pesan dan nomor WhatsApp, tanpa form, bila REGISTRATION_CLOSED=true", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "true");
    render(await RegistrationPage());
    expect(screen.queryByTestId("registration-flow")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pendaftaran online sedang diperbaiki");
    const link = screen.getByRole("link", { name: /whatsapp/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("wa.me/6285172228900"));
    expect(screen.getByText(new RegExp(CLINIC_WHATSAPP_DISPLAY))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pasien|berobat/i);
  });

  it("REGISTRATION_CLOSED=staff: staf yang login melihat form dengan pemberitahuan uji coba", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "staff");
    session.staff = { name: "Staf Uji" };
    render(await RegistrationPage());
    expect(screen.getByTestId("registration-flow")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Mode uji coba: hanya staf yang login yang melihat formulir ini. Booking yang dibuat tercatat sungguhan.",
    );
  });

  it("REGISTRATION_CLOSED=staff: pengunjung tanpa login melihat pesan tutup, tanpa form", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "staff");
    render(await RegistrationPage());
    expect(screen.queryByTestId("registration-flow")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pendaftaran online sedang diperbaiki");
  });

  it("form terbuka untuk umum tidak menampilkan pemberitahuan uji coba", async () => {
    vi.stubEnv("REGISTRATION_CLOSED", "");
    render(await RegistrationPage());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
