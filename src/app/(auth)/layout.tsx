/**
 * GENOVA AI OS — Auth Layout
 * Provides the dark background for all auth pages.
 * Session checking is handled client-side in each form component.
 */

import type { ReactNode } from 'react';
import { ThemeProvider } from "@/components/theme-provider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <div className="min-h-screen bg-slate-950">
        {children}
      </div>
    </ThemeProvider>
  );
}
