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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/90 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[54px] flex-col items-center justify-center rounded-xl px-1 py-1 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200 active:bg-zinc-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.9px]'}`} />
              <span className="mt-1 truncate tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
