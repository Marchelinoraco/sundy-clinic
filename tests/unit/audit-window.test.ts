import { describe, expect, it } from "vitest";
import { auditActionLabel, auditRoleLabel } from "@/lib/audit-labels";
import { AUDIT_REPEAT_WINDOW_MS, shouldRecordRepeat } from "@/lib/audit-window";

describe("shouldRecordRepeat", () => {
  const now = new Date("2026-10-01T03:00:00Z");

  it("mencatat bila belum pernah ada baris", () => {
    expect(shouldRecordRepeat(null, now)).toBe(true);
  });

  it("tidak mencatat lagi dalam 30 menit, dan mencatat tepat setelahnya", () => {
    expect(shouldRecordRepeat(new Date(now.getTime() - AUDIT_REPEAT_WINDOW_MS + 1), now)).toBe(false);
    expect(shouldRecordRepeat(new Date(now.getTime() - AUDIT_REPEAT_WINDOW_MS), now)).toBe(true);
  });
});

describe("label jejak catatan", () => {
  it("menerjemahkan aksi dan peran, dan membiarkan yang tidak dikenal apa adanya", () => {
    expect(auditActionLabel("encounter.view")).toBe("membuka");
    expect(auditActionLabel("encounter.finalize")).toBe("memfinalisasi");
    expect(auditActionLabel("lain.aksi")).toBe("lain.aksi");
    expect(auditRoleLabel("DOKTER")).toBe("Dokter");
    expect(auditRoleLabel("SUPER_ADMIN")).toBe("Super Admin");
  });
});
