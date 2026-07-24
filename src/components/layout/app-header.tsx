'use client';

import { useAuthStore, useAppStore } from '@/lib/store';
import { Bell, Search, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function AppHeader() {
  const { user } = useAuthStore();
  const { approvalCount } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6">
        <div className="w-64 h-9 bg-muted rounded-lg animate-pulse" />
      </header>
    );
  }

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-accent text-muted-foreground">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button className="relative p-2 rounded-lg hover:bg-accent text-muted-foreground">
          <Bell className="h-4 w-4" />
          {approvalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {approvalCount > 9 ? '9+' : approvalCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="text-sm font-medium hidden sm:block">{user?.name || 'Utilisateur'}</span>
        </div>
      </div>
    </header>
  );
}
