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

  it("aksi foto staf punya bahasa manusia", () => {
    expect(auditActionLabel("staff.photo.update")).toBe("mengganti foto staf");
    expect(auditActionLabel("staff.photo.remove")).toBe("menghapus foto staf");
  });

  it("aksi katalog layanan punya bahasa manusia", () => {
    expect(auditActionLabel("service.create")).toBe("menambah layanan internal");
    expect(auditActionLabel("service.update")).toBe("mengubah layanan internal");
    expect(auditActionLabel("site_service.create")).toBe("menambah layanan situs");
    expect(auditActionLabel("site_service.update")).toBe("mengubah layanan situs");
    expect(auditActionLabel("site_service.activate")).toBe("mengaktifkan layanan situs");
    expect(auditActionLabel("site_service.deactivate")).toBe("menonaktifkan layanan situs");
    expect(auditActionLabel("site_service.photo")).toBe("mengganti foto layanan situs");
  });

  it("aksi karyawan dan penggajian punya bahasa manusia", () => {
    expect(auditActionLabel("employee.create")).toBe("menambah karyawan");
    expect(auditActionLabel("employee.update")).toBe("mengubah data karyawan");
    expect(auditActionLabel("employee.status")).toBe("mengubah status karyawan");
    expect(auditActionLabel("payroll.create")).toBe("membuat penggajian");
    expect(auditActionLabel("payroll.update")).toBe("mengubah penggajian");
    expect(auditActionLabel("payroll.pay")).toBe("membayar gaji");
    expect(auditActionLabel("payroll.void")).toBe("membatalkan pembayaran gaji");
  });
});
