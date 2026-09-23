import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Alias "@/*" dibaca langsung dari tsconfig.json oleh Vite, tanpa plugin tambahan.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Uji integrasi punya konfigurasinya sendiri (vitest.integration.config.mts)
    // yang mengarahkannya ke branch "test" di Neon. Kalau ikut terjaring di sini,
    // ia akan berjalan tanpa pemetaan itu dan bisa menyentuh basis data yang salah.
    exclude: ["tests/e2e/**", "tests/integration/**"],
  },
});
