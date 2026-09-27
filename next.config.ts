import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Node mandiri untuk VPS: .next/standalone/server.js membawa modul
  // yang dibutuhkannya sendiri. Aset statis & public disalin oleh deploy.sh.
  output: "standalone",
  experimental: {
    // Dibutuhkan oleh forbidden() di src/server/session.ts, yang memberi
    // respons 403 alih-alih mengalihkan staf berwenang ke halaman login.
    authInterrupts: true,
  },
};

export default nextConfig;
