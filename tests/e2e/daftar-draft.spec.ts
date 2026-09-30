import { expect, test } from "@playwright/test";

// Customer yang sedang mengisi kuis versi 1 saat rilis kuis v2 (spec kuis v2, bagian 8):
// drafnya dibuang, dan pesannya harus benar-benar terlihat — bukan hanya dipanggil.
test("draf kuis versi lama dibuang dengan pesan yang terlihat customer", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("sundy-daftar-v1", JSON.stringify({ answers: { purpose: "BELUM_YAKIN" }, screen: "B1" }));
  });
  await page.goto("/daftar");

  await expect(page.getByText("Kuis kami baru saja diperbarui. Silakan isi dari awal.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Pernah konsultasi atau treatment di SunDY Clinic?" })).toBeVisible();
});
