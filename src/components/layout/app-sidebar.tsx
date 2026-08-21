'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useAppStore, useAuthStore } from '@/lib/store';
import {
  LayoutDashboard, Bot, Radio, Shield, GitBranch, Settings,
  BarChart3, ChevronLeft, ChevronRight, LogOut, Sparkles,
  X, Wallet, Mic, Code2, Puzzle, Workflow, Globe, Eye,
} from 'lucide-react';

interface AppSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AppSidebar({ mobileOpen = false, onCloseMobile }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { currentView, setCurrentView, approvalCount } = useAppStore();
  const { user, logout } = useAuthStore();

  const handleNav = (id: string) => {
    setCurrentView(id as any);
    onCloseMobile?.();
  };

  const menuSections = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'agents', label: 'Agents IA', icon: Bot },
        { id: 'automation', label: 'Automation', icon: Radio },
      ],
    },
    {
      items: [
        { id: 'coordination', label: 'Workflows', icon: Workflow },
        { id: 'guardrails', label: 'Guardrails', icon: Shield },
        { id: 'analytics', label: 'Analytiques', icon: BarChart3 },
      ],
    },
    {
      items: [
        { id: 'billing', label: 'Facturation', icon: Wallet },
        { id: 'settings', label: 'Paramètres', icon: Settings },
        { id: 'approvals', label: 'Approbations', icon: Sparkles, badge: approvalCount },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed ? (
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Image src="/logo.png" alt="Gen3ia" width={32} height={32} className="h-8 w-8 rounded-lg" priority />
            <span>Gen3ia</span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center justify-center">
            <Image src="/logo.png" alt="Gen3ia" width={32} height={32} className="h-8 w-8 rounded-lg" priority />
          </Link>
        )}
        <div className="flex items-center gap-1">
          {/* Close button on mobile */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1 rounded-lg hover:bg-accent text-muted-foreground"
            >
              <X size={18} />
            </button>
          )}
          {/* Collapse toggle on desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block p-1 rounded-lg hover:bg-accent text-muted-foreground"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
        {menuSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  currentView === item.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 text-left truncate">{item.label}</span>
                )}
                {!collapsed && item.badge && item.badge > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-border">
        {!collapsed && user && (
          <div className="mb-2 px-2 text-xs text-muted-foreground truncate">
            {user.email}
          </div>
        )}
        <button
          onClick={() => { void logout(); onCloseMobile?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onCloseMobile}
          />
          {/* Drawer */}
          <aside
            className={cn(
              'fixed top-0 left-0 bottom-0 z-50 w-64 bg-card border-r border-border',
              'transition-transform duration-300 ease-in-out lg:hidden'
            )}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col border-r border-border bg-card transition-all duration-300 shrink-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
