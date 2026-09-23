import { describe, expect, it } from "vitest";
import {
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
