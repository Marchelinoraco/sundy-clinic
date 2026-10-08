import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorModeToggle } from "@/components/admin/mui/color-mode-toggle";
import { MODE_STORAGE_KEY } from "@/lib/color-mode";
import { renderAdmin } from "./helpers/render-admin";

beforeEach(() => localStorage.clear());

describe("tombol mode tampilan", () => {
  it("tiga pilihan; bawaan Ikuti sistem", async () => {
    renderAdmin(<ColorModeToggle />);
    const group = await screen.findByRole("group", { name: "Mode tampilan" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ikuti sistem" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Terang" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "false");
  });

  it("memilih Gelap menyimpan pilihan di perangkat dan dipulihkan saat dibuka lagi", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAdmin(<ColorModeToggle />);
    await user.click(await screen.findByRole("button", { name: "Gelap" }));
    expect(screen.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe("dark");
    unmount();

    renderAdmin(<ColorModeToggle />);
    expect(await screen.findByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Terang" }));
    });
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe("light");
  });
});
