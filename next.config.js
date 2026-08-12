// next.config.js — CommonJS pour compatibilité Vercel et Docker
// Phase 1.1 — Fondations : headers de sécurité, compression, optimisation d'images, redirects
// NOTE : la source de vérité est next.config.ts (chargé en priorité par Next.js).
//       Ce fichier .js est maintenu pour la compat Docker/Vercel et NE DOIT PAS
//       désactiver le type-checking ni le lint au build (aucun ignoreBuildErrors).
const path = require('path');

// ——— Headers de sécurité HTTP (COOP/COEP, X-Frame-Options, etc.) ———
// NOTE : Content-Security-Policy est gérée par src/middleware.ts (CSP par nonce).
// On ne la met PAS ici pour éviter un conflit avec la CSP dynamique du middleware.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Permissions-Policy : neutralise les APIs non nécessaires
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Cross-Origin Isolation partiel (sans sacrifier les API tierces pour images/IA)
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
  // Mode standalone : utilisé par Docker, ignoré par Vercel
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,

  // Compression HTTP gzip/brotli (actif sur le serveur Node standalone ; ignoré par Vercel qui gère lui-même)
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
      // Applique les headers de sécurité à toutes les routes HTML
      { source: '/:path*', headers: securityHeaders },
      // Cache long terme pour les assets versionnés (/_next/static)
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  async redirects() {
    return redirects();
  },

  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    // Stub for z-ai-web-dev-sdk (not publicly available)
    config.resolve.alias['z-ai-web-dev-sdk'] = path.join(__dirname, 'src/lib/__stubs__/z-ai-web-dev-sdk.ts');
    return config;
  },

  // Sécurité : désactive le tracing de source en production
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
