'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  PlusCircle,
  HeartPulse,
  TrendingUp,
  Settings,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'kinesis_eye_comfort_theme_v1';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // Circadian default: 07:00 - 19:00 warm daylight, otherwise soothing night slate
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? 'light' : 'dark';
}

export function applyThemeToDocument(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent('kinesis-theme-change', { detail: mode }));
  }
}

const NAV_ITEMS = [
  { href: '/', label: 'Σήμερα', subtitle: 'Η Άσκησή σου', icon: Compass },
  { href: '/log', label: 'Καταγραφή', subtitle: 'Γρήγορη Προσθήκη', icon: PlusCircle },
  { href: '/health', label: 'Υγεία & PDF', subtitle: 'Εξετάσεις & Ύπνος', icon: HeartPulse },
  { href: '/progress', label: 'Πορεία', subtitle: 'Τα 6 Στάδια', icon: TrendingUp },
  { href: '/settings', label: 'Συσκευές', subtitle: 'Κινητό ↔ PC', icon: Settings },
];

export default function Navigation() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const initial = getInitialTheme();
    setTheme(initial);
    applyThemeToDocument(initial);

    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<ThemeMode>;
      if (custom.detail) setTheme(custom.detail);
    };
    window.addEventListener('kinesis-theme-change', onThemeChange);
    return () => window.removeEventListener('kinesis-theme-change', onThemeChange);
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyThemeToDocument(next);
  };

  return (
    <>
      {/* Desktop & Tablet Top Navigation Bar (md and up) */}
      <header
        aria-label="Πλοήγηση Υπολογιστή & Tablet"
        className="fixed left-0 right-0 top-0 z-40 hidden border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md md:block"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-zinc-50">
                KINESIS <span className="text-emerald-400">Sit to 5K</span>
              </span>
              <span className="block text-[10px] font-medium text-zinc-400">
                Από την καρέκλα στα 5km • Χωρίς άγχος & χωρίς εξοπλισμό
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <nav aria-label="Κύρια Πλοήγηση Desktop" className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                      isActive
                        ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-sm'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'stroke-[2.4px]' : 'stroke-[1.9px]'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="ml-1 h-6 w-px bg-zinc-800" />

            {/* Circadian Eye-Comfort Day/Night Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={
                theme === 'dark'
                  ? 'Εναλλαγή σε Ξεκούραστη Λειτουργία Ημέρας'
                  : 'Εναλλαγή σε Ξεκούραστη Λειτουργία Νύχτας'
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:border-emerald-500/40"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" />
                  <span>Μέρα</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-emerald-400" />
                  <span>Νύχτα</span>
                </>
              )}
            </button>
          </div>
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
                className={`flex min-h-[54px] flex-col items-center justify-center rounded-xl px-1 py-1 text-[11px] font-semibold transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 font-bold'
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
