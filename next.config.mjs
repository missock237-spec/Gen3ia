// next.config.mjs — config source de vérité (ESM, Next.js 14 compatible)
// Phase 1.1 — Fondations : sécurité, compression, images optimisées, redirects.
// NOTE : Next.js 14 ne supporte pas next.config.ts (ajouté dans Next.js 15+).
//        Pour rester sur une source unique, on utilise .mjs qui est supporté
//        nativement par Next.js 14, 15 et 16. Lors du passage à Next 15+,
//        ce fichier peut être renommé en next.config.ts si souhaité.
// NOTE CSP : Content-Security-Policy est gérée par src/middleware.ts (CSP par nonce),
// on ne la définit PAS ici pour éviter tout conflit avec la CSP dynamique du middleware.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ——— Headers de sécurité HTTP (COOP/COEP, X-Frame-Options, etc.) ———
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
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
  output: 'standalone',

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
      { protocol: 'https', hostname: '*.githubusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'cdn.huggingface.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
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

  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    config.resolve.alias['z-ai-web-dev-sdk'] = path.join(__dirname, 'src/lib/__stubs__/z-ai-web-dev-sdk.ts');
    config.resolve.alias['./agent-safety.node'] = false;
    config.resolve.alias['agent-safety.node'] = false;
    return config;
  },

  productionBrowserSourceMaps: false,
};

export default nextConfig;
