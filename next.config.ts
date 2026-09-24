import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Dibutuhkan oleh forbidden() di src/server/session.ts, yang memberi
    // respons 403 alih-alih mengalihkan staf berwenang ke halaman login.
    authInterrupts: true,
  },
};

export default nextConfig;
