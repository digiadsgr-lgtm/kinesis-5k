'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  Download,
  Laptop,
  Link2,
  Lock,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  createDeviceProfile,
  DEFAULT_PROFILE,
  exportDatabaseJson,
  getActiveProfile,
  getDeviceProfiles,
  getKinesisSnapshot,
  importDatabaseJson,
  LocalUserProfile,
  resetAllData,
  seedDemoData,
  switchActiveProfile,
} from '@/lib/storage/db';
import {
  createCrossDeviceSyncLink,
  getPersonalSyncKey,
  pairAndMergeWithDevice,
  pullProgressFromCloud,
  pushProgressToCloud,
} from '@/lib/storage/cloudSync';

export default function SettingsAndBackupPage() {
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [rawJsonInput, setRawJsonInput] = useState<string>('');
  const [profiles, setProfiles] = useState<LocalUserProfile[]>([DEFAULT_PROFILE]);
  const [activeProfile, setActiveProfile] = useState<LocalUserProfile>(DEFAULT_PROFILE);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [syncKey, setSyncKey] = useState<string>('');
  const [partnerSyncKey, setPartnerSyncKey] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfiles(getDeviceProfiles());
    setActiveProfile(getActiveProfile());
    setSyncKey(getPersonalSyncKey());
    const onRestored = () => {
      setSyncKey(getPersonalSyncKey());
    };
    window.addEventListener('kinesis-sync-restored', onRestored);
    return () => window.removeEventListener('kinesis-sync-restored', onRestored);
  }, []);

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    const created = createDeviceProfile(newProfileName);
    setProfiles(getDeviceProfiles());
    setActiveProfile(created);
    setNewProfileName('');
    setStatusMessage({
      type: 'success',
      text: `Δημιουργήθηκε και ενεργοποιήθηκε το ξεχωριστό προφίλ «${created.name}» με δική του απομονωμένη βάση!`,
    });
  };

  const handleSwitchProfile = (profileId: string) => {
    const switched = switchActiveProfile(profileId);
    setActiveProfile(switched);
    setStatusMessage({
      type: 'success',
      text: `Ενεργό προφίλ: «${switched.name}». Τα στατιστικά και τα PDF είναι πλήρως απομονωμένα.`,
    });
  };

  const handlePairDevices = async () => {
    const trimmed = partnerSyncKey.trim().toUpperCase();
    if (!trimmed) {
      setStatusMessage({
        type: 'error',
        text: 'Γράψε πρώτα τον κωδικό που βλέπεις στην ΑΛΛΗ σου συσκευή (Κινητό ή Υπολογιστή).',
      });
      return;
    }

    const currentKey = getPersonalSyncKey();
    setIsSyncing(true);

    if (trimmed === currentKey) {
      await pushProgressToCloud(currentKey);
      await pullProgressFromCloud(currentKey, { forceMerge: true });
      setIsSyncing(false);
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setStatusMessage({
        type: 'error',
        text: `Ο κωδικός ${trimmed} είναι ήδη ο κωδικός ΑΥΤΗΣ της συσκευής! Για να συνδέσεις Κινητό με Υπολογιστή, γράψε εδώ τον κωδικό που δείχνει η ΑΛΛΗ συσκευή σου (ή γράψε τον κωδικό ${currentKey} στην άλλη συσκευή).`,
      });
      return;
    }

    const res = await pairAndMergeWithDevice(trimmed);
    setIsSyncing(false);

    if (res.ok) {
      setSyncKey(res.key);
      setPartnerSyncKey('');
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setStatusMessage({
        type: 'success',
        text: res.messageGreek,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: res.messageGreek,
      });
    }
  };

  const handleFullSyncNow = async () => {
    setIsSyncing(true);
    const currentKey = getPersonalSyncKey();
    await pullProgressFromCloud(currentKey, { forceMerge: true });
    const pushRes = await pushProgressToCloud(currentKey);
    const snap = await getKinesisSnapshot();
    setIsSyncing(false);
    window.dispatchEvent(new Event('kinesis-sync-restored'));

    if (pushRes.ok) {
      setStatusMessage({
        type: 'success',
        text: `Πλήρης συγχρονισμός & έλεγχος διασύνδεσης ολοκληρώθηκε στον κωδικό ${currentKey}! Συγχρονίστηκαν: ${snap.pdfHistory?.length ?? 0} αρχεία PDF αιματολογικών, ${snap.logs.length} προπονήσεις, ${snap.smartwatchHistory?.length ?? 0} συγχρονισμοί Smartwatch & το πλάνο διατροφής σου.`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: pushRes.error || 'Σφάλμα επικοινωνίας με το Cloud.',
      });
    }
  };

  const handleCopyMagicLink = async () => {
    try {
      await pushProgressToCloud(syncKey);
      const link = await createCrossDeviceSyncLink();
      await navigator.clipboard.writeText(link);
      setStatusMessage({
        type: 'success',
        text: 'Το Προσωπικό Magic Link αντιγράφηκε! Στείλ’ το στον εαυτό σου και άνοιξέ το στον υπολογιστή ή στο κινητό σου για αυτόματη ένωση προόδου & PDF.',
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Αδυναμία αυτόματης αντιγραφής συνδέσμου.',
      });
    }
  };

  const handleExportJson = async () => {
    try {
      const jsonStr = await exportDatabaseJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kinesis-backup-${activeProfile.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage({
        type: 'success',
        text: 'Το πλήρες αντίγραφο ασφαλείας JSON (μαζί με PDF αιματολογικών, Smartwatch & Διατροφή) εξήχθη με επιτυχία.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Σφάλμα κατά την εξαγωγή JSON.',
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importDatabaseJson(text);
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setStatusMessage({
        type: 'success',
        text: 'Η εισαγωγή και επικύρωση του αρχείου JSON ολοκληρώθηκε επιτυχώς!',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Σφάλμα επικύρωσης σχήματος κατά την εισαγωγή JSON.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteImport = async () => {
    if (!rawJsonInput.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Επικόλλησε πρώτα το περιεχόμενο JSON στο πεδίο κειμένου.',
      });
      return;
    }
    try {
      await importDatabaseJson(rawJsonInput);
      setRawJsonInput('');
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setStatusMessage({
        type: 'success',
        text: 'Τα δεδομένα JSON επικυρώθηκαν και αποκαταστάθηκαν επιτυχώς.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Μη έγκυρο σχήμα JSON.',
      });
    }
  };

  const handleSeedDemo = async () => {
    await seedDemoData();
    window.dispatchEvent(new Event('kinesis-sync-restored'));
    setStatusMessage({
      type: 'success',
      text: 'Φορτώθηκαν ρεαλιστικά δεδομένα επίδειξης (Stage 2, βιομετρικά, φερριτίνη, ιστορικό & απορρίψεις).',
    });
  };

  const handleReset = async () => {
    await resetAllData();
    window.dispatchEvent(new Event('kinesis-sync-restored'));
    setStatusMessage({
      type: 'success',
      text: 'Έγινε πλήρης επαναφορά της βάσης στο Stage 0 (Σπάσιμο Αδράνειας).',
    });
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Settings className="h-5 w-5" />
          <h1 className="text-lg font-bold text-zinc-50">
            Ρυθμίσεις, Σύζευξη Κινητού ↔ PC & Ιδιωτικότητα
          </h1>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Ένωσε το κινητό με τον υπολογιστή σου ώστε οι Αιματολογικές (PDF), το Smartwatch, η
          Διατροφή και οι Προπονήσεις να ενημερώνονται αυτόματα και στις δύο συσκευές.
        </p>
      </header>

      {statusMessage && (
        <div
          className={`flex items-start gap-2.5 rounded-2xl border p-4 text-xs font-medium ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 100% Responsive 2-Column Layout on Desktop, 1-Column on Mobile */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: Cross-Device Sync & Privacy/Profiles */}
        <div className="space-y-5 lg:col-span-6">
          {/* CROSS-DEVICE SYNC (Mobile <-> PC) */}
          <section className="space-y-3.5 rounded-2xl border border-emerald-500/40 bg-zinc-900 p-4 sm:p-5 shadow-lg">
            <div className="flex items-center gap-2 text-emerald-400">
              <Laptop className="h-5 w-5" />
              <h2 className="text-sm font-bold text-zinc-100 sm:text-base">
                Σύζευξη Κινητού ↔ Υπολογιστή (Αυτόματη Ένωση PDF, Smartwatch & Προόδου)
              </h2>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase text-zinc-400">
                    Κωδικός αυτής της συσκευής:
                  </span>
                  <div className="font-mono text-base font-extrabold text-emerald-400">
                    {syncKey}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyMagicLink}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 shadow-sm"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Αντιγραφή Magic Link
                </button>
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border-2 border-emerald-500/35 bg-zinc-950 p-3.5">
              <label className="block text-xs font-bold text-emerald-400">
                Σύζευξη με την Άλλη σου Συσκευή (Γράψε τον κωδικό που δείχνει η άλλη συσκευή):
              </label>
              <p className="text-[11px] text-zinc-400">
                Μην γράψεις τον κωδικό αυτής της συσκευής ({syncKey}). Γράψε τον κωδικό που βλέπεις
                πάνω δεξιά στην άλλη σου συσκευή (π.χ. στον Υπολογιστή ή στο Κινητό):
              </p>
              <input
                type="text"
                value={partnerSyncKey}
                onChange={(e) => setPartnerSyncKey(e.target.value.toUpperCase())}
                placeholder="Γράψε τον κωδικό της ΑΛΛΗΣ συσκευής (π.χ. KIN-ABCD-123)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-emerald-300 placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handlePairDevices}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-extrabold text-zinc-950 shadow-md shadow-emerald-500/20"
                >
                  <CloudUpload className="h-4 w-4" />
                  Σύζευξη & Ένωση Δεδομένων
                </button>
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleFullSyncNow}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Έλεγχος & Συγχρονισμός Τώρα
                </button>
              </div>
            </div>
          </section>

          {/* Privacy & Multi-Profile Isolation Card */}
          <section className="space-y-3.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-emerald-400">
              <Lock className="h-4 w-4" />
              <h2 className="text-sm font-bold text-zinc-100">
                Ιδιωτικότητα & Πολλαπλά Προφίλ στην Ίδια Συσκευή
              </h2>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs leading-relaxed text-zinc-300">
              <p>
                <strong className="text-emerald-400">1. Αν δώσεις το βασικό link σε άλλον:</strong>{' '}
                Κανένας άλλος δεν βλέπει τα δικά σου στατιστικά ή τα PDF σου! Κάθε ξένη συσκευή
                ανοίγει δική της, εντελώς άδεια βάση.
              </p>
              <p className="mt-2">
                <strong className="text-emerald-400">2. Στο ΙΔΙΟ κινητό ή υπολογιστή:</strong> Αν
                δύο μέλη της οικογένειας χρησιμοποιούν την ίδια συσκευή, μπορείς να φτιάξεις
                ξεχωριστό προφίλ παρακάτω:
              </p>
            </div>

            {/* Profile Switcher */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>Ενεργό Προφίλ σε αυτή τη Συσκευή:</span>
              </div>

              <div className="space-y-1.5">
                {profiles.map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => handleSwitchProfile(prof.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition ${
                      activeProfile.id === prof.id
                        ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{prof.name}</span>
                    {activeProfile.id === prof.id && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                        Ενεργό
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <form onSubmit={handleCreateProfile} className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Όνομα νέου προφίλ (π.χ. Μαρία, Γιώργος)..."
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-zinc-950"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Προσθήκη
                </button>
              </form>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: JSON Backup, Demo Data & Reset */}
        <div className="space-y-5 lg:col-span-6">
          {/* JSON Backup Export / Import */}
          <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <h2 className="text-sm font-bold text-zinc-100">
              1-Click Αντίγραφο Ασφαλείας Αρχείου (JSON Export / Import)
            </h2>
            <p className="text-xs text-zinc-400">
              Εξαγωγή της βάσης του ενεργού προφίλ («{activeProfile.name}») σε αρχείο JSON ή
              επαναφορά από αρχείο.
            </p>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
              >
                <Download className="h-4 w-4" />
                Εξαγωγή JSON Backup
              </button>

              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-xs font-bold text-zinc-200 hover:bg-zinc-700">
                <Upload className="h-4 w-4 text-emerald-400" />
                Εισαγωγή από Αρχείο JSON
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="pt-2">
              <label className="block text-xs text-zinc-400">
                Ή επικόλλησε απευθείας JSON Backup εδώ:
              </label>
              <textarea
                rows={4}
                value={rawJsonInput}
                onChange={(e) => setRawJsonInput(e.target.value)}
                placeholder='{"schemaVersion": "1.1.0", "progression": ...}'
                className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePasteImport}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Επικύρωση & Εισαγωγή Κειμένου JSON
              </button>
            </div>
          </section>

          {/* Demo Seed Card */}
          <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-emerald-400">
              <Sparkles className="h-4 w-4" />
              <h2 className="text-sm font-bold text-zinc-100">Δεδομένα Επίδειξης (Demo Προφίλ)</h2>
            </div>
            <p className="text-xs text-zinc-400">
              Φόρτωσε με 1 κλικ ένα ρεαλιστικό σενάριο εργαζόμενου γραφείου στο Stage 2, με χαμηλή
              φερριτίνη (26 ng/mL), ιστορικό συνεδριών και μνήμη απορρίψεων.
            </p>
            <button
              type="button"
              onClick={handleSeedDemo}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
            >
              <Database className="h-4 w-4" />
              Φόρτωση Ρεαλιστικών Demo Δεδομένων
            </button>
          </section>

          {/* Danger Zone: Reset */}
          <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <h2 className="text-sm font-bold text-zinc-200">Μηδενισμός & Νέα Αρχή</h2>
            <p className="text-xs text-zinc-400">
              Διαγράφει τις τοπικές εγγραφές του ενεργού προφίλ και επαναφέρει το Stage 0 χωρίς
              καμία ποινή.
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 py-3 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
            >
              <RotateCcw className="h-4 w-4" />
              Επαναφορά στο Stage 0 (Reset)
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
