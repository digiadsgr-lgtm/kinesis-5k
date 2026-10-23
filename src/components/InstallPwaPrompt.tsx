'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
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
  ShieldCheck,
  Smartphone,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import {
  CloudDeviceInfo,
  createCrossDeviceSyncLink,
  decodeTokenToSnapshotJson,
  getConnectedCloudDevices,
  getPersonalSyncKey,
  mergeKinesisSnapshots,
  pairAndMergeWithDevice,
  pullProgressFromCloud,
  pushProgressToCloud,
  setPersonalSyncKey,
} from '@/lib/storage/cloudSync';
import { getKinesisSnapshot, importDatabaseJson } from '@/lib/storage/db';
import { KinesisDatabaseDump } from '@/types/kinesis';
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
  // IMPORTANT: Keep partnerSyncKey empty by default so a device NEVER pairs with itself by mistake!
  const [partnerSyncKey, setPartnerSyncKey] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    details?: string[];
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<CloudDeviceInfo[]>([]);
  const [autoRestoredBanner, setAutoRestoredBanner] = useState<string | null>(null);

  const runSilentCloudSyncCheck = useCallback(async (keyToUse?: string) => {
    const activeKey = keyToUse || getPersonalSyncKey();
    if (!activeKey) return;
    const res = await pullProgressFromCloud(activeKey);
    setConnectedDevices(getConnectedCloudDevices());
    if (res.ok && res.found) {
      setLastSyncedTime(
        new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      );
      if (res.merged) {
        window.dispatchEvent(new Event('kinesis-sync-restored'));
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setTheme(getInitialTheme());
    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<ThemeMode>;
      if (custom.detail) setTheme(custom.detail);
    };
    window.addEventListener('kinesis-theme-change', onThemeChange);

    const onOpenSyncModal = () => {
      setSyncKey(getPersonalSyncKey());
      setConnectedDevices(getConnectedCloudDevices());
      setPartnerSyncKey('');
      setSyncStatus(null);
      setShowSyncModal(true);
    };
    window.addEventListener('kinesis-open-sync-modal', onOpenSyncModal);

    const currentKey = getPersonalSyncKey();
    setSyncKey(currentKey);
    setConnectedDevices(getConnectedCloudDevices());

    // Check if opened via a Magic Cross-Device Sync Link (?syncKey=...&syncData=...)
    const params = new URLSearchParams(window.location.search);
    const urlSyncKey = params.get('syncKey');
    const urlSyncData = params.get('syncData');

    if (urlSyncKey) {
      const cleaned = setPersonalSyncKey(urlSyncKey);
      setSyncKey(cleaned);
    }

    if (urlSyncData) {
      try {
        const json = decodeTokenToSnapshotJson(urlSyncData);
        const incomingDump = JSON.parse(json) as KinesisDatabaseDump;
        getKinesisSnapshot()
          .then(async (localSnap) => {
            const merged = mergeKinesisSnapshots(localSnap, incomingDump);
            await importDatabaseJson(JSON.stringify(merged), { skipCloudPush: false });
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
            setLastSyncedTime(
              new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
            );
            setAutoRestoredBanner(
              `Η συσκευή συνδέθηκε (${urlSyncKey || currentKey})! Όλα τα δεδομένα (Αιματολογικές PDF, Προπονήσεις, Smartwatch & Διατροφή) ενώθηκαν αυτόματα.`
            );
            window.dispatchEvent(new Event('kinesis-sync-restored'));
          })
          .catch(() => {});
      } catch {
        // Ignore malformed token
      }
    } else if (urlSyncKey) {
      pairAndMergeWithDevice(urlSyncKey).then((res) => {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        if (res.ok) {
          setSyncKey(res.key);
          setLastSyncedTime(
            new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
          );
          setAutoRestoredBanner(res.messageGreek);
          window.dispatchEvent(new Event('kinesis-sync-restored'));
        }
      });
    } else {
      // Push local state on boot so the cloud slot is always initialized, then check for remote updates
      pushProgressToCloud(currentKey).then((pushRes) => {
        if (pushRes.ok) {
          setConnectedDevices(getConnectedCloudDevices());
          setLastSyncedTime(
            new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
          );
        }
      });
    }

    // Live polling every 5 seconds + on window focus/visibilitychange so Mobile <-> PC updates happen automatically!
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        runSilentCloudSyncCheck();
      }
    }, 5000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        setSyncKey(getPersonalSyncKey());
        runSilentCloudSyncCheck();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

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
      window.clearInterval(intervalId);
      window.removeEventListener('kinesis-theme-change', onThemeChange);
      window.removeEventListener('kinesis-open-sync-modal', onOpenSyncModal);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [runSilentCloudSyncCheck]);

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

  // Pair & Merge with the OTHER device's code (prevents self-pairing confusion)
  const handlePairWithOtherDevice = async () => {
    const trimmed = partnerSyncKey.trim().toUpperCase();
    if (!trimmed) {
      setSyncStatus({
        type: 'error',
        text: 'Γράψε πρώτα τον κωδικό που βλέπεις στην ΑΛΛΗ σου συσκευή (π.χ. στον Υπολογιστή ή στο Κινητό σου).',
      });
      return;
    }

    const currentDeviceKey = getPersonalSyncKey();
    setIsSyncing(true);
    setSyncStatus(null);

    if (trimmed === currentDeviceKey) {
      // User typed this device's own code! Explain clearly and still run a full Cloud Sync check.
      await pushProgressToCloud(currentDeviceKey);
      const pullRes = await pullProgressFromCloud(currentDeviceKey, { forceMerge: true });
      setConnectedDevices(getConnectedCloudDevices());
      setConnectedDevices(getConnectedCloudDevices());
      setIsSyncing(false);
      setLastSyncedTime(
        new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      );
      window.dispatchEvent(new Event('kinesis-sync-restored'));

      setSyncStatus({
        type: 'info',
        text: `Προσοχή: Ο κωδικός ${trimmed} είναι ήδη ο κωδικός ΑΥΤΗΣ της συσκευής (δεν χρειάζεται να κάνεις σύζευξη της συσκευής με τον εαυτό της!).`,
        details: [
          'Για να επικοινωνήσουν Κινητό και Υπολογιστής:',
          `1. Άνοιξε την ΑΛΛΗ συσκευή σου και γράψε εκεί τον κωδικό ${currentDeviceKey} (ή γράψε εδώ τον κωδικό που δείχνει η άλλη συσκευή).`,
          `2. Μόλις και οι 2 συσκευές έχουν τον ίδιο κωδικό (${currentDeviceKey}), ό,τι ανεβάζεις στο κινητό (π.χ. PDF αιματολογικών) εμφανίζεται αυτόματα στον υπολογιστή!`,
          pullRes.found
            ? 'Έγινε ήδη επιτυχής συγχρονισμός με το Cloud για αυτόν τον κωδικό.'
            : 'Τα δεδομένα αυτής της συσκευής ανέβηκαν στο Cloud και περιμένουν την άλλη συσκευή.',
        ],
      });
      return;
    }

    const res = await pairAndMergeWithDevice(trimmed);
    setConnectedDevices(getConnectedCloudDevices());
    setIsSyncing(false);

    if (res.ok) {
      setSyncKey(res.key);
      setPartnerSyncKey('');
      setLastSyncedTime(
        new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      );
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setSyncStatus({
        type: 'success',
        text: res.messageGreek,
        details: [
          `Κοινός Κωδικός Συσκευών: ${res.key}`,
          `Αιματολογικές PDF που συγχρονίστηκαν: ${res.summary?.pdfCount ?? 0} αρχεία`,
          `Καταγεγραμμένες Προπονήσεις: ${res.summary?.logsCount ?? 0}`,
          `Συγχρονισμοί Smartwatch: ${res.summary?.watchSyncsCount ?? 0}`,
        ],
      });
    } else {
      setSyncStatus({
        type: 'error',
        text: res.messageGreek,
      });
    }
  };

  // 1-Click Full Connectivity & Interconnectivity Diagnostic Check
  const handleRunFullConnectivityCheck = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    const activeKey = getPersonalSyncKey();
    setSyncKey(activeKey);

    try {
      // 1. Pull and merge any remote data on this key first
      const pullRes = await pullProgressFromCloud(activeKey, { forceMerge: true });
      // 2. Push the merged snapshot (including PDFs, Biomarkers, Watch, Diet, Goal)
      const pushRes = await pushProgressToCloud(activeKey);
      // 3. Read final local snapshot to verify all subsystems
      const snap = await getKinesisSnapshot();

      setConnectedDevices(getConnectedCloudDevices());
      setIsSyncing(false);
      setLastSyncedTime(
        new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      );
      window.dispatchEvent(new Event('kinesis-sync-restored'));

      const pdfCount = snap.pdfHistory?.length ?? 0;
      const watchCount = snap.smartwatchHistory?.length ?? 0;
      const logsCount = snap.logs?.length ?? 0;
      const dietFileName = (snap.uploadedDietPlan as { fileName?: string } | null | undefined)
        ?.fileName;
      const hasDiet = Boolean(dietFileName);

      if (pushRes.ok) {
        setSyncStatus({
          type: 'success',
          text: `Ο Έλεγχος Διασύνδεσης & Συνδεσιμότητας ολοκληρώθηκε 100% επιτυχώς στον κωδικό ${activeKey}!`,
          details: [
            `Cloud Γέφυρα (Κινητό ↔ PC): ΕΝΕΡΓΗ (${pullRes.found ? 'Ενώθηκαν δεδομένα Cloud + Συσκευής' : 'Αποθηκεύτηκε πλήρες αντίγραφο στο Cloud'})`,
            `Αιματολογικές Εξετάσεις (PDF): ${pdfCount} αρχεία PDF ενεργά (Φερριτίνη: ${snap.biomarkers.ferritin ?? '—'} ng/mL, Hb: ${snap.biomarkers.hemoglobin ?? '—'} g/dL, Vit D: ${snap.biomarkers.vitaminD ?? '—'} ng/mL)`,
            `Smartwatch & Βιομετρικά: Ύπνος ${snap.biometrics.sleepScore}/100, RHR ${snap.biometrics.rhr} bpm (${watchCount} συγχρονισμοί ρολογιού)`,
            `Στόχος & Διατροφή: Στάδιο ${snap.progression.currentStage} • ${logsCount} προπονήσεις • ${hasDiet ? `Διατροφή «${dietFileName}»` : 'Καθημερινό Διατροφικό Tip ενεργό'}`,
          ],
        });
      } else {
        setSyncStatus({
          type: 'error',
          text: pushRes.error || 'Σφάλμα επικοινωνίας με τον διακομιστή συγχρονισμού.',
        });
      }
    } catch {
      setIsSyncing(false);
      setSyncStatus({
        type: 'error',
        text: 'Αδυναμία ολοκλήρωσης ελέγχου συνδεσιμότητας.',
      });
    }
  };

  const handleCopyMagicLink = async () => {
    try {
      setIsSyncing(true);
      await pushProgressToCloud(syncKey);
      const link = await createCrossDeviceSyncLink();
      await navigator.clipboard.writeText(link);
      setConnectedDevices(getConnectedCloudDevices());
      setIsSyncing(false);
      setLastSyncedTime(
        new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      );
      setSyncStatus({
        type: 'success',
        text: 'Το Προσωπικό Link Σύζευξης αντιγράφηκε! Στείλ’ το στην άλλη σου συσκευή (Viber, WhatsApp, Email, Messenger) και πάτησέ το εκεί. Θα ενώσει αυτόματα Κινητό & Υπολογιστή στον ίδιο κωδικό!',
      });
    } catch {
      setIsSyncing(false);
      setSyncStatus({
        type: 'error',
        text: 'Δεν ήταν δυνατή η αυτόματη αντιγραφή. Δοκίμασε ξανά.',
      });
    }
  };

  const handleCopySyncCode = async () => {
    try {
      await pushProgressToCloud(syncKey);
      await navigator.clipboard.writeText(syncKey);
      setLastSyncedTime(
        new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      );
      setSyncStatus({
        type: 'success',
        text: `Ο κωδικός αυτής της συσκευής (${syncKey}) αποθηκεύτηκε στο Cloud και αντιγράφηκε! Άνοιξε την ΑΛΛΗ συσκευή σου και επικόλλησέ τον στο πεδίο «Σύζευξη με Άλλη Συσκευή».`,
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

      {/* Sleek Top Utility Bar: Brand, Live Sync Code, Eye-Comfort Day/Night, Cross-Device Sync & Install */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/95 px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-sm">
            <Zap className="h-4 w-4 fill-current" />
          </div>
          <div className="text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-extrabold tracking-tight text-zinc-50">
                KINESIS <span className="text-emerald-400">5K</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSyncStatus(null);
                  setPartnerSyncKey('');
                  setConnectedDevices(getConnectedCloudDevices());
                  setShowSyncModal(true);
                }}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold transition ${
                  connectedDevices.length >= 2
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                }`}
                title="Κατάσταση Συγχρονισμού Κινητού ↔ PC"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    connectedDevices.length >= 2 ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                {syncKey || '...'} •{' '}
                {connectedDevices.length >= 2
                  ? `Συνδεδεμένο (${connectedDevices.length} συσκευές)`
                  : '1 συσκευή (Πάτησε για σύνδεση)'}
              </button>
              {lastSyncedTime && (
                <span className="hidden text-[10px] text-zinc-400 md:inline">
                  • Sync {lastSyncedTime}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              Ζωντανή γέφυρα Αιματολογικών PDF, Smartwatch, Διατροφής & Κινητού ↔ PC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Eye-Comfort Day / Night Switcher */}
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

          {/* Cross-Device Sync & Diagnostic Button */}
          <button
            type="button"
            onClick={() => {
              setSyncStatus(null);
              setPartnerSyncKey('');
              setShowSyncModal(true);
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/20 active:scale-95"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
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

      {/* CROSS-DEVICE SYNC & CONNECTIVITY DIAGNOSTIC MODAL (Fixes Self-Pairing & Merges PDFs/All Data) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/90 p-3 backdrop-blur-md sm:p-4">
          <div className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <Laptop className="h-5 w-5 shrink-0" />
                <h3 className="text-base font-bold text-zinc-50">
                  Σύζευξη Κινητού ↔ Υπολογιστή & Έλεγχος Διασύνδεσης
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

            {/* LIVE MULTI-DEVICE CONNECTION STATUS BOX */}
            <div
              className={`rounded-xl border p-3.5 text-xs leading-relaxed ${
                connectedDevices.length >= 2
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-zinc-100'
                  : 'border-amber-500/40 bg-amber-500/10 text-zinc-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-emerald-400">
                  {connectedDevices.length >= 2
                    ? `🟢 ΕΝΕΡΓΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ: ${connectedDevices.length} Συσκευές στον κωδικό ${syncKey}`
                    : `🟡 Μόνο 1 συσκευή είναι αυτή τη στιγμή στον κωδικό ${syncKey}`}
                </span>
                {lastSyncedTime && (
                  <span className="text-[11px] text-zinc-300">
                    Τελευταία επικοινωνία: {lastSyncedTime}
                  </span>
                )}
              </div>

              {connectedDevices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {connectedDevices.map((dev) => (
                    <span
                      key={dev.deviceId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
                    >
                      {dev.deviceType === 'mobile' ? (
                        <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Laptop className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      <span>{dev.deviceLabel}</span>
                      <span className="text-[10px] text-zinc-400">
                        (
                        {new Date(dev.lastSeenAt).toLocaleTimeString('el-GR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        )
                      </span>
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-2 text-[11px] text-zinc-300">
                {connectedDevices.length >= 2
                  ? '✓ Το Κινητό και ο Υπολογιστής σου επικοινωνούν κανονικά! Ό,τι ανεβάζεις στη μία συσκευή εμφανίζεται αυτόματα στην άλλη.'
                  : `Για να συνδεθεί η άλλη σου συσκευή, άνοιξέ την και γράψε τον κωδικό ${syncKey} στο πεδίο «2. Σύζευξη με την Άλλη σου Συσκευή» (ή γράψε εδώ τον κωδικό που δείχνει εκείνη).`}
              </p>
            </div>

            {syncStatus && (
              <div
                className={`space-y-1.5 rounded-xl border p-3.5 text-xs ${
                  syncStatus.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                    : syncStatus.type === 'info'
                    ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                }`}
              >
                <div className="flex items-start gap-2 font-bold">
                  {syncStatus.type === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <span>{syncStatus.text}</span>
                </div>
                {syncStatus.details && syncStatus.details.length > 0 && (
                  <ul className="mt-1.5 space-y-1 pl-6 text-[11px] text-zinc-200">
                    {syncStatus.details.map((d, i) => (
                      <li key={i} className="list-disc">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* BOX 1: THIS DEVICE'S CODE */}
            <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    1. Κωδικός Αυτής της Συσκευής
                  </span>
                  <div className="mt-0.5 font-mono text-lg font-extrabold tracking-wider text-emerald-400">
                    {syncKey}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopySyncCode}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Αντιγραφή Κωδικού
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyMagicLink}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 shadow-sm"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Magic Link (1-Κλικ)
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">
                Αν βρίσκεσαι στον Υπολογιστή, γράψε αυτόν τον κωδικό ({syncKey}) στο Κινητό σου (στο
                πεδίο 2 παρακάτω) — ή το αντίστροφο!
              </p>
            </div>

            {/* BOX 2: ENTER THE OTHER DEVICE'S CODE TO PAIR & MERGE */}
            <div className="space-y-3 rounded-xl border-2 border-emerald-500/40 bg-zinc-950 p-4">
              <div>
                <span className="text-xs font-bold text-emerald-400">
                  2. Σύζευξη με την Άλλη σου Συσκευή (Ένωση Κινητού + Υπολογιστή)
                </span>
                <p className="mt-1 text-xs text-zinc-300">
                  Γράψε εδώ τον κωδικό που βλέπεις πάνω δεξιά στην <strong>ΑΛΛΗ</strong> σου συσκευή.
                  Τα δεδομένα και των δύο συσκευών (Αιματολογικές PDF, Προπονήσεις, Smartwatch,
                  Διατροφή) θα ενωθούν χωρίς να χαθεί τίποτα:
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={partnerSyncKey}
                  onChange={(e) => setPartnerSyncKey(e.target.value.toUpperCase())}
                  placeholder="Γράψε τον κωδικό της ΑΛΛΗΣ συσκευής (π.χ. KIN-ABCD-123)"
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-emerald-400 placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handlePairWithOtherDevice}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-extrabold text-zinc-950 shadow-md shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
                >
                  <CloudUpload className="h-4 w-4" />
                  {isSyncing ? 'Ένωση...' : 'Σύζευξη & Ένωση Δεδομένων'}
                </button>
              </div>
            </div>

            {/* BOX 3: 1-CLICK DIAGNOSTIC & IMMEDIATE SYNC */}
            <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  3. Έχουν ήδη τον ίδιο κωδικό; Κάνε Άμεσο Έλεγχο & Συγχρονισμό
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Ελέγχει τη σύνδεση Cloud, τραβάει τυχόν νέα PDF/προπονήσεις από την άλλη συσκευή και
                επιβεβαιώνει ότι Αιματολογικές + Smartwatch + Διατροφή + Προπόνηση μιλάνε μεταξύ
                τους:
              </p>
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleRunFullConnectivityCheck}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing
                  ? 'Έλεγχος & Συγχρονισμός...'
                  : 'Άμεσος Έλεγχος Λειτουργικότητας, Διασύνδεσης & Συγχρονισμός Τώρα'}
              </button>
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
