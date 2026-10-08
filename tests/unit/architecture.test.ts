import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? collectSourceFiles(full) : [full];
    })
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

describe("batasan arsitektur", () => {
  it("tidak ada berkas di src/app yang mengimpor klien Prisma secara langsung", () => {
    // Halaman mengambil data lewat src/server/catalog.ts. Memanggil Prisma
    // langsung dari halaman menyebarkan kueri ke seluruh pohon rute, dan
    // membuat perubahan skema harus dikejar ke banyak tempat sekaligus.
    const offenders = collectSourceFiles("src/app").filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes('from "@/lib/db"') || source.includes('from "@prisma/client"');
    });

    expect(offenders).toEqual([]);
  });

  it("menempatkan halaman publik di dalam route group (public)", () => {
    // Panel admin tidak boleh mewarisi header, footer, dan tombol WhatsApp
    // milik situs publik. Route group memisahkan tata letaknya tanpa
    // mengubah URL yang sudah tayang dan sudah terindeks.
    expect(existsSync("src/app/(public)/layout.tsx")).toBe(true);
    expect(existsSync("src/app/(public)/page.tsx")).toBe(true);
    expect(existsSync("src/app/page.tsx")).toBe(false);
  });

  it("tidak ada halaman publik yang mengimpor modul admin", () => {
    // Halaman publik tidak butuh sesi, staf, atau jejak audit. Mengimpornya
    // menarik kode autentikasi ke dalam berkas yang dilayani ke siapa pun,
    // dan membuka jalan bagi kebocoran yang tidak disengaja.
    const forbidden = ["@/server/session", "@/server/staff", "@/server/audit", "@/lib/auth"];

    const offenders = collectSourceFiles("src/app/(public)").filter((file) => {
      const source = readFileSync(file, "utf8");
      return forbidden.some((module) => source.includes(`from "${module}"`));
    });

    expect(offenders).toEqual([]);
  });

  it("tidak ada komponen yang mengimpor klien Prisma", () => {
    // Komponen menerima data lewat prop. Sebuah komponen yang mengambil
    // datanya sendiri tidak dapat diuji tanpa basis data.
    const offenders = collectSourceFiles("src/components").filter((file) =>
      readFileSync(file, "utf8").includes('from "@/lib/db"'),
    );

    expect(offenders).toEqual([]);
  });

  it("setiap menu samping panel admin mengarah ke halaman yang ada", () => {
    // Menu yang mengarah ke rute kosong memberi staf halaman "tidak ditemukan".
    const sidebar = readFileSync("src/components/admin/app-sidebar.tsx", "utf8");
    const urls = [...sidebar.matchAll(/url: "(\/admin[^"]*)"/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);

    const missing = urls.filter((url) => !existsSync(`src/app/(admin)${url}/page.tsx`));
    expect(missing).toEqual([]);
  });

  it("kuis, pendaftaran, dan panel admin tidak memakai bahan gerak situs publik", () => {
    // Spec redesign §6: alur kuis /daftar dan panel admin bebas dari gerak.
    const dirs = [
      "src/components/kuis",
      "src/components/pendaftaran",
      "src/components/food-recall",
      "src/components/admin",
      "src/app/(admin)",
    ];
    const offenders = dirs.flatMap(collectSourceFiles).filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes('from "@/components/motion/') ||
        source.includes('from "motion/') ||
        source.includes('from "lenis')
      );
    });

    expect(offenders).toEqual([]);
  });

  it("gulir halus hanya dipasang sekali, di layout situs publik", () => {
    // Spec redesign §6: Lenis hanya di layout (public); panel admin dan kuis memakai gulir asli.
    const mounts = collectSourceFiles("src").filter((file) =>
      readFileSync(file, "utf8").includes("<SmoothScroll"),
    );
    expect(mounts).toEqual(["src/app/(public)/layout.tsx"]);
  });

  it("komponen server hanya mengambil komponen dari modul klien, bukan fungsi atau konstanta", () => {
    // Fungsi dari berkas "use client" yang dipanggil di komponen server menjadi referensi
    // klien dan membuat halaman galat 500 ("Attempted to call … from the server").
    // Vitest tidak menegakkan batas ini, jadi diperiksa di sini.
    const isClient = (file: string) => /^\s*["']use client["']/.test(readFileSync(file, "utf8"));
    const resolve = (specifier: string) =>
      [".ts", ".tsx"].map((ext) => specifier.replace(/^@\//, "src/") + ext).find((file) => existsSync(file));

    const offenders = collectSourceFiles("src")
      .filter((file) => !isClient(file))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return [...source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"(@\/[^"]+)"/g)].flatMap(([, names, from]) => {
          const target = resolve(from);
          if (!target || !isClient(target)) return [];
          return names
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name && !name.startsWith("type ") && !/^[A-Z][a-z]/.test(name))
            .map((name) => `${file}: ${name} dari ${from}`);
        });
      });

    expect(offenders).toEqual([]);
  });

  it("halaman publik tidak memakai kata pasien atau berobat", () => {
    // Spec redesign §4.3: halaman publik memakai "Anda" dan "customer". Kuis, cek booking,
    // dan teks hukum tidak diubah redesign ini, jadi tidak ikut diperiksa.
    const dirs = [
      "src/components/home",
      "src/components/public",
      "src/components/layout",
      "src/components/catalog",
      "src/components/motion",
      "src/components/food-recall",
      "src/app/(public)",
    ];
    const untouched = [
      "src/app/(public)/daftar",
      "src/app/(public)/cek-booking",
      "src/app/(public)/isi",
      "src/app/(public)/kebijakan-privasi",
      "src/app/(public)/syarat-ketentuan",
    ];
    const offenders = dirs
      .flatMap(collectSourceFiles)
      .filter((file) => !untouched.some((dir) => file.startsWith(dir)))
      .filter((file) => /\b(pasien|berobat)\b/i.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("pustaka motion hanya dipakai penanda tombol pilihan paket", () => {
    // motion/react selalu membawa seluruh framer-motion (±1.600 modul di server dev). Bila dipakai
    // header atau kepala halaman, pustaka itu ikut ke setiap halaman publik: server dev uji
    // kehabisan memori, dan HP pengunjung mengunduhnya di Beranda. Magnet, kartu miring, dan
    // parallax cukup dengan JavaScript biasa.
    const users = collectSourceFiles("src").filter((file) =>
      /from "(motion|framer-motion)(\/[^"]*)?"/.test(readFileSync(file, "utf8")),
    );
    expect(users).toEqual(["src/components/public/package-tabs.tsx"]);
  });

  it("Material UI hanya dimuat panel admin; situs publik tidak", () => {
    const publicFiles = [
      ...collectSourceFiles("src/app/(public)"),
      ...collectSourceFiles("src/components").filter((file) => !file.startsWith(join("src", "components", "admin"))),
    ];
    const offenders = publicFiles.filter((file) => /from\s+"@mui\//.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("layout grup admin memasang provider MUI dan skrip skema warna", () => {
    const layout = readFileSync("src/app/(admin)/layout.tsx", "utf8");
    expect(layout).toContain("AdminProviders");
    expect(layout).toContain("InitColorSchemeScript");
  });

  // Rencana MUI (Task 5–12): berkas admin yang sudah pindah ke MUI tidak boleh kembali memakai shadcn,
  // lucide, atau kelas warna Tailwind (warna tetap tidak ikut mode gelap). Setiap tugas modul menambah
  // berkasnya ke sini sebelum konversi. Task 13 menggantinya dengan aturan untuk seluruh panel admin.
  const MUI_MIGRATED = [
    // Task 2–4
    "src/app/(admin)/admin/layout.tsx",
    "src/app/(admin)/masuk/page.tsx",
    "src/components/admin/admin-header.tsx",
    "src/components/admin/app-sidebar.tsx",
    "src/components/admin/live-notifier.tsx",
    "src/components/admin/nav-user.tsx",
    "src/components/admin/page-layout.tsx",
    "src/components/admin/page-tabs.tsx",
    "src/components/admin/patient-picker.tsx",
    "src/components/admin/report/report-filter.tsx",
    "src/components/admin/rupiah-input.tsx",
    "src/components/admin/sign-in-form.tsx",
    "src/components/admin/stat-tile.tsx",
    // Task 5
    "src/app/(admin)/admin/page.tsx",
    "src/app/(admin)/admin/layanan/page.tsx",
    "src/app/(admin)/admin/pengaturan/page.tsx",
    "src/app/(admin)/admin/staf/page.tsx",
    "src/components/admin/booking-source-chart.tsx",
    "src/components/admin/clinic-setting-form.tsx",
    "src/components/admin/dashboard-numbers.tsx",
    "src/components/admin/dashboard-work.tsx",
    "src/components/admin/online-service-card.tsx",
    "src/components/admin/schedule-timeline.tsx",
    "src/components/admin/service-price-table.tsx",
    "src/components/admin/staff-table.tsx",
    // Task 6
    "src/app/(admin)/admin/pasien/page.tsx",
    "src/app/(admin)/admin/pasien/[id]/page.tsx",
    "src/app/(admin)/admin/isian/[id]/page.tsx",
    "src/components/admin/patient-table.tsx",
    "src/components/admin/patient-detail-view.tsx",
    "src/components/admin/patient-note-forms.tsx",
    "src/components/admin/new-patient-form.tsx",
    "src/components/admin/nik-form.tsx",
    "src/components/admin/nik-input.tsx",
    "src/components/admin/intake-view.tsx",
    "src/components/admin/intake-clinical-content.tsx",
    "src/components/admin/intake-approval-form.tsx",
    "src/components/admin/match-patient-dialog.tsx",
    "src/components/admin/food-recall-table.tsx",
    "src/components/admin/food-recall-link-panel.tsx",
    "src/components/admin/food-recall-dialog.tsx",
    // Task 7
    "src/app/(admin)/admin/booking/page.tsx",
    "src/app/(admin)/admin/booking/baru/page.tsx",
    "src/components/admin/appointment-form.tsx",
    "src/components/admin/appointment-table.tsx",
    "src/components/admin/appointment-status-badge.tsx",
    "src/components/admin/booking-created-panel.tsx",
    "src/components/admin/booking-dialogs.tsx",
    "src/components/admin/booking-filters.tsx",
    "src/components/admin/booking-summary.tsx",
    "src/components/admin/date-strip.tsx",
    "src/components/admin/slot-picker.tsx",
    "src/components/admin/reschedule-dialog.tsx",
    "src/components/admin/check-in-dialog.tsx",
    "src/components/admin/send-message-dialog.tsx",
    "src/components/admin/message-actions.tsx",
    "src/components/admin/whatsapp-send-button.tsx",
    "src/components/admin/quiz-link-dialog.tsx",
    // Task 8
    "src/app/(admin)/admin/jadwal/page.tsx",
    "src/app/(admin)/admin/pengingat/page.tsx",
    "src/components/admin/holiday-list.tsx",
    "src/components/admin/schedule-exception-form.tsx",
    "src/components/admin/schedule-exception-list.tsx",
    "src/components/admin/weekly-schedule-form.tsx",
    "src/components/admin/reminder-worklist.tsx",
    "src/components/admin/online-work.tsx",
    "src/components/admin/online-appointment-form.tsx",
    "src/components/admin/contact-windows-dialog.tsx",
    "src/components/admin/contact-windows-fields.tsx",
    // Task 9
    "src/app/(admin)/admin/kunjungan/[id]/page.tsx",
    "src/components/admin/encounter-workspace.tsx",
    "src/components/admin/encounter-page-view.tsx",
    "src/components/admin/encounter-record.tsx",
    "src/components/admin/encounter-form.tsx",
    "src/components/admin/encounter-warnings.tsx",
    "src/components/admin/encounter-context-panel.tsx",
    "src/components/admin/encounter-intake-tab.tsx",
    "src/components/admin/encounter-food-recall-tab.tsx",
    "src/components/admin/previous-visits-tab.tsx",
    "src/components/admin/vitals-trend-tab.tsx",
    "src/components/admin/addendum-form.tsx",
    "src/components/admin/audit-trail.tsx",
    "src/components/admin/doctor-worklist.tsx",
    "src/components/admin/open-encounter-button.tsx",
    "src/components/admin/activity-list-fields.tsx",
    // Task 10
    "src/app/(admin)/admin/tagihan/page.tsx",
    "src/app/(admin)/admin/tagihan/[id]/page.tsx",
    "src/app/(admin)/admin/resep/page.tsx",
    "src/app/(admin)/admin/resep/[id]/page.tsx",
    "src/app/(admin)/admin/resep/[id]/etiket/page.tsx",
    "src/app/(admin)/admin/stok-dokter/page.tsx",
    "src/components/admin/billing/add-free-line-dialog.tsx",
    "src/components/admin/billing/add-item-dialog.tsx",
    "src/components/admin/billing/billable-table.tsx",
    "src/components/admin/billing/billing-tiles.tsx",
    "src/components/admin/billing/cancel-invoice-dialog.tsx",
    "src/components/admin/billing/create-invoice-button.tsx",
    "src/components/admin/billing/direct-sale-dialog.tsx",
    "src/components/admin/billing/discount-form.tsx",
    "src/components/admin/billing/final-discount-dialog.tsx",
    "src/components/admin/billing/invoice-draft-editor.tsx",
    "src/components/admin/billing/invoice-final-view.tsx",
    "src/components/admin/billing/invoice-payment-dialog.tsx",
    "src/components/admin/billing/invoice-status-badge.tsx",
    "src/components/admin/billing/invoice-table.tsx",
    "src/components/admin/billing/print-button.tsx",
    "src/components/admin/billing/revoke-invoice-payment-dialog.tsx",
    "src/components/admin/dispensing/dispensing-editor.tsx",
    "src/components/admin/dispensing/dispensing-label.tsx",
    "src/components/admin/dispensing/dispensing-status-badge.tsx",
    "src/components/admin/dispensing/dispensing-summary.tsx",
    "src/components/admin/dispensing/dispensing-table.tsx",
    "src/components/admin/dispensing/dispensing-tiles.tsx",
    "src/components/admin/dispensing/reopen-dispensing-button.tsx",
    "src/components/admin/dispensing/stock-availability-table.tsx",
  ];
  const SHADCN_OR_FIXED_COLOR =
    /from "@\/components\/ui\/|from "lucide-react"|["'`][^"'`\n]*\b(?:text|bg|border|fill|stroke|ring)-(?:muted|foreground|primary|secondary|destructive|accent|card|background|input|amber|emerald|stone|red|green|gold|brown|cream|white|black)\b/;

  it("berkas admin yang sudah pindah ke MUI tidak memakai shadcn, lucide, atau kelas warna Tailwind", () => {
    const offenders = MUI_MIGRATED.filter((file) => !existsSync(file) || SHADCN_OR_FIXED_COLOR.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
