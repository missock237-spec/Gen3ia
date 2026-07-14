import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { SchemaOrg } from "@/components/seo/schema-org";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: "Genova AI — Agent Operating System & SaaS Freemium",
    template: "%s | Genova AI",
  },
  description: "Genova AI est un système d'exploitation pour agents IA open source (MIT). SaaS Freemium avec Next.js, Prisma, PostgreSQL. Créez, gérez et déployez des agents AI autonomes.",
  keywords: [
    "Genova AI", "Genova", "AI Agent", "Agent Operating System",
    "IA agents autonomes", "AI SaaS", "Freemium", "Open Source", "MIT",
    "Next.js AI", "Prisma AI", "AI platform", "agent IA",
    "WhatsApp AI", "AI Router", "ReAct Loop", "AI workflow",
    "GPT alternative", "IA open source", "self-hosted AI",
    "AI agent platform", "autonomous agents", "AI orchestration",
  ],
  authors: [
    { name: "Genova AI Team", url: "https://github.com/missock237-spec/Genova" },
    { name: "Love Rose" },
  ],
  creator: "Love Rose",
  publisher: "Genova AI",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    alternateLocale: "en_US",
    siteName: "Genova AI",
    title: "Genova AI — Agent Operating System Open Source",
    description: "Système d'exploitation pour agents AI. 100% open source (MIT). SaaS Freemium avec 58 API endpoints, pipeline WhatsApp, AI Router.",
    url: "https://missock237-spec.github.io/Genova/",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Genova AI - Agent Operating System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@genova_ai",
    creator: "@missock237",
    title: "Genova AI — Agent Operating System",
    description: "Système d'exploitation pour agents AI open source. SaaS Freemium.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-genova.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  category: "technology",
  classification: "AI Platform / Agent Operating System",
  referrer: "origin-when-cross-origin",
  other: {
    "application-name": "Genova AI",
    "apple-mobile-web-app-title": "Genova AI",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black",
    "msapplication-TileColor": "#0a0a0a",
    "msapplication-config": "/browserconfig.xml",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Balises SEO critiques */}
        <link rel="canonical" href="https://missock237-spec.github.io/Genova/" />
        <meta name="geo.region" content="CM" />
        <meta name="geo.placename" content="Cameroon" />
        
        {/* Google / Search Console */}
        <meta name="google-site-verification" content="" />
        
        {/* Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Genova AI",
              "applicationCategory": "AI Platform",
              "operatingSystem": "Web, Linux, macOS, Windows",
              "description": "Système d\u2019exploitation pour agents AI. Open source (MIT). SaaS Freemium avec agents autonomes, pipeline WhatsApp, AI Router, ReAct Loop.",
              "url": "https://missock237-spec.github.io/Genova/",
              "author": {
                "@type": "Person",
                "name": "Love Rose",
                "url": "https://github.com/missock237-spec",
              },
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
                "description": "Open source (MIT) - Gratuit. SaaS Freemium à partir de 9$/mois.",
              },
              "screenshot": "https://missock237-spec.github.io/Genova/og-image.png",
              "softwareVersion": "1.0.0",
              "license": "https://opensource.org/licenses/MIT",
              "keywords": "AI, agents, SaaS, open source, Next.js, Prisma, AI agents",
              "programmingLanguage": ["TypeScript", "JavaScript", "Python"],
              "applicationSuite": "Genova AI Operating System",
              "featureList": [
                "AI Agents autonomes (ReAct Loop)",
                "AI Router intelligent",
                "Pipeline WhatsApp (Baileys)",
                "Mémoire persistante (RAG + Vector DB)",
                "Marketplace d'agents et templates",
                "Génération d'images et vidéos",
                "Voix & Multimodal (ASR, TTS, VLM)",
                "Guardrails & Sécurité",
                "58 endpoints API REST",
                "Clés API pour intégration",
                "Connexion MCP (Cursor, Claude Desktop)",
                "Terminal de code intégré",
                "Publicités récompensées",
                "Paiements Stripe",
              ],
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
          <SchemaOrg />
        </ThemeProvider>
      </body>
    </html>
  );
}
