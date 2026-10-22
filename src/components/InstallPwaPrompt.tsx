'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Lock, Share, Smartphone, PlusSquare, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [installedJustNow, setInstalledJustNow] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standaloneMatch =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standaloneMatch);

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDetected = /iphone|ipad|ipod/.test(ua);
    setIsIos(iosDetected);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setInstalledJustNow(true);
      setDeferredPrompt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowModal(false);
      }
    } else {
      setShowModal(true);
    }
  };

  if (isStandalone && !installedJustNow) {
    return null;
  }

  return (
    <>
      {/* Compact Top Install & Privacy Banner */}
      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Smartphone className="h-4 w-4 shrink-0 text-emerald-400" />
          <div className="text-xs">
            <span className="font-bold text-zinc-100">Εφαρμογή Κινητού & Ιδιωτικά Δεδομένα</span>
            <p className="text-[11px] text-zinc-300">
              Κάθε κινητό που ανοίγει το link έχει 100% δική του, ξεχωριστή βάση.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/20 active:scale-95"
        >
          <Download className="h-3.5 w-3.5" />
          Στο Κινητό
        </button>
      </div>

      {/* Detailed Install & Privacy Explanation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-md">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <Smartphone className="h-5 w-5" />
                <h3 className="text-base font-bold text-zinc-50">
                  Προσθήκη στην Αρχική Οθόνη & Ιδιωτικότητα
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Privacy Assurance Box */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs leading-relaxed text-zinc-200">
              <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                <Lock className="h-4 w-4 text-emerald-400" />
                <span>Τι γίνεται αν δώσω το link σε άλλον;</span>
              </div>
              <p className="mt-1 text-zinc-300">
                <strong>Κανένας άλλος δεν βλέπει τα δικά σου στατιστικά ή τα PDF σου!</strong> Το
                KINESIS αποθηκεύει τα δεδομένα τοπικά <strong>μέσα στη συσκευή του καθενός</strong>{' '}
                (IndexedDB). Αν στείλεις το link σε φίλο σου, στο δικό του κινητό θα ανοίξει ένα
                εντελώς καινούργιο, άδειο προφίλ αποκλειστικά δικό του.
              </p>
            </div>

            {/* OS-Specific Install Instructions */}
            {isIos ? (
              <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs">
                <p className="font-bold text-zinc-100">
                  Πώς το κατεβάζεις στην Αρχική Οθόνη σε iPhone / Safari:
                </p>
                <ol className="space-y-2 text-zinc-300">
                  <li className="flex items-start gap-2">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 1:</strong> Πάτησε το κουμπί <strong>Κοινοποίηση (Share)</strong>{' '}
                      στη γραμμή του Safari (το τετράγωνο με το βελάκι προς τα πάνω).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 2:</strong> Κύλισε λίγο κάτω και πάτησε{' '}
                      <strong>«Προσθήκη στην Οθόνη Αφετηρίας» (Add to Home Screen)</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 3:</strong> Πάτησε <strong>Προσθήκη</strong> πάνω δεξιά. Θα
                      εμφανιστεί ως κανονικό εικονίδιο εφαρμογής KINESIS!
                    </span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs">
                <p className="font-bold text-zinc-100">
                  Πώς το κατεβάζεις στην Αρχική Οθόνη σε Android / Google Chrome:
                </p>
                <ol className="space-y-2 text-zinc-300">
                  <li>
                    <strong>Βήμα 1:</strong> Πάτησε τις <strong>3 τελείες (⋮)</strong> πάνω δεξιά
                    στον Google Chrome.
                  </li>
                  <li>
                    <strong>Βήμα 2:</strong> Επίλεξε{' '}
                    <strong>«Εγκατάσταση εφαρμογής» (Install app)</strong> ή{' '}
                    <strong>«Προσθήκη στην αρχική οθόνη»</strong>.
                  </li>
                  <li>
                    <strong>Βήμα 3:</strong> Το KINESIS θα εγκατασταθεί στην αρχική σου οθόνη και θα
                    ανοίγει σε πλήρη οθόνη χωρίς μπάρες browser!
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950"
            >
              Κατάλαβα
            </button>
          </div>
        </div>
      )}
    </>
  );
}
