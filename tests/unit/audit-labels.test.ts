import { describe, expect, it } from "vitest";
import { auditActionLabel } from "@/lib/audit-labels";

describe("label aksi audit", () => {
  it("aksi BIA punya bahasa manusia, aksi tak dikenal ditampilkan apa adanya", () => {
    expect(auditActionLabel("bia.upload")).toBe("mengunggah hasil BIA");
    expect(auditActionLabel("bia.numbers.save")).toBe("menyimpan angka BIA");
    expect(auditActionLabel("bia.void")).toBe("membatalkan pengukuran BIA");
    expect(auditActionLabel("bia.file.void")).toBe("membatalkan berkas BIA");
    expect(auditActionLabel("bia.view")).toBe("membuka berkas BIA");
    expect(auditActionLabel("aksi.baru")).toBe("aksi.baru");
  });
});
