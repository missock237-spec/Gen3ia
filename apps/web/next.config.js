// next.config.js — apps/web (monorepo @gen3ia)
// Transpile le workspace @gen3ia/core et déclare l'alias '@' -> src.
// NOTE : on n'utilise PAS @turbo/pack (package inexistant) ;
// la transpilation des packages monorepo passe par `transpilePackages`.
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile le workspace @gen3ia/core (npm workspaces monorepo)
  transpilePackages: ['@gen3ia/core'],

  // Mode standalone pour Docker (ignoré par Vercel)
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,

  // Turbopack (dev) : résolution de l'alias '@' -> src
  experimental: {
    turbo: {
      resolveAlias: {
        '@': path.join(__dirname, 'src'),
      },
    },
  },

  // Webpack (build) : résolution de l'alias '@' -> src
  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
