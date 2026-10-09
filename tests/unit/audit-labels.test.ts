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

  it("aksi pengelolaan staf punya bahasa manusia", () => {
    expect(auditActionLabel("staff.create")).toBe("menambah staf");
    expect(auditActionLabel("staff.update")).toBe("mengubah data staf");
    expect(auditActionLabel("staff.activate")).toBe("mengaktifkan staf");
    expect(auditActionLabel("staff.deactivate")).toBe("menonaktifkan staf");
    expect(auditActionLabel("staff.account.create")).toBe("membuat akun staf");
    expect(auditActionLabel("staff.account.reset")).toBe("mereset kata sandi staf");
    expect(auditActionLabel("staff.account.email")).toBe("mengganti email staf");
    expect(auditActionLabel("staff.password.change")).toBe("mengganti kata sandi sendiri");
  });
});
