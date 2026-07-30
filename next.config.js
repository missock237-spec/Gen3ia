// next.config.js — CommonJS pour compatibilite Vercel et Docker
const path = require('path');

const nextConfig = {
  // Mode standalone : utilise par Docker, ignore par Vercel
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '*.githubusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'cdn.huggingface.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },

  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  },

  // Securite : desactive le tracing de next
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
