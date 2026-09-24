import type { MetadataRoute } from "next";
import { getAllServiceSlugs, getBranches } from "@/server/catalog";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const STATIC_ROUTES = [
  "",
  "/layanan",
  "/program-slimming",
  "/produk",
  "/lokasi",
  "/tentang",
  "/faq",
  "/kebijakan-privasi",
  "/syarat-ketentuan",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [serviceSlugs, branches] = await Promise.all([getAllServiceSlugs(), getBranches()]);
  const now = new Date();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${BASE_URL}${route}`,
      lastModified: now,
    })),
    ...serviceSlugs.map((slug) => ({
      url: `${BASE_URL}/layanan/${slug}`,
      lastModified: now,
    })),
    ...branches.map((branch) => ({
      url: `${BASE_URL}/lokasi/${branch.slug}`,
      lastModified: branch.updatedAt,
    })),
  ];
}
