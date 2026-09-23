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

  it("tidak ada komponen yang mengimpor klien Prisma", () => {
    // Komponen menerima data lewat prop. Sebuah komponen yang mengambil
    // datanya sendiri tidak dapat diuji tanpa basis data.
    const offenders = collectSourceFiles("src/components").filter((file) =>
      readFileSync(file, "utf8").includes('from "@/lib/db"'),
    );

    expect(offenders).toEqual([]);
  });
});
