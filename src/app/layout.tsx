import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GEN3IA — Plateforme d'orchestration d'agents IA",
  description:
    "Construisez, testez et déployez des agents IA autonomes : analyse de prompts, 5 plans comparés, exécution avec outils réels, auto-correction, vérification factuelle et API publique.",
  keywords: [
    "GEN3IA", "agents IA", "orchestration", "GLM", "automatisation", "SaaS",
    "auto-correction", "RAG", "API agents",
  ],
  openGraph: {
    title: "GEN3IA — Plateforme d'orchestration d'agents IA",
    description: "Le moteur d'exécution agentique : comprendre, planifier, comparer, exécuter, vérifier, corriger, apprendre.",
    siteName: "GEN3IA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
