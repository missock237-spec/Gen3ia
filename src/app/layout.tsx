import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { siteConfig } from '@/lib/seo/config';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

const siteUrl = siteConfig.url;
const siteName = siteConfig.name;
const title = "gen3ia — Systeme d'exploitation pour agents IA";
const description = siteConfig.description;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: `%s | ${siteName}` },
  description,
  keywords: ['Gen3ia', 'IA', 'agents IA', 'automatisation', 'SaaS', 'AI Operating System',
    'agent autonome', 'ReAct', 'Cameroun', 'Afrique', 'AI agents', 'voice AI',
    'WhatsApp bot', 'AI automation platform', 'LLM', 'GPT', 'Claude'],
  authors: [{ name: siteConfig.author, url: siteUrl }],
  creator: siteConfig.author,
  publisher: siteConfig.author,
  applicationName: siteName,
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',
  category: 'technology',
  classification: 'AI Agent Platform',
  icons: {
    icon: [
      { url: '/favicon-gen3ia.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/favicon-gen3ia.png', sizes: '180x180', type: 'image/png' }],
    other: [{ rel: 'mask-icon', url: '/icon.svg', color: '#7c3aed' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: 'black-translucent',
    startupImage: `${siteUrl}/favicon-genova.png`,
  },
  openGraph: {
    type: 'website', locale: siteConfig.locale, alternateLocale: siteConfig.alternateLocale,
    url: siteUrl, siteName, title, description,
    countryName: 'Cameroun',
    emails: ['contact@gen3ia.online'],
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    site: siteConfig.twitterHandle,
    creator: siteConfig.twitterHandle,
    title, description,
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: {
    canonical: siteUrl,
    languages: { 'fr-FR': siteUrl, 'en-US': `${siteUrl}/en` },
  },
  formatDetection: { telephone: true, date: true, address: true, email: true, url: true },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="me" href={siteConfig.githubUrl} />
        <link rel="author" href={`${siteUrl}/about`} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
