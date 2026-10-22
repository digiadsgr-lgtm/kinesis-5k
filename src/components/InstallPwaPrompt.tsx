'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  Laptop,
  Link2,
  Lock,
  Moon,
  PlusSquare,
  RefreshCw,
  Share,
  Smartphone,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import {
  createCrossDeviceSyncLink,
  decodeTokenToSnapshotJson,
  getPersonalSyncKey,
  pullProgressFromCloud,
  pushProgressToCloud,
  setPersonalSyncKey,
} from '@/lib/storage/cloudSync';
import { importDatabaseJson } from '@/lib/storage/db';
import { applyThemeToDocument, getInitialTheme, ThemeMode } from './Navigation';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [theme, setTheme] = useState<ThemeMode>('dark');

  const [syncKey, setSyncKey] = useState<string>('');
  const [inputSyncKey, setInputSyncKey] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [autoRestoredBanner, setAutoRestoredBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setTheme(getInitialTheme());
    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<ThemeMode>;
      if (custom.detail) setTheme(custom.detail);
    };
    window.addEventListener('kinesis-theme-change', onThemeChange);

    const currentKey = getPersonalSyncKey();
    setSyncKey(currentKey);
    setInputSyncKey(currentKey);

    // Check if opened via a Magic Cross-Device Sync Link (?syncKey=...&syncData=...)
    const params = new URLSearchParams(window.location.search);
    const urlSyncKey = params.get('syncKey');
    const urlSyncData = params.get('syncData');

    if (urlSyncKey) {
      const cleaned = setPersonalSyncKey(urlSyncKey);
      setSyncKey(cleaned);
      setInputSyncKey(cleaned);
    }

    if (urlSyncData) {
      try {
        const json = decodeTokenToSnapshotJson(urlSyncData);
        importDatabaseJson(json)
          .then(() => {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
            setAutoRestoredBanner(
              'Η πρόοδός σου συγχρονίστηκε αυτόματα! Συνεχίζεις ακριβώς από εκεί που έμεινες.'
            );
            window.dispatchEvent(new Event('kinesis-sync-restored'));
          })
          .catch(() => {});
      } catch {
        // Ignore malformed token
      }
    } else if (urlSyncKey) {
      pullProgressFromCloud(urlSyncKey).then((res) => {
        if (res.found) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
          setAutoRestoredBanner(
            `Η πρόοδός σου φορτώθηκε επιτυχώς με τον κωδικό ${urlSyncKey}!`
          );
          window.dispatchEvent(new Event('kinesis-sync-restored'));
        }
      });
    }

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
      setDeferredPrompt(null);
      setShowInstallModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('kinesis-theme-change', onThemeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyThemeToDocument(next);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowInstallModal(false);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  const handlePushCloud = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    const clean = setPersonalSyncKey(inputSyncKey || syncKey);
    setSyncKey(clean);
    const res = await pushProgressToCloud(clean);
    setIsSyncing(false);

    if (res.ok) {
      setSyncStatus({
        type: 'success',
        text: `Η πρόοδός σου αποθηκεύτηκε με τον κωδικό ${clean}! Πληκτρολόγησε αυτόν τον κωδικό στον υπολογιστή ή στο κινητό σου για να συνεχίσεις εκεί.`,
      });
    } else {
      setSyncStatus({
        type: 'error',
        text: res.error || 'Σφάλμα αποθήκευσης. Χρησιμοποίησε το Magic Link παρακάτω.',
      });
    }
  };

  const handlePullCloud = async () => {
    if (!inputSyncKey.trim()) return;
    setIsSyncing(true);
    setSyncStatus(null);
    const clean = setPersonalSyncKey(inputSyncKey);
    setSyncKey(clean);
    const res = await pullProgressFromCloud(clean);
    setIsSyncing(false);

    if (res.ok && res.found) {
      setSyncStatus({
        type: 'success',
        text: `Τα δεδομένα από τον κωδικό ${clean} φορτώθηκαν επιτυχώς!`,
      });
      window.dispatchEvent(new Event('kinesis-sync-restored'));
    } else {
      setSyncStatus({
        type: 'error',
        text:
          res.error ||
          'Δεν βρέθηκαν αποθηκευμένα δεδομένα με αυτόν τον κωδικό. Πάτησε πρώτα «Αποθήκευση» από την άλλη σου συσκευή ή στείλε το Magic Link.',
      });
    }
  };

  const handleCopyMagicLink = async () => {
    try {
      await pushProgressToCloud(syncKey);
      const link = await createCrossDeviceSyncLink();
      await navigator.clipboard.writeText(link);
      setSyncStatus({
        type: 'success',
        text: 'Το Προσωπικό Link Συγχρονισμού αντιγράφηκε! Στείλ’ το στον εαυτό σου (Viber, WhatsApp, Email) και άνοιξέ το στον υπολογιστή ή στο κινητό σου.',
      });
    } catch {
      setSyncStatus({
        type: 'error',
        text: 'Δεν ήταν δυνατή η αυτόματη αντιγραφή. Δοκίμασε ξανά.',
      });
    }
  };

  const handleCopySyncCode = async () => {
    try {
      await navigator.clipboard.writeText(syncKey);
      setSyncStatus({
        type: 'success',
        text: `Ο κωδικός ${syncKey} αντιγράφηκε στο πρόχειρο!`,
      });
    } catch {
      // ignore
    }
  };

  return (
    <>
      {autoRestoredBanner && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3 text-xs font-semibold text-zinc-100 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{autoRestoredBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoRestoredBanner(null)}
            className="rounded-lg p-1 text-zinc-300 hover:bg-emerald-500/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sleek Top Utility Bar: Brand (Mobile), Eye-Comfort Day/Night, Cross-Device Sync & Install */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/95 px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-sm">
            <Zap className="h-4 w-4 fill-current" />
          </div>
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-zinc-50">
                KINESIS <span className="text-emerald-400">5K</span>
              </span>
              <span className="hidden rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400 sm:inline-block">
                {syncKey || '...'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Ξεκούραστη ανάγνωση μέρα & νύχτα • Συνέχεια σε Κινητό & PC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Eye-Comfort Day / Night Switcher (Always accessible on Mobile & Desktop) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-bold text-zinc-200 transition hover:border-emerald-500/40 active:scale-95"
            title="Εναλλαγή Παλέτας Ημέρας / Νύχτας (Ξεκούραστη για τα μάτια)"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Μέρα</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-emerald-400" />
                <span>Νύχτα</span>
              </>
            )}
          </button>

          {/* Cross-Device Sync Button */}
          <button
            type="button"
            onClick={() => {
              setSyncStatus(null);
              setShowSyncModal(true);
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/20 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Κινητό ↔ PC</span>
          </button>

          {/* Mobile App Install Button */}
          {!isStandalone && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-zinc-950 shadow-sm transition active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Εφαρμογή</span>
            </button>
          )}
        </div>
      </div>

      {/* CROSS-DEVICE SYNC MODAL (Mobile <-> PC without losing progress) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/90 p-3 backdrop-blur-md sm:p-4">
          <div className="my-auto w-full max-w-lg space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <Laptop className="h-5 w-5 shrink-0" />
                <h3 className="text-base font-bold text-zinc-50">
                  Συνέχεια σε Κινητό & Υπολογιστή (Χωρίς Απώλεια Προόδου)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-zinc-300">
              Το KINESIS κρατάει τα δεδομένα σου 100% ιδιωτικά (ώστε αν κάποιος άλλος ανοίξει το
              βασικό link να μη βλέπει τα στατιστικά σου). Για να συνδέσεις <strong>το δικό σου κινητό</strong>{' '}
              με <strong>τον δικό σου υπολογιστή</strong>, διάλεξε όποιον τρόπο σε βολεύει:
            </p>

            {syncStatus && (
              <div
                className={`rounded-xl border p-3 text-xs font-medium ${
                  syncStatus.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}
              >
                {syncStatus.text}
              </div>
            )}

            {/* Method 1: 1-Click Magic Sync Link */}
            <div className="space-y-2.5 rounded-xl border border-emerald-500/35 bg-zinc-950 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Link2 className="h-4 w-4" />
                <span>Τρόπος 1 (Με 1 Κλικ): Προσωπικό Link Μεταφοράς</span>
              </div>
              <p className="text-xs text-zinc-300">
                Αντιγράφει ένα προσωπικό link που μεταφέρει όλη την πρόοδό σου. Στείλ&apos; το στον
                εαυτό σου (Viber, Messenger, Email) και πάτησέ το στον υπολογιστή ή στο κινητό σου!
              </p>
              <button
                type="button"
                onClick={handleCopyMagicLink}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/20 active:scale-[0.99]"
              >
                <Copy className="h-4 w-4" />
                Αντιγραφή Προσωπικού Link Μεταφοράς
              </button>
            </div>

            {/* Method 2: Personal Sync Key (KIN-XXXX-999) */}
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-100">
                  Τρόπος 2: Με τον Προσωπικό σου Κωδικό
                </span>
                <button
                  type="button"
                  onClick={handleCopySyncCode}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  Αντιγραφή Κωδικού
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Γράψε τον ίδιο κωδικό στο κινητό και στον υπολογιστή σου. Πάτησε «Αποθήκευση» στη
                μία συσκευή και «Φόρτωση» στην άλλη:
              </p>

              <input
                type="text"
                value={inputSyncKey}
                onChange={(e) => setInputSyncKey(e.target.value.toUpperCase())}
                placeholder="π.χ. KIN-ABCD-123"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-emerald-400 focus:border-emerald-500 focus:outline-none"
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handlePushCloud}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25"
                >
                  <CloudUpload className="h-4 w-4" />
                  {isSyncing ? 'Αποθήκευση...' : '1. Αποθήκευση από εδώ'}
                </button>

                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handlePullCloud}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-xs font-bold text-zinc-100 hover:bg-zinc-700"
                >
                  <RefreshCw className="h-4 w-4 text-emerald-400" />
                  {isSyncing ? 'Φόρτωση...' : '2. Φόρτωση σε αυτή τη συσκευή'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSyncModal(false)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
            >
              Κλείσιμο
            </button>
          </div>
        </div>
      )}

      {/* INSTALL & PRIVACY EXPLANATION MODAL */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/90 p-4 backdrop-blur-md">
          <div className="my-auto w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <Smartphone className="h-5 w-5" />
                <h3 className="text-base font-bold text-zinc-50">
                  Εγκατάσταση στην Αρχική Οθόνη & Ιδιωτικότητα
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs leading-relaxed text-zinc-200">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <Lock className="h-4 w-4" />
                <span>Τι γίνεται αν δώσω το link σε άλλον;</span>
              </div>
              <p className="mt-1 text-zinc-300">
                <strong>Κανένας άλλος δεν βλέπει τα δικά σου στατιστικά ή τα PDF σου!</strong> Σε
                κάθε άλλη συσκευή ανοίγει μια εντελώς καινούργια, άδεια βάση. Μόνο εσύ μπορείς να
                συνδέσεις το κινητό με τον υπολογιστή σου με τον κωδικό <strong>{syncKey}</strong>.
              </p>
            </div>

            {isIos ? (
              <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs">
                <p className="font-bold text-zinc-100">
                  Πώς το βάζεις στην Αρχική Οθόνη σε iPhone / Safari:
                </p>
                <ol className="space-y-2 text-zinc-300">
                  <li className="flex items-start gap-2">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 1:</strong> Πάτησε το κουμπί <strong>Κοινοποίηση (Share)</strong>{' '}
                      κάτω στο Safari.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 2:</strong> Επίλεξε{' '}
                      <strong>«Προσθήκη στην Οθόνη Αφετηρίας»</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 3:</strong> Πάτησε <strong>Προσθήκη</strong> πάνω δεξιά!
                    </span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs">
                <p className="font-bold text-zinc-100">
                  Πώς το βάζεις στην Αρχική Οθόνη σε Android / Υπολογιστή (Chrome):
                </p>
                <ol className="space-y-2 text-zinc-300">
                  <li>
                    <strong>Βήμα 1:</strong> Πάτησε τις <strong>3 τελείες (⋮)</strong> πάνω δεξιά
                    στον Google Chrome.
                  </li>
                  <li>
                    <strong>Βήμα 2:</strong> Επίλεξε{' '}
                    <strong>«Εγκατάσταση εφαρμογής»</strong> ή{' '}
                    <strong>«Προσθήκη στην αρχική οθόνη»</strong>.
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
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
