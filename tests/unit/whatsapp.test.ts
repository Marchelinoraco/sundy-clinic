import { describe, expect, it } from "vitest";
import {
  appointmentConfirmationMessage,
  branchNotifyMessage,
  buildWhatsAppLink,
  productInquiryMessage,
  serviceInquiryMessage,
} from "@/lib/whatsapp";

describe("buildWhatsAppLink", () => {
  it("menunjuk ke nomor resmi klinik", () => {
    expect(buildWhatsAppLink("Halo")).toMatch(/^https:\/\/wa\.me\/6285172228900\?text=/);
  });

  it("mengkodekan spasi dan karakter khusus", () => {
    const link = buildWhatsAppLink("Halo SunDY & Clinic");
    expect(link).toContain("Halo%20SunDY%20%26%20Clinic");
  });

  it("mengkodekan baris baru", () => {
    expect(buildWhatsAppLink("baris satu\nbaris dua")).toContain("%0A");
  });
});

describe("pesan terisi otomatis", () => {
  it("menyebut nama produk", () => {
    expect(productInquiryMessage("Kapsul M")).toBe(
      "Halo SunDY Clinic, saya ingin memesan produk Kapsul M. Mohon informasinya.",
    );
  });

  it("menyebut nama layanan", () => {
    expect(serviceInquiryMessage("HIFU Wajah")).toBe(
      "Halo SunDY Clinic, saya ingin bertanya tentang treatment HIFU Wajah.",
    );
  });

  it("menyebut nama cabang yang ditunggu", () => {
    expect(branchNotifyMessage("SunDY Citraland")).toBe(
      "Halo SunDY Clinic, mohon beri tahu saya saat cabang SunDY Citraland sudah buka.",
    );
  });
});

describe("appointmentConfirmationMessage", () => {
  it("menyusun teks siap-salin sesuai contoh pada PRD F5", () => {
    const message = appointmentConfirmationMessage({
      patientName: "Siti Rahayu",
      code: "SDY-8F3K",
      staffName: "Dr. Diane Paparang, Sp.GK, AIFO-K",
      branchName: "Mahakeret",
      dateLabel: "Kamis, 25 Sep 2026",
      timeLabel: "15.00",
    });

    expect(message).toBe(
      "Halo SunDY Clinic, saya sudah booking konsultasi. Kode: SDY-8F3K, atas nama Siti Rahayu, " +
        "dengan Dr. Diane Paparang, Sp.GK, AIFO-K di cabang Mahakeret, Kamis, 25 Sep 2026 pukul 15.00. " +
        "Berikut bukti transfernya.",
    );
  });
});
