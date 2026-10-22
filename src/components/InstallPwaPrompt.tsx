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
  PlusSquare,
  RefreshCw,
  Share,
  Smartphone,
  X,
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
              'Η πρόοδός σου συγχρονίστηκε αυτόματα σε αυτή τη συσκευή! Μπορείς να συνεχίσεις ακριβώς από εκεί που έμεινες.'
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
        <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/20 px-4 py-3 text-xs font-semibold text-emerald-100 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{autoRestoredBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoRestoredBanner(null)}
            className="rounded-lg p-1 text-emerald-200 hover:bg-emerald-500/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Responsive Top Action Bar: Cross-Device Sync + Mobile Install */}
      <div className="mb-4 flex flex-col justify-between gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 sm:flex-row sm:items-center sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Laptop className="h-4 w-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-zinc-100">
              Συνέχεια σε Κινητό & Υπολογιστή • 100% Ιδιωτικά
            </span>
            <p className="text-[11px] text-zinc-300">
              Κωδικός Συσκευών σου: <strong className="font-mono text-emerald-300">{syncKey || '...'}</strong>{' '}
              — Άνοιξέ το σε PC ή κινητό χωρίς να χάνεις την πρόοδό σου.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSyncStatus(null);
              setShowSyncModal(true);
            }}
            className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-zinc-900/90 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-zinc-900 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            Κινητό ↔ PC (Sync)
          </button>

          {!isStandalone && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/20 transition active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              Στο Κινητό
            </button>
          )}
        </div>
      </div>

      {/* CROSS-DEVICE SYNC MODAL (Mobile <-> PC without losing progress) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-3 sm:p-4 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6 shadow-2xl my-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <Laptop className="h-5 w-5 shrink-0" />
                <h3 className="text-base font-bold text-zinc-50">
                  Συγχρονισμός Κινητού & Υπολογιστή (Χωρίς Απώλεια Προόδου)
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
              Επειδή το KINESIS προστατεύει την ιδιωτικότητά σου (ώστε αν δώσεις το βασικό link σε
              φίλο να μη βλέπει τα δικά σου στατιστικά), μπορείς να συνδέσεις <strong>το δικό σου κινητό</strong>{' '}
              με <strong>τον δικό σου υπολογιστή</strong> με 2 πανεύκολους τρόπους:
            </p>

            {syncStatus && (
              <div
                className={`rounded-xl border p-3 text-xs font-medium ${
                  syncStatus.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                }`}
              >
                {syncStatus.text}
              </div>
            )}

            {/* Method 1: 1-Click Magic Sync Link */}
            <div className="space-y-2.5 rounded-xl border border-emerald-500/35 bg-zinc-950 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Link2 className="h-4 w-4" />
                <span>Τρόπος 1 (Πιο Γρήγορος): Προσωπικό Magic Link με 1 Κλικ</span>
              </div>
              <p className="text-xs text-zinc-300">
                Αντιγράφει ένα ειδικό προσωπικό link που περιέχει κρυπτογραφημένη την πρόοδό σου.
                Στείλ&apos; το στον εαυτό σου (Viber, Messenger, Email) και μόλις το πατήσεις στον
                υπολογιστή ή στο κινητό σου, μεταφέρονται όλα αυτόματα!
              </p>
              <button
                type="button"
                onClick={handleCopyMagicLink}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/20 active:scale-[0.99]"
              >
                <Copy className="h-4 w-4" />
                Αντιγραφή Προσωπικού Magic Link Συγχρονισμού
              </button>
            </div>

            {/* Method 2: Personal Sync Key (KIN-XXXX-999) */}
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-100">
                  Τρόπος 2: Κωδικός Συγχρονισμού (Sync Code)
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
                Γράψε τον ίδιο κωδικό στο κινητό και στον υπολογιστή σου. Με το «Αποθήκευση στο
                Cloud» ανεβάζεις την πρόοδό σου, και με το «Φόρτωση σε αυτή τη Συσκευή» την
                κατεβάζεις αμέσως.
              </p>

              <input
                type="text"
                value={inputSyncKey}
                onChange={(e) => setInputSyncKey(e.target.value.toUpperCase())}
                placeholder="π.χ. KIN-ABCD-123"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-emerald-300 focus:border-emerald-500 focus:outline-none"
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handlePushCloud}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  <CloudUpload className="h-4 w-4" />
                  {isSyncing ? 'Συγχρονισμός...' : '1. Αποθήκευση από εδώ'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl my-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <Smartphone className="h-5 w-5" />
                <h3 className="text-base font-bold text-zinc-50">
                  Προσθήκη στην Αρχική Οθόνη & Ιδιωτικότητα
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
              <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                <Lock className="h-4 w-4 text-emerald-400" />
                <span>Τι γίνεται αν δώσω το βασικό link σε άλλον;</span>
              </div>
              <p className="mt-1 text-zinc-300">
                <strong>Κανένας άλλος δεν βλέπει τα δικά σου στατιστικά ή τα PDF σου!</strong> Το
                βασικό link ανοίγει σε κάθε ξένη συσκευή μια εντελώς καινούργια, άδεια βάση. Μόνο
                εσύ μπορείς να μεταφέρεις την πρόοδό σου στον υπολογιστή σου με τον προσωπικό σου
                κωδικό <strong>{syncKey}</strong>.
              </p>
            </div>

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
                      στη γραμμή του Safari.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Βήμα 2:</strong> Επίλεξε{' '}
                      <strong>«Προσθήκη στην Οθόνη Αφετηρίας» (Add to Home Screen)</strong>.
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
                  Πώς το κατεβάζεις στην Αρχική Οθόνη σε Android / Υπολογιστή (Chrome):
                </p>
                <ol className="space-y-2 text-zinc-300">
                  <li>
                    <strong>Βήμα 1:</strong> Πάτησε τις <strong>3 τελείες (⋮)</strong> πάνω δεξιά
                    στον Google Chrome (ή το εικονίδιο εγκατάστασης στη γραμμή διεύθυνσης του PC).
                  </li>
                  <li>
                    <strong>Βήμα 2:</strong> Επίλεξε{' '}
                    <strong>«Εγκατάσταση εφαρμογής» (Install app)</strong> ή{' '}
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
