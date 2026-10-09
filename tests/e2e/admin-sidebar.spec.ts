import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn } from "./helpers/quiz";

// Seperti spek admin lain: rute admin dikompilasi `next dev` saat pertama dibuka.
test.setTimeout(120_000);

test("menu samping: desktop selalu tampil; ponsel lewat tombol Buka menu, tertutup setelah berpindah halaman", async ({ page, isMobile }) => {
  await signIn(page, E2E_ADMIN);
  const nav = page.getByRole("navigation", { name: "Menu admin" });
  if (isMobile) {
    await expect(page.getByRole("link", { name: "Booking", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Buka menu" }).click();
  }
  const booking = page.getByRole("link", { name: "Booking", exact: true });
  await expect(booking).toBeVisible();
  await expect(page.getByRole("link", { name: "SunDY Clinic" }).first()).toBeVisible();
  await booking.click();
  await expect(page).toHaveURL(/\/admin\/booking$/, { timeout: 30_000 });
  if (isMobile) {
    await expect(page.getByRole("link", { name: "Booking", exact: true })).toBeHidden();
  } else {
    await expect(nav.getByRole("link", { name: "Booking", exact: true })).toHaveAttribute("aria-current", "page");
  }
});
