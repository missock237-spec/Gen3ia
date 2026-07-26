import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { JsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/lib/seo/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = siteConfig.url;
const siteName = siteConfig.name;
const title = "Genova AI — Système d'exploitation pour agents IA";
const description = siteConfig.description;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: `%s | ${siteName}`,
  },
  description,
  keywords: [
    "Genova", "IA", "agents IA", "automatisation", "SaaS",
    "AI Operating System", "intelligence artificielle", "agent autonome",
    "ReAct", "Cameroun", "Afrique", "Next.js", "AI agents",
    "artificial intelligence", "autonomous agent", "agent OS",
    "voice AI", "AI phone calls", "Twilio AI", "WhatsApp bot",
    "AI automation platform", "machine learning", "LLM", "GPT", "Claude",
  ],
  authors: [{ name: siteConfig.author, url: siteUrl }],
  creator: siteConfig.author,
  publisher: siteConfig.author,
  applicationName: siteName,
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  category: "technology",
  classification: "AI Agent Platform",

  // Icônes et manifest
  icons: {
    icon: [
      { url: "/favicon-genova.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/favicon-genova.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/icon.svg", color: "#7c3aed" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "black-translucent",
    startupImage: `${siteUrl}/favicon-genova.png`,
  },

  // Open Graph enrichi
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    alternateLocale: siteConfig.alternateLocale,
    url: siteUrl,
    siteName,
    title,
    description,
    countryName: "Cameroun",
    emails: ["contact@genova-ai.com"],
    phoneNumbers: ["+237612345678"],
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: `${siteName} — Agent Operating System`,
        type: "image/png",
      },
    ],
  },

  // Twitter Cards
  twitter: {
    card: "summary_large_image",
    site: siteConfig.twitterHandle,
    creator: siteConfig.twitterHandle,
    title,
    description,
    images: [`${siteUrl}/og-image.png`],
  },

  // Robots et indexation IA
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // URLs alternatives
  alternates: {
    canonical: siteUrl,
    languages: {
      "fr-FR": siteUrl,
      "en-US": `${siteUrl}/en`,
    },
  },

  // Vérification des moteurs de recherche
  verification: {
    google: "",
    yandex: "",
    yahoo: "",
    me: ["contact@genova-ai.com", siteConfig.githubUrl],
  },

  // Détection de format
  formatDetection: {
    telephone: true,
    date: true,
    address: true,
    email: true,
    url: true,
  },

  // Métadonnées additionnelles pour les IA
  other: {
    // PWA
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",

    // Dublin Core (standards bibliothèques et archives)
    "DC.title": siteName,
    "DC.creator": siteConfig.author,
    "DC.description": description,
    "DC.language": "fr",
    "DC.subject": "AI, Agents, Intelligence Artificielle",

    // Référencement géographique
    "geo.region": "CM",
    "geo.placename": "Cameroun",

    // Réseaux sociaux
    "fb:app_id": "",
    "fb:pages": "",
    "linkedin:profile": siteConfig.links.linkedin,

    // AI and crawler hints
    "ai-content": "optimized",
    "ai-training-data": "opt-in",

    // Archive.org
    "ORG_NAME": siteName,
    "ORG_URL": siteUrl,
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
        <JsonLd />
        {/* Balises link pour SEO */}
        <link rel="me" href={siteConfig.githubUrl} />
        <link rel="me" href={siteConfig.links.twitter} />
        <link rel="me" href={siteConfig.links.linkedin} />
        <link rel="author" href={`${siteUrl}/about`} />
        <link rel="search" type="application/opensearchdescription+xml" title={siteName} href="/opensearch.xml" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
