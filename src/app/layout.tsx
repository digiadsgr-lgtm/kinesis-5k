import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'KINESIS: Sit to 5K — Το Επόμενο Βήμα',
  description:
    'State-Driven Adaptive Transition Engine. Από την καρέκλα του γραφείου στα 5km με βάση τη βιολογία και το πραγματικό κόστος εκκίνησης.',
  manifest: '/manifest.json',
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
    <html lang="el" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">{children}</main>
        <Navigation />
      </body>
    </html>
  );
}
