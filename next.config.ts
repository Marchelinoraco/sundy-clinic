import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Node mandiri untuk VPS: .next/standalone/server.js membawa modul
  // yang dibutuhkannya sendiri. Aset statis & public disalin oleh deploy.sh.
  output: "standalone",
  experimental: {
    // Dibutuhkan oleh forbidden() di src/server/session.ts, yang memberi
    // respons 403 alih-alih mengalihkan staf berwenang ke halaman login.
    authInterrupts: true,
    // Paket payung radix-ui mengimpor semua komponen Radix. Dengan ini hanya komponen yang
    // dipakai yang dikompilasi (diukur di next dev: halaman publik ±1.460 → ±930 modul).
    optimizePackageImports: ["radix-ui"],
    // Alat dev "Segment Explorer" membungkus segmen dengan komponen tambahan hanya di mode dev, sehingga
    // useId (dipakai isian MUI tanpa id) berbeda antara server dan klien: galat hidrasi palsu di next dev.
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
