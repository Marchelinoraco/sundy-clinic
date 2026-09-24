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
});
