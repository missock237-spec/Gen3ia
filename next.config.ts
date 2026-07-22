import type { NextConfig } from 'next';

const isVercel = process.env.VERCEL === '1';

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'https', hostname: '*.githubusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },

  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },

  serverExternalPackages: ['argon2', 'bcryptjs'],

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https: wss:; " +
              "frame-ancestors 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'",
          },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
