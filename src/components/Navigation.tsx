'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, PlusCircle, HeartPulse, TrendingUp, Settings } from 'lucide-react';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Σήμερα', icon: Compass },
  { href: '/log', label: 'Καταγραφή', icon: PlusCircle },
  { href: '/health', label: 'Υγεία', icon: HeartPulse },
  { href: '/progress', label: 'Πρόοδος', icon: TrendingUp },
  { href: '/settings', label: 'Ρυθμίσεις', icon: Settings },
];

export default function Navigation() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <nav
      aria-label="Κύρια Πλοήγηση"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[52px] min-w-[64px] flex-col items-center justify-center rounded-xl px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-zinc-400 hover:text-zinc-200 active:bg-zinc-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.4px]' : 'stroke-[1.8px]'}`} />
              <span className="mt-1 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
