import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { ADMIN_PAGES, resolveAdminPage } from "./helpers/admin-pages";
import { signIn } from "./helpers/quiz";

// Foto halaman admin untuk tinjauan visual (rencana MUI: R14 dan Task 13). Tidak ikut uji biasa: hanya
// jalan dengan FOTO_ADMIN=1. Nama berawalan zz- supaya berjalan terakhir bila dijalankan bersama spek lain
// dengan --workers=1 (Playwright mengurutkan berkas menurut abjad), sehingga halaman detail sudah punya data. FOTO_HALAMAN = path dipisah koma; path tepat ("/admin") atau awalan berakhiran *
// ("/admin/tagihan*" = daftar dan detail tagihan).

test.skip(!process.env.FOTO_ADMIN, "Hanya untuk foto tinjauan (FOTO_ADMIN=1).");
test.setTimeout(900_000);

const OUT = process.env.FOTO_DIR ?? ".superpowers/sdd/2026-10-08-plan-admin-mui/foto";
const MODE_KEY = "sundy-mode-admin";
const slug = (path: string) => path.replace(/^\/admin\/?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "dasbor";

test("foto halaman admin di kedua skema", async ({ page }, testInfo) => {
  const only = (process.env.FOTO_HALAMAN ?? "").split(",").filter(Boolean);
  const targets = ADMIN_PAGES.filter(
    (t) => only.length === 0 || only.some((p) => (p.endsWith("*") ? t.path.startsWith(p.slice(0, -1)) : t.path === p)),
  );
  const missing: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(`${page.url()}: ${message.text()}`));
  await signIn(page, E2E_ADMIN);
  for (const scheme of ["light", "dark"] as const) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MODE_KEY, scheme] as const);
    const dir = join(OUT, testInfo.project.name, scheme);
    mkdirSync(dir, { recursive: true });
    for (const target of targets) {
      const href = await resolveAdminPage(page, target);
      if (!href) {
        missing.push(`${scheme} ${target.path}`);
        continue;
      }
      await page.goto(href);
      await page.waitForLoadState("networkidle");
      // Tombol mode tampilan baru muncul setelah React terpasang: foto diambil setelah hidrasi selesai.
      await page.getByRole("group", { name: "Mode tampilan" }).waitFor({ timeout: 120_000 });
      await expect(page.locator("html")).toHaveAttribute(`data-${scheme}`, "");
      await page.screenshot({ path: join(dir, `${slug(target.path)}.jpg`), type: "jpeg", quality: 70, fullPage: true });
    }
  }
  writeFileSync(join(OUT, `${testInfo.project.name}-catatan.txt`), [`Tidak ditemukan: ${missing.join("; ") || "-"}`, ...errors].join("\n"));
});
