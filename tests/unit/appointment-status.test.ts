import { describe, expect, it } from "vitest";
import { APPOINTMENT_STATUSES, isAppointmentStatus, STATUS_LABEL } from "@/lib/appointment-status";

describe("status janji temu", () => {
  it("punya label untuk setiap status", () => {
    for (const status of APPOINTMENT_STATUSES) expect(STATUS_LABEL[status]).toBeTruthy();
  });

  it("mengenali nilai status dari parameter URL", () => {
    expect(isAppointmentStatus("TERKONFIRMASI")).toBe(true);
    expect(isAppointmentStatus("HAPUS_SEMUA")).toBe(false);
    expect(isAppointmentStatus(undefined)).toBe(false);
  });
});
