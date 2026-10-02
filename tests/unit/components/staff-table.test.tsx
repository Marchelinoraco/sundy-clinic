import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Staff } from "@prisma/client";
import { StaffTable } from "@/components/admin/staff-table";

const base = {
  slug: "x",
  title: null,
  bio: null,
  photoUrl: null,
  showOnWebsite: false,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Staff;

describe("StaffTable", () => {
  it("peran dan status sebagai tanda", () => {
    render(
      <StaffTable
        staff={[
          { ...base, id: "1", name: "dr. Diane", role: "DOKTER", showOnWebsite: true },
          { ...base, id: "2", name: "Rina", role: "RESEPSIONIS", isActive: false },
        ]}
      />,
    );
    const diane = screen.getByRole("row", { name: /dr\. Diane/ });
    expect(within(diane).getByText("Dokter")).toHaveAttribute("data-slot", "badge");
    expect(within(diane).getByText("Ya")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Rina/ })).getByText("Nonaktif")).toBeInTheDocument();
  });
});
