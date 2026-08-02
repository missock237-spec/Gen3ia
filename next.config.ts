// next.config.ts — config source de vérité (TypeScript)
// Phase 1.1 — Fondations : sécurité, compression, images optimisées, redirects.
// NOTE : équivalent comportemental à next.config.js. Next.js charge le .ts en priorité.

import path from 'path';

// ——— Headers de sécurité HTTP (COOP/COEP/CSP, X-Frame-Options, etc.) ———
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:;" },
];

// ——— Redirections permanentes (301) ———
const redirects = () => [
  { source: '/home', destination: '/', permanent: true },
  { source: '/login', destination: '/auth/signin', permanent: true },
  { source: '/signup', destination: '/auth/signup', permanent: true },
  { source: '/dashboard/app', destination: '/dashboard', permanent: true },
];

const nextConfig = {
  // Mode standalone pour Docker (ignoré par Vercel)
  output: 'standalone' as const,

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // ——— Optimisation des images ———
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [420, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60,
    remotePatterns: [
      { protocol: 'https' as const, hostname: '*.githubusercontent.com' },
      { protocol: 'https' as const, hostname: '*.googleusercontent.com' },
      { protocol: 'https' as const, hostname: 'cdn.huggingface.co' },
      { protocol: 'https' as const, hostname: 'avatars.githubusercontent.com' },
    ],
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },

  async redirects() {
    return redirects();
  },

  webpack: (config: any) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  },

  productionBrowserSourceMaps: false,
};

export default nextConfig;
