import type { MetadataRoute } from "next";

// =============================================
// robots.ts — Dynamic robots.txt for SEO
// =============================================
// Next.js 16 App Router generates /robots.txt automatically from this file.

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://missock237-spec.github.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/register", "/pricing", "/privacy", "/marketplace"],
      disallow: [
        "/api/",
        "/dashboard/",
        "/settings/",
        "/billing/",
        "/agents/",
        "/admin/",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
