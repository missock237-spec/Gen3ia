import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
<<<<<<< HEAD
  title: "genova.Ia — Système d'exploitation pour agents IA",
  description: "genova.Ia est la plateforme SaaS qui vous permet de créer, gérer et coordonner vos agents IA.",
  keywords: ["genova.Ia", "Genova", "IA", "agents", "automatisation", "SaaS", "AI Operating System"],
  authors: [{ name: "genova.Ia Team" }],
=======
  title: "AgentOS — Système d'exploitation pour agents IA",
  description: "AgentOS est la plateforme SaaS qui vous permet de créer, gérer et coordonner vos agents IA.",
  keywords: ["AgentOS", "IA", "agents", "automatisation", "SaaS"],
  authors: [{ name: "AgentOS Team" }],
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  icons: {
    icon: ["/favicon-genova.png", "/icon.svg"],
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
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
