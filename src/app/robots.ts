import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Panel admin dibangun pada Plan 2. Jalurnya ditutup dari mesin pencari
      // sejak sekarang agar halaman login dan rekam medis tidak pernah terindeks.
      disallow: ["/admin"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
