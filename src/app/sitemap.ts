import type { MetadataRoute } from "next";

// =============================================
// sitemap.ts — Dynamic sitemap for SEO
// =============================================
// Next.js 16 App Router generates /sitemap.xml automatically from this file.

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://missock237-spec.github.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/login",
    "/register",
    "/privacy",
    "/pricing",
    "/dashboard",
    "/marketplace",
    "/docs",
  ];

  const now = new Date();

  return staticRoutes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/dashboard" ? 0.9 : 0.7,
  }));
}
