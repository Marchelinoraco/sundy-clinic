import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StaffTable } from "@/components/admin/staff-table";
import type { StaffRow } from "@/server/staff";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

beforeEach(() => mockGridLayout());

const base: StaffRow = { id: "x", name: "X", role: "RESEPSIONIS", showOnWebsite: false, isActive: true, email: null, mustChangePassword: false };

describe("StaffTable", () => {
  it("peran dan status sebagai tanda", () => {
    renderAdmin(
      <StaffTable
        staff={[
          { ...base, id: "1", name: "dr. Diane", role: "DOKTER", showOnWebsite: true },
          { ...base, id: "2", name: "Rina", role: "RESEPSIONIS", isActive: false },
        ]}
      />,
    );
    const diane = screen.getByRole("row", { name: /dr\. Diane/ });
    expect(within(diane).getByText("Dokter").closest(".MuiChip-root")).not.toBeNull();
    expect(within(diane).getByText("Ya")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Rina/ })).getByText("Nonaktif")).toBeInTheDocument();
  });
});
