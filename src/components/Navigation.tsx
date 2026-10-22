'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, PlusCircle, HeartPulse, TrendingUp, Settings, Zap } from 'lucide-react';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Σήμερα', icon: Compass },
  { href: '/log', label: 'Καταγραφή', icon: PlusCircle },
  { href: '/health', label: 'Υγεία & PDF', icon: HeartPulse },
  { href: '/progress', label: 'Πρόοδος', icon: TrendingUp },
  { href: '/settings', label: 'Ρυθμίσεις & Sync', icon: Settings },
];

export default function Navigation() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <>
      {/* Desktop & Tablet Top Navigation Bar (md and up) */}
      <header
        aria-label="Πλοήγηση Υπολογιστή & Tablet"
        className="fixed left-0 right-0 top-0 z-40 hidden border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md md:block"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-zinc-50">
                KINESIS <span className="text-emerald-400">Sit to 5K</span>
              </span>
              <span className="block text-[10px] font-medium text-zinc-400">
                State-Driven Adaptive Transition Engine
              </span>
            </div>
          </Link>

          <nav aria-label="Κύρια Πλοήγηση Desktop" className="flex items-center gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'stroke-[2.4px]' : 'stroke-[1.9px]'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Reach Navigation Bar (below md) */}
      <nav
        aria-label="Κύρια Πλοήγηση Κινητού"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/90 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 py-1.5">
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
                <span className="mt-1 max-w-full truncate tracking-tight">
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
