import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { JsonLd } from "@/lib/seo/json-ld";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://missock237-spec.github.io/Genova";
const siteName = "Genova AI";
const title = "Genova AI — Système d'exploitation pour agents IA";
const description =
  "Genova AI est la plateforme SaaS qui vous permet de créer, gérer et coordonner vos agents IA. Outils, automatisation, ReAct Loop, WhatsApp, Marketplace.";

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
    template: "%s | Genova AI",
  },
  description,
  keywords: [
    "Genova",
    "IA",
    "agents IA",
    "automatisation",
    "SaaS",
    "AI Operating System",
    "intelligence artificielle",
    "agent autonome",
    "ReAct",
    "Cameroun",
    "Afrique",
    "Next.js",
    "AI agents",
    "artificial intelligence",
    "autonomous agent",
    "agent OS",
  ],
  authors: [{ name: "Genova Team", url: siteUrl }],
  creator: "Genova AI",
  publisher: "Genova AI",
  applicationName: siteName,
  icons: {
    icon: [
      { url: "/favicon-genova.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/favicon-genova.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    alternateLocale: ["en_US", "en_GB"],
    url: siteUrl,
    siteName,
    title,
    description,
    countryName: "Cameroun",
    emails: ["contact@genova-ai.com"],
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Genova AI — Agent Operating System",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@genova_ai",
    creator: "@genova_ai",
    title,
    description,
    images: [`${siteUrl}/og-image.png`],
  },
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
  alternates: {
    canonical: siteUrl,
    languages: {
      "fr-FR": siteUrl,
      "en-US": `${siteUrl}/en`,
    },
  },
  verification: {
    google: "",
    yandex: "",
    yahoo: "",
  },
  category: "technology",
  classification: "AI Platform",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: true,
    date: true,
    address: true,
    email: true,
    url: true,
  },
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "black-translucent",
    startupImage: `${siteUrl}/favicon-genova.png`,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
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
