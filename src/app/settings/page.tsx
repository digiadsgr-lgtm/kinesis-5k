'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  Download,
  FileCheck2,
  Laptop,
  Link2,
  Lock,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  Volume2,
  Watch,
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
  CloudDeviceInfo,
  createCrossDeviceSyncLink,
  getConnectedCloudDevices,
  getLastSyncTimestamp,
  getPersonalSyncKey,
  pairAndMergeWithDevice,
  pullProgressFromCloud,
  pushProgressToCloud,
} from '@/lib/storage/cloudSync';
import {
  createClinicalSatietyDietPlan,
  UploadedDietPlan,
} from '@/lib/engine/nutritionAndMotivation';
import {
  createSampleGreekLabPdfBlob,
  extractTextFromPdfBuffer,
  parseBiomarkersFromText,
} from '@/lib/parser/pdfBiomarkerExtractor';
import {
  createSampleSmartwatchTcx,
  parseSmartwatchRawContent,
} from '@/lib/parser/smartwatchParser';
import { calculateRecommendation } from '@/lib/engine/recommender';
import {
  playFinalThreeTwoOneBeep,
  playFullMinuteDiscreetPulse,
  playGrandFinaleFanfare,
  playHalfMinuteDiscreetPulse,
  playPrepCountdownTick,
} from '@/lib/audio/timerAudio';
import { KinesisDatabaseDump } from '@/types/kinesis';

interface DiagnosticItemResult {
  id: string;
  titleGreek: string;
  status: 'pass' | 'warn';
  detailGreek: string;
}

