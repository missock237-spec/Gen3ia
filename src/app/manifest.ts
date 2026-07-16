import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Genova AI - Agent Operating System',
    short_name: 'Genova AI',
    description: 'Système d\'exploitation pour agents AI. Créez, gérez et orchestrez vos agents.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f0818',
    theme_color: '#8b5cf6',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/favicon-genova.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    categories: ['technology', 'ai', 'productivity', 'developer-tools'],
    screenshots: [
      {
        src: '/og-image.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Genova AI Dashboard',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'Voir le tableau de bord',
        url: '/',
        icons: [{ src: '/favicon-genova.png', sizes: '32x32' }],
      },
      {
        name: 'Agents',
        short_name: 'Agents',
        description: 'Gérer mes agents AI',
        url: '/?view=agents',
      },
      {
        name: 'Marketplace',
        short_name: 'Marketplace',
        description: 'Explorer le marketplace',
        url: '/marketplace',
      },
    ],
    lang: 'fr',
    dir: 'ltr',
    prefer_related_applications: false,
  };
}
