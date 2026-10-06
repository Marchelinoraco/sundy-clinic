import { describe, expect, it } from "vitest";
import { parseStaffRole, STAFF_ROLE_LABEL } from "@/lib/staff-role";

describe("peran staf", () => {
  it("label untuk semua peran, termasuk Apoteker dan Admin Keuangan", () => {
    expect(STAFF_ROLE_LABEL.APOTEKER).toBe("Apoteker");
    expect(STAFF_ROLE_LABEL.ADMIN_KEUANGAN).toBe("Admin Keuangan");
    expect(STAFF_ROLE_LABEL.SUPER_ADMIN).toBe("Super Admin");
  });

  it("argumen peran skrip create-admin: kosong berarti Super Admin, huruf kecil diterima, nilai asing ditolak", () => {
    expect(parseStaffRole(undefined)).toBe("SUPER_ADMIN");
    expect(parseStaffRole("")).toBe("SUPER_ADMIN");
    expect(parseStaffRole("apoteker")).toBe("APOTEKER");
    expect(parseStaffRole(" ADMIN_KEUANGAN ")).toBe("ADMIN_KEUANGAN");
    expect(parseStaffRole("KASIR")).toBeNull();
  });
});
