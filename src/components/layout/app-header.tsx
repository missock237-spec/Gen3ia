'use client';

import { useAuthStore, useAppStore } from '@/lib/store';
import { Bell, Search, Sun, Moon, Menu } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface AppHeaderProps {
  onMenuClick?: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuthStore();
  const { approvalCount } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!mounted) {
    return (
      <header className="h-14 border-b border-border bg-card flex items-center px-4">
        <div className="w-8 h-8 bg-muted rounded-lg animate-pulse" />
        <div className="w-48 h-9 bg-muted rounded-lg animate-pulse ml-auto" />
      </header>
    );
  }

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger menu for mobile */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-accent text-muted-foreground shrink-0"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search - always visible but compact on mobile */}
        {searchOpen ? (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher..."
              autoFocus
              onBlur={() => setSearchOpen(false)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-accent text-muted-foreground text-sm flex-1 max-w-xs sm:max-w-md"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline truncate">Rechercher...</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
        <div className="flex items-center gap-2 ml-1 sm:ml-2 pl-1 sm:pl-2 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="text-sm font-medium hidden md:block truncate max-w-32">{user?.name || 'Utilisateur'}</span>
        </div>
      </div>
    </header>
  );
}
