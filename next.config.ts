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

  serverExternalPackages: ['argon2'],

  // CSP géré dans middleware.ts avec nonce — pas ici
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
