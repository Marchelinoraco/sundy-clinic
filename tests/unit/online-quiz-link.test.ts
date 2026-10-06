import { describe, expect, it } from "vitest";
import { quizLinkMessageText } from "@/lib/booking-messages";
import { quizLinkState, type QuizLinkBooking } from "@/lib/quiz-link";
import { combineWitaDateAndMinutes } from "@/lib/time";

const NOW = combineWitaDateAndMinutes("2026-10-06", 10 * 60);
const online: QuizLinkBooking = {
  source: "WHATSAPP",
  status: "TERKONFIRMASI",
  // Rentang pertama sudah mulai: resepsionis boleh membuatnya (spec 3.2).
  startAt: combineWitaDateAndMinutes("2026-10-06", 9 * 60),
  patientId: "p1",
  intake: null,
  channel: "ONLINE",
};

describe("link kuis untuk booking online", () => {
  it("tetap terbuka walau awal rentang pertama sudah lewat, selama booking aktif", () => {
    expect(quizLinkState(online, NOW)).toBe("OPEN");
    expect(quizLinkState(online, NOW, combineWitaDateAndMinutes("2026-10-06", 9 * 60 + 30))).toBe("OPEN");
  });

  it("tertutup setelah konsultasi dimulai atau dibatalkan", () => {
    expect(quizLinkState({ ...online, status: "HADIR" }, NOW)).toBe("CLOSED");
    expect(quizLinkState({ ...online, status: "DIBATALKAN" }, NOW)).toBe("CLOSED");
  });

  it("booking klinik tetap tertutup di jam mulainya", () => {
    expect(quizLinkState({ ...online, channel: "KLINIK" }, NOW)).toBe("CLOSED");
  });

  it("pesan WA link kuis online tidak menyebut jam janji temu", () => {
    const text = quizLinkMessageText({
      patientName: "Siti Rahayu",
      serviceName: "Konsultasi Online",
      startAt: online.startAt,
      link: "https://sundyclinic.com/isi#x",
      online: true,
    });
    expect(text).toContain("Sebelum konsultasi online");
    expect(text).toContain("https://sundyclinic.com/isi#x");
    expect(text).not.toMatch(/Oktober|09\.00/);
  });
});
