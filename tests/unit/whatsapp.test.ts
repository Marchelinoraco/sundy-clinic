import { describe, expect, it } from "vitest";
import {
  appointmentConfirmationMessage,
  branchNotifyMessage,
  buildWhatsAppLink,
  normalizeWhatsapp,
  productInquiryMessage,
  serviceInquiryMessage,
} from "@/lib/whatsapp";

describe("normalizeWhatsapp", () => {
  it("mengubah awalan 0 menjadi 62", () => {
    expect(normalizeWhatsapp("081234567890")).toBe("6281234567890");
  });

  it("membuang spasi, tanda hubung, tanda kurung, dan tanda plus", () => {
    expect(normalizeWhatsapp("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsapp("(0812) 3456 7890")).toBe("6281234567890");
  });

  it("melengkapi nomor yang diketik tanpa awalan sama sekali", () => {
    expect(normalizeWhatsapp("81234567890")).toBe("6281234567890");
  });

  it("membiarkan nomor yang sudah berawalan 62", () => {
    expect(normalizeWhatsapp("6281234567890")).toBe("6281234567890");
  });

  it("mengembalikan null untuk nomor yang terlalu pendek, terlalu panjang, atau bukan angka", () => {
    expect(normalizeWhatsapp("0812")).toBeNull();
    expect(normalizeWhatsapp("08123456789012345")).toBeNull();
    expect(normalizeWhatsapp("bukan nomor")).toBeNull();
    expect(normalizeWhatsapp("")).toBeNull();
  });
});

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
