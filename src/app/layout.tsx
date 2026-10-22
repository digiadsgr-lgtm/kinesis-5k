import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import InstallPwaPrompt from '@/components/InstallPwaPrompt';

const inter = Inter({
  subsets: ['greek', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['greek', 'latin'],
  weight: ['500', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'KINESIS: Sit to 5K — Το Επόμενο Βήμα',
  description:
    'State-Driven Adaptive Transition Engine. Από την καρέκλα του γραφείου στα 5km με βάση τη βιολογία και το πραγματικό κόστος εκκίνησης.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KINESIS 5K',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="el"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        <Navigation />
        <main className="mx-auto min-h-screen w-full max-w-6xl px-3 pb-28 pt-3 sm:px-6 md:pb-12 md:pt-20 lg:px-8">
          <InstallPwaPrompt />
          {children}
        </main>
      </body>
    </html>
  );
}
