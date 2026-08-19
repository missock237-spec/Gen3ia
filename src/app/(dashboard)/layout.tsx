'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Accueil', icon: '🏠' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖' },
  { href: '/dashboard/billing', label: 'Facturation', icon: '💳' },
  { href: '/dashboard/monitoring', label: 'Monitoring', icon: '📊' },
  { href: '/dashboard/terminal', label: 'Terminal', icon: '💻' },
  { href: '/dashboard/marketplace', label: 'Marketplace', icon: '🏪' },
  { href: '/dashboard/keys', label: 'Clés API', icon: '🔑' },
  { href: '/dashboard/voice', label: 'Appels vocaux', icon: '📞' },
  { href: '/dashboard/settings', label: 'Paramètres', icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white p-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
        <span className="ml-3 text-lg font-bold text-white">Gen3ia</span>
      </div>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-gray-900 border-r border-gray-800
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">
            <span className="text-blue-400">Gen3</span>ia
          </h1>
          <p className="text-xs text-gray-500 mt-1">Agent Operating System</p>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = path === item.href || path.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition
                  ${isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }
                `}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
          <a href="/api/docs/swagger" target="_blank" className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition">
            <span>📖</span>
            Documentation API
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
