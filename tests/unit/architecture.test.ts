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
});