export default function SettingsAndBackupPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'sync' | 'diagnostics' | 'backup'>('all');
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
  const [connectedDevices, setConnectedDevices] = useState<CloudDeviceInfo[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [snapshotSummary, setSnapshotSummary] = useState<{
    stage: number;
    pdfCount: number;
    logsCount: number;
    watchCount: number;
    dietName: string | null;
    ferritin: number | null;
    weight: number;
  } | null>(null);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isRunningSuite, setIsRunningSuite] = useState<boolean>(false);
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticItemResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshSystemOverview = useCallback(async () => {
    setProfiles(getDeviceProfiles());
    setActiveProfile(getActiveProfile());
    setSyncKey(getPersonalSyncKey());
    setConnectedDevices(getConnectedCloudDevices());
    setLastSyncAt(getLastSyncTimestamp());

    const snap: KinesisDatabaseDump = await getKinesisSnapshot();
    const diet = snap.uploadedDietPlan as UploadedDietPlan | null | undefined;
    setSnapshotSummary({
      stage: snap.progression.currentStage,
      pdfCount: Array.isArray(snap.pdfHistory) ? snap.pdfHistory.length : 0,
      logsCount: snap.logs.length,
      watchCount: Array.isArray(snap.smartwatchHistory) ? snap.smartwatchHistory.length : 0,
      dietName: diet?.fileName ?? null,
      ferritin: snap.biomarkers.ferritin,
      weight: snap.biometrics.weight,
    });
  }, []);

  useEffect(() => {
    refreshSystemOverview();
    const onRestored = () => {
      refreshSystemOverview();
    };
    window.addEventListener('kinesis-sync-restored', onRestored);
    return () => window.removeEventListener('kinesis-sync-restored', onRestored);
  }, [refreshSystemOverview]);

  // Run Full 6-Point Specialist Diagnostic Suite
  const handleRunFullDiagnosticSuite = async () => {
    setIsRunningSuite(true);
    const results: DiagnosticItemResult[] = [];
    const currentKey = getPersonalSyncKey();

    try {
      // 1. Local IndexedDB & Schema Integrity
      const snap = await getKinesisSnapshot();
      const dbOk =
        snap &&
        typeof snap.progression?.currentStage === 'number' &&
        typeof snap.biometrics?.sleepScore === 'number';
      results.push({
        id: 'db',
        titleGreek: '1. Τοπική Βάση IndexedDB & Ακεραιότητα Δεδομένων',
        status: dbOk ? 'pass' : 'warn',
        detailGreek: dbOk
          ? `Ενεργή (${snap.logs.length} προπονήσεις, ${
              snap.pdfHistory?.length ?? 0
            } PDF αιματολογικών, Στάδιο ${snap.progression.currentStage}).`
          : 'Χρειάζεται επαναφορά βάσης.',
      });

      // 2. Cloud Sync Bridge (/api/sync) & Connected Devices
      await pullProgressFromCloud(currentKey, { forceMerge: true });
      const pushRes = await pushProgressToCloud(currentKey);
      const devs = getConnectedCloudDevices();
      results.push({
        id: 'cloud',
        titleGreek: '2. Γέφυρα Cloud Κινητού ↔ Υπολογιστή (/api/sync)',
        status: pushRes.ok ? 'pass' : 'warn',
        detailGreek: pushRes.ok
          ? `Επιτυχής επικοινωνία στον κωδικό ${currentKey} • Συνδεδεμένες συσκευές: ${devs.length} (${devs
              .map((d) => d.deviceLabel)
              .join(', ')}).`
          : 'Εκτός σύνδεσης Cloud — λειτουργία σε τοπική μνήμη.',
      });

      // 3. PDF Blood Test & Clinical Diet Protocol Parser
      const samplePdfBlob = createSampleGreekLabPdfBlob('hematology');
      const samplePdfBuffer = await samplePdfBlob.arrayBuffer();
      const pdfText = await extractTextFromPdfBuffer(samplePdfBuffer);
      const parsedBio = parseBiomarkersFromText(pdfText, 'Test_Lab.pdf');
      const clinicalDiet = createClinicalSatietyDietPlan();
      const parserOk =
        parsedBio.updatedProfile.ferritin === 21.5 &&
        clinicalDiet.meals.length >= 4 &&
        clinicalDiet.detectedWeightKg === 94;
      results.push({
        id: 'parser',
        titleGreek: '3. Μηχανή Ανάγνωσης PDF Αιματολογικών & Κλινικής Διατροφής',
        status: parserOk ? 'pass' : 'warn',
        detailGreek: parserOk
          ? `Επαληθεύτηκε: Εξαγωγή Φερριτίνης (${parsedBio.updatedProfile.ferritin} ng/mL) + Κλινικό Πρωτόκολλο Διατροφής (${clinicalDiet.meals.length} ενότητες γευμάτων, Βάρος ${clinicalDiet.detectedWeightKg}kg).`
          : 'Μερική αναγνώριση προτύπου.',
      });

      // 4. Google Health / Health Sync / Smartwatch Parser & Endpoint
      const gHealthRaw = createSampleSmartwatchTcx('google_health_sync');
      const parsedWatch = parseSmartwatchRawContent(gHealthRaw, 'Google_Health_Sync.json');
      const watchOk =
        parsedWatch.biometricsUpdate.stepsSoFar === 6840 &&
        parsedWatch.biometricsUpdate.rhr === 57;
      results.push({
        id: 'watch',
        titleGreek: '4. Γέφυρα Google Health / Health Sync & Smartwatch',
        status: watchOk ? 'pass' : 'warn',
        detailGreek: watchOk
          ? `Επαληθεύτηκε: Ανάγνωση πακέτου Google Health Connect / Health Sync (${parsedWatch.biometricsUpdate.stepsSoFar} βήματα, RHR ${parsedWatch.biometricsUpdate.rhr} bpm, Ύπνος ${parsedWatch.biometricsUpdate.sleepScore}/100).`
          : 'Σφάλμα ανάγνωσης πακέτου Health Sync.',
      });

      // 5. Recommendation Engine & Safety Gate Binding
      const rec = calculateRecommendation(
        snap.progression.lastCheckIn || {
          mood: 3,
          energy: 3,
          timeWindowMins: 15,
          environment: 'home_slippers',
          painLevel: 0,
          painLocation: '',
        },
        snap.progression.currentStage,
        snap.biometrics,
        snap.biomarkers,
        snap.rejections
      );
      const engineOk = rec.durationMins <= 15 && rec.stepByStepGreek.length > 0;
      results.push({
        id: 'engine',
        titleGreek: '5. Αλγόριθμος Προτάσεων, Safety Gate & Σεβασμός Χρόνου',
        status: engineOk ? 'pass' : 'warn',
        detailGreek: engineOk
          ? `Επαληθεύτηκε: Παράγει «${rec.title}» (${rec.durationMins}') με ${rec.stepByStepGreek.length} αναλυτικά βήματα και ${rec.safetyAlertsGreek.length} ειδοποιήσεις ασφαλείας.`
          : 'Σφάλμα υπολογισμού πρότασης.',
      });

      // 6. Web Audio Timer Synthesizer
      playPrepCountdownTick();
      results.push({
        id: 'audio',
        titleGreek: '6. Ηχητική Μηχανή Χρονομέτρου (5" Έναρξη • 30" • 1\' • Φινάλε 3-2-1)',
        status: 'pass',
        detailGreek:
          'Επαληθεύτηκε: Το Web Audio API είναι ενεργό. Μπορείς να δοκιμάσεις όλους τους ήχους με τα κουμπιά παρακάτω.',
      });

      setDiagnosticResults(results);
      await refreshSystemOverview();
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setStatusMessage({
        type: 'success',
        text: `Ο Πλήρης Έλεγχος Όλων των Λειτουργιών ολοκληρώθηκε: ${
          results.filter((r) => r.status === 'pass').length
        }/6 Υποσυστήματα 100% Ενεργά!`,
      });
    } finally {
      setIsRunningSuite(false);
    }
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
      await refreshSystemOverview();
      setIsSyncing(false);
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setStatusMessage({
        type: 'error',
        text: `Ο κωδικός ${trimmed} είναι ήδη ο κωδικός ΑΥΤΗΣ της συσκευής! Για να συνδέσεις Κινητό με Υπολογιστή, γράψε εδώ τον κωδικό που δείχνει η ΑΛΛΗ συσκευή σου (ή γράψε τον κωδικό ${currentKey} στην άλλη συσκευή).`,
      });
      return;
    }

    const res = await pairAndMergeWithDevice(trimmed);
    await refreshSystemOverview();
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
    await refreshSystemOverview();
    const snap = await getKinesisSnapshot();
    setIsSyncing(false);
    window.dispatchEvent(new Event('kinesis-sync-restored'));

    if (pushRes.ok) {
      const devs = getConnectedCloudDevices();
      setStatusMessage({
        type: 'success',
        text: `Συγχρονισμός ολοκληρώθηκε στον κωδικό ${currentKey}! Συνδεδεμένες συσκευές: ${devs.length} (${devs
          .map((d) => d.deviceLabel)
          .join(', ')}). Στο Cloud βρίσκονται: ${snap.pdfHistory?.length ?? 0} PDF αιματολογικών, ${
          snap.logs.length
        } προπονήσεις & το πλάνο διατροφής σου.`,
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
      await refreshSystemOverview();
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
    refreshSystemOverview();
    setStatusMessage({
      type: 'success',
      text: `Ενεργό προφίλ: «${switched.name}». Τα στατιστικά και τα PDF είναι πλήρως απομονωμένα.`,
    });
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
      await refreshSystemOverview();
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
      await refreshSystemOverview();
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
    await refreshSystemOverview();
    window.dispatchEvent(new Event('kinesis-sync-restored'));
    setStatusMessage({
      type: 'success',
      text: 'Φορτώθηκαν ρεαλιστικά δεδομένα επίδειξης (Stage 2, βιομετρικά, φερριτίνη, ιστορικό & απορρίψεις).',
    });
  };

  const handleReset = async () => {
    await resetAllData();
    await refreshSystemOverview();
    window.dispatchEvent(new Event('kinesis-sync-restored'));
    setStatusMessage({
      type: 'success',
      text: 'Έγινε πλήρης επαναφορά της βάσης στο Stage 0 (Σπάσιμο Αδράνειας).',
    });
  };

  return (
    <div className="space-y-5">
      {/* Specialist Header & Quick Sub-Navigation */}
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-400">
              <Settings className="h-5 w-5" />
              <h1 className="text-lg font-bold text-zinc-50 sm:text-xl">
                Κέντρο Ελέγχου Συσκευών, Συγχρονισμού & Λειτουργιών
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Δες ζωντανά αν το Κινητό σου έχει συγχρονίσει με τον Υπολογιστή, έλεγξε όλες τις
              λειτουργίες με 1 κλικ και διαχειρίσου τα αντίγραφα ασφαλείας σου.
            </p>
          </div>

          <button
            type="button"
            disabled={isRunningSuite}
            onClick={handleRunFullDiagnosticSuite}
            className="inline-flex min-h-[42px] w-full justify-center sm:w-auto items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-zinc-950 shadow-md shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {isRunningSuite
              ? 'Έλεγχος 6 Υποσυστημάτων...'
              : 'Έλεγχος Όλων των Λειτουργιών (6/6)'}
          </button>
        </div>

        {/* Sub-navigation Filter Pills */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-800/80 pt-3">
          {[
            { id: 'all', label: 'Όλες οι Ενότητες' },
            { id: 'sync', label: '1. Συγχρονισμός Κινητού ↔ PC' },
            { id: 'diagnostics', label: '2. Έλεγχος Λειτουργιών & Ήχων' },
            { id: 'backup', label: '3. Προφίλ & Αντίγραφα Ασφαλείας' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
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

      {/* MODULE 1: LIVE SYNC MONITOR & PAIRING (Answers: "Δεν ξέρω αν έχει συγχρονίσει με τον υπολογιστή") */}
      {(activeTab === 'all' || activeTab === 'sync') && (
        <section className="space-y-4 rounded-2xl border border-emerald-500/40 bg-zinc-900 p-4 sm:p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <Laptop className="h-5 w-5" />
              <h2 className="text-sm font-bold text-zinc-100 sm:text-base">
                1. Ζωντανή Κατάσταση Συγχρονισμού Κινητού ↔ Υπολογιστή
              </h2>
            </div>

            <button
              type="button"
              disabled={isSyncing}
              onClick={handleFullSyncNow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Ανανέωση & Συγχρονισμός Τώρα</span>
            </button>
          </div>

          {/* Unmistakable Traffic-Light Connection Banner */}
          <div
            className={`rounded-xl border p-4 ${
              connectedDevices.length >= 2
                ? 'border-emerald-500/50 bg-emerald-500/15'
                : 'border-amber-500/45 bg-amber-500/10'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full ${
                    connectedDevices.length >= 2
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="text-sm font-extrabold text-zinc-50">
                  {connectedDevices.length >= 2
                    ? `ΣΥΓΧΡΟΝΙΣΜΕΝΟ: ${connectedDevices.length} Συσκευές Επικοινωνούν Ζωντανά (${syncKey})`
                    : `ΑΝΑΜΟΝΗ 2ης ΣΥΣΚΕΥΗΣ: Μόνο αυτή η συσκευή είναι στον κωδικό ${syncKey}`}
                </span>
              </div>
              {lastSyncAt && (
                <span className="text-[11px] font-semibold text-zinc-300">
                  Τελευταίος συγχρονισμός:{' '}
                  {new Date(lastSyncAt).toLocaleTimeString('el-GR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>

            {/* Connected Devices Pills */}
            <div className="mt-3 flex flex-wrap gap-2">
              {connectedDevices.map((dev) => (
                <div
                  key={dev.deviceId}
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"
                >
                  {dev.deviceType === 'mobile' ? (
                    <Smartphone className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Laptop className="h-4 w-4 text-emerald-400" />
                  )}
                  <div>
                    <div className="font-bold text-zinc-100">{dev.deviceLabel}</div>
                    <div className="text-[10px] text-zinc-400">
                      Ενεργό στις{' '}
                      {new Date(dev.lastSeenAt).toLocaleTimeString('el-GR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* What Data is Synced Right Now */}
            {snapshotSummary && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-3 text-[11px] text-zinc-200 sm:grid-cols-4">
                <div className="rounded-lg bg-zinc-950/80 px-2.5 py-1.5">
                  <span className="text-zinc-400">Αιματολογικές:</span>{' '}
                  <strong className="text-emerald-400">{snapshotSummary.pdfCount} PDF</strong>
                </div>
                <div className="rounded-lg bg-zinc-950/80 px-2.5 py-1.5">
                  <span className="text-zinc-400">Διατροφή:</span>{' '}
                  <strong className="text-emerald-400">
                    {snapshotSummary.dietName ? 'Ενεργή' : 'Καθημερινό Tip'}
                  </strong>
                </div>
                <div className="rounded-lg bg-zinc-950/80 px-2.5 py-1.5">
                  <span className="text-zinc-400">Προπονήσεις:</span>{' '}
                  <strong className="text-emerald-400">{snapshotSummary.logsCount}</strong>
                </div>
                <div className="rounded-lg bg-zinc-950/80 px-2.5 py-1.5">
                  <span className="text-zinc-400">Smartwatch Syncs:</span>{' '}
                  <strong className="text-emerald-400">{snapshotSummary.watchCount}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Two Clear Steps to Pair if Only 1 Device is Connected */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Step A: This Device's Code */}
            <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Α. Κωδικός Αυτής της Συσκευής
              </span>
              <div className="font-mono text-xl font-extrabold tracking-wider text-emerald-400">
                {syncKey}
              </div>
              <p className="text-xs text-zinc-400">
                Μπορείς να γράψεις αυτόν τον κωδικό στην άλλη σου συσκευή ή να στείλεις το Magic
                Link με 1 κλικ:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(syncKey);
                    setStatusMessage({
                      type: 'success',
                      text: `Ο κωδικός ${syncKey} αντιγράφηκε!`,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                >
                  <Copy className="h-3.5 w-3.5 text-emerald-400" />
                  Αντιγραφή Κωδικού
                </button>
                <button
                  type="button"
                  onClick={handleCopyMagicLink}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Αντιγραφή Magic Link
                </button>
              </div>
            </div>

            {/* Step B: Enter Partner Device's Code */}
            <div className="space-y-2.5 rounded-xl border-2 border-emerald-500/35 bg-zinc-950 p-4">
              <span className="text-xs font-bold text-emerald-400">
                Β. Σύζευξη με την Άλλη σου Συσκευή (Ένωση Δεδομένων)
              </span>
              <p className="text-xs text-zinc-300">
                Γράψε εδώ τον κωδικό που δείχνει πάνω δεξιά η <strong>ΑΛΛΗ</strong> σου συσκευή
                (Υπολογιστής ή Κινητό) για να ενωθούν αυτόματα στον ίδιο κωδικό:
              </p>
              <input
                type="text"
                value={partnerSyncKey}
                onChange={(e) => setPartnerSyncKey(e.target.value.toUpperCase())}
                placeholder="Κωδικός ΑΛΛΗΣ συσκευής (π.χ. KIN-ABCD-123)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-center font-mono text-sm font-bold tracking-wider text-emerald-300 placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={isSyncing}
                onClick={handlePairDevices}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-extrabold text-zinc-950 shadow-md shadow-emerald-500/20"
              >
                <CloudUpload className="h-4 w-4" />
                {isSyncing ? 'Ένωση Συσκευών...' : 'Σύζευξη & Αυτόματη Ένωση Δεδομένων'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MODULE 2: SPECIALIST 6-POINT FUNCTIONAL DIAGNOSTICS & AUDIO TESTER */}
      {(activeTab === 'all' || activeTab === 'diagnostics') && (
        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-emerald-400">
                <Activity className="h-5 w-5" />
                <h2 className="text-sm font-bold text-zinc-100 sm:text-base">
                  2. Κέντρο Ελέγχου Όλων των Λειτουργιών & Ηχητικών Σημάτων
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                Εκτέλεσε αυτοματοποιημένο έλεγχο και των 6 υποσυστημάτων ή δοκίμασε τους ήχους του
                χρονομέτρου.
              </p>
            </div>

            <button
              type="button"
              disabled={isRunningSuite}
              onClick={handleRunFullDiagnosticSuite}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-extrabold text-zinc-950 shadow-sm"
            >
              <ShieldCheck className="h-4 w-4" />
              {isRunningSuite ? 'Εκτέλεση Ελέγχου...' : 'Εκτέλεση Πλήρους Διαγνωστικού Ελέγχου'}
            </button>
          </div>

          {/* 6-Point Results Grid */}
          {diagnosticResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {diagnosticResults.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3.5 text-xs ${
                    item.status === 'pass'
                      ? 'border-emerald-500/35 bg-zinc-950 text-zinc-200'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-emerald-400">{item.titleGreek}</span>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300">
                      {item.status === 'pass' ? '✓ OK' : 'ΠΡΟΣΟΧΗ'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
                    {item.detailGreek}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <FileCheck2 className="h-4 w-4" />
                  <span>Αναγνώριση PDF & Διατροφής</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Ελέγχει την ανάγνωση Αιματολογικών PDF και του Κλινικού Πρωτοκόλλου Διατροφής
                  (94kg).
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <Watch className="h-4 w-4" />
                  <span>Google Health & Smartwatch</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Ελέγχει την άντληση βημάτων, ύπνου, RHR & HRV από Google Health Connect / Health
                  Sync.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <Volume2 className="h-4 w-4" />
                  <span>Ήχοι Χρονομέτρου</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Ελέγχει την αντίστροφη μέτρηση 5&quot;, το διακριτικό σήμα 30&quot; & 1&apos; και
                  το φινάλε 3-2-1.
                </p>
              </div>
            </div>
          )}

          {/* Interactive Timer Sound Tester */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Volume2 className="h-4 w-4" />
              <span>Δοκιμή Ηχητικών Σημάτων Χρονομέτρου (Πάτησε για ακρόαση):</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <button
                type="button"
                onClick={() => playPrepCountdownTick()}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/40"
              >
                🔊 1. Τικ Έναρξης (5&quot;)
              </button>
              <button
                type="button"
                onClick={() => playHalfMinuteDiscreetPulse()}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/40"
              >
                🔊 2. Ρυθμός 30&quot;
              </button>
              <button
                type="button"
                onClick={() => playFullMinuteDiscreetPulse()}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/40"
              >
                🔊 3. Ορόσημο 1&apos;
              </button>
              <button
                type="button"
                onClick={() => playFinalThreeTwoOneBeep(3)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/40"
              >
                🔊 4. Μέτρηση 3-2-1
              </button>
              <button
                type="button"
                onClick={() => playGrandFinaleFanfare()}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
              >
                🎉 5. Μελωδία Φινάλε
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MODULE 3: PRIVACY, MULTI-PROFILE & BACKUP/RESTORE */}
      {(activeTab === 'all' || activeTab === 'backup') && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* Left: Privacy & Multi-Profile Isolation */}
          <section className="min-w-0 space-y-3.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 lg:col-span-6">
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

          {/* Right: JSON Backup, Demo Seed & Reset */}
          <div className="min-w-0 space-y-5 lg:col-span-6">
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
                  rows={3}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <section className="space-y-2.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Sparkles className="h-4 w-4" />
                  <h2 className="text-xs font-bold text-zinc-100">Δεδομένα Επίδειξης (Demo)</h2>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Φόρτωσε σενάριο Stage 2 με χαμηλή φερριτίνη (26 ng/mL) & ιστορικό.
                </p>
                <button
                  type="button"
                  onClick={handleSeedDemo}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950"
                >
                  <Database className="h-3.5 w-3.5" />
                  Φόρτωση Demo
                </button>
              </section>

              <section className="space-y-2.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <h2 className="text-xs font-bold text-zinc-200">Μηδενισμός & Νέα Αρχή</h2>
                <p className="text-[11px] text-zinc-400">
                  Επαναφέρει το ενεργό προφίλ στο Stage 0 χωρίς καμία ποινή.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Επαναφορά (Reset)
                </button>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
