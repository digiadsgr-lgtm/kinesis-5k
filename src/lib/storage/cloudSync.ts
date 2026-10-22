import {
  BiomarkerProfile,
  KinesisDatabaseDump,
  MovementLog,
  RejectionEvent,
  StageId,
} from '@/types/kinesis';
import {
  DEFAULT_BIOMARKERS,
  getKinesisSnapshot,
  importDatabaseJson,
  recordLocalModificationTime,
} from './db';

const SYNC_KEY_STORAGE = 'kinesis_personal_sync_key_v1';
const PAIRED_STATUS_STORAGE = 'kinesis_is_paired_device_v1';
const LAST_SYNC_TIME_STORAGE = 'kinesis_last_sync_at_v1';

export function getPersonalSyncKey(): string {
  if (typeof window === 'undefined' || !('localStorage' in window)) return '';
  let existing = window.localStorage.getItem(SYNC_KEY_STORAGE);
  if (!existing) {
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const numPart = Math.floor(100 + Math.random() * 900);
    existing = `KIN-${randomPart}-${numPart}`;
    window.localStorage.setItem(SYNC_KEY_STORAGE, existing);
  }
  return existing;
}

export function setPersonalSyncKey(newKey: string): string {
  const clean = newKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (typeof window !== 'undefined' && 'localStorage' in window && clean.length >= 4) {
    window.localStorage.setItem(SYNC_KEY_STORAGE, clean);
  }
  return clean;
}

export function isDevicePaired(): boolean {
  if (typeof window === 'undefined' || !('localStorage' in window)) return false;
  return window.localStorage.getItem(PAIRED_STATUS_STORAGE) === 'true';
}

export function setDevicePaired(paired: boolean): void {
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    window.localStorage.setItem(PAIRED_STATUS_STORAGE, paired ? 'true' : 'false');
  }
}

export function getLastSyncTimestamp(): string | null {
  if (typeof window === 'undefined' || !('localStorage' in window)) return null;
  return window.localStorage.getItem(LAST_SYNC_TIME_STORAGE);
}

function recordSyncTimestamp(): string {
  const now = new Date().toISOString();
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    window.localStorage.setItem(LAST_SYNC_TIME_STORAGE, now);
  }
  return now;
}

/**
 * Intelligently merges two KinesisDatabaseDump snapshots (Local + Cloud)
 * so that uploaded PDFs, blood biomarkers, diet plans, smartwatch data, and workout logs
 * from EITHER device (Phone or PC) are never lost during pairing or syncing!
 */
export function mergeKinesisSnapshots(
  localSnap: KinesisDatabaseDump,
  remoteSnap: KinesisDatabaseDump
): KinesisDatabaseDump {
  const localTime = new Date(localSnap.exportedAt || 0).getTime();
  const remoteTime = new Date(remoteSnap.exportedAt || 0).getTime();
  const remoteIsNewer = remoteTime >= localTime;

  const primary = remoteIsNewer ? remoteSnap : localSnap;
  const secondary = remoteIsNewer ? localSnap : remoteSnap;

  // 1. Merge Logs (deduplicate by id)
  const logMap = new Map<string, MovementLog>();
  for (const l of [...(secondary.logs || []), ...(primary.logs || [])]) {
    if (l && l.id) logMap.set(l.id, l);
  }
  const mergedLogs = Array.from(logMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 2. Merge Rejections (deduplicate by id)
  const rejMap = new Map<string, RejectionEvent>();
  for (const r of [...(secondary.rejections || []), ...(primary.rejections || [])]) {
    if (r && r.id) rejMap.set(r.id, r);
  }
  const mergedRejections = Array.from(rejMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 3. Merge PDF History (deduplicate by fileName or id so uploaded blood tests always transfer!)
  const pdfMap = new Map<string, Record<string, unknown>>();
  const allPdfs = [
    ...((secondary.pdfHistory as Array<Record<string, unknown>>) || []),
    ...((primary.pdfHistory as Array<Record<string, unknown>>) || []),
  ];
  for (const p of allPdfs) {
    if (p && typeof p === 'object') {
      const key = String(p.fileName || p.id || Math.random());
      pdfMap.set(key, p);
    }
  }
  const mergedPdfHistory = Array.from(pdfMap.values());

  // 4. Merge Smartwatch History
  const swMap = new Map<string, Record<string, unknown>>();
  const allSw = [
    ...((secondary.smartwatchHistory as Array<Record<string, unknown>>) || []),
    ...((primary.smartwatchHistory as Array<Record<string, unknown>>) || []),
  ];
  for (const s of allSw) {
    if (s && typeof s === 'object') {
      const key = String(s.id || s.syncedAt || Math.random());
      swMap.set(key, s);
    }
  }
  const mergedSmartwatchHistory = Array.from(swMap.values());

  // 5. Merge Biomarkers: prefer non-default / PDF-extracted values if one device still has defaults
  const isDefaultBiomarkers = (b: BiomarkerProfile) =>
    b.ferritin === DEFAULT_BIOMARKERS.ferritin &&
    b.hemoglobin === DEFAULT_BIOMARKERS.hemoglobin &&
    b.vitaminD === DEFAULT_BIOMARKERS.vitaminD &&
    !b.medicalRestrictions;

  let mergedBiomarkers: BiomarkerProfile = primary.biomarkers;
  if (isDefaultBiomarkers(primary.biomarkers) && !isDefaultBiomarkers(secondary.biomarkers)) {
    mergedBiomarkers = secondary.biomarkers;
  } else if (!isDefaultBiomarkers(primary.biomarkers) && !isDefaultBiomarkers(secondary.biomarkers)) {
    mergedBiomarkers = {
      ...secondary.biomarkers,
      ...primary.biomarkers,
      medicalRestrictions:
        primary.biomarkers.medicalRestrictions || secondary.biomarkers.medicalRestrictions,
    };
  }

  // 6. Merge Progression: keep highest stage & scores, and most recent check-in
  const mergedProgression = {
    ...primary.progression,
    currentStage: Math.max(
      localSnap.progression.currentStage,
      remoteSnap.progression.currentStage
    ) as StageId,
    habitConsistencyScore: Math.max(
      localSnap.progression.habitConsistencyScore,
      remoteSnap.progression.habitConsistencyScore
    ),
    runningReadiness: Math.max(
      localSnap.progression.runningReadiness,
      remoteSnap.progression.runningReadiness
    ),
    totalSessionsCompleted: Math.max(
      mergedLogs.length,
      localSnap.progression.totalSessionsCompleted,
      remoteSnap.progression.totalSessionsCompleted
    ),
    lastCheckIn: primary.progression.lastCheckIn || secondary.progression.lastCheckIn,
  };

  return {
    schemaVersion: primary.schemaVersion || '1.1.0',
    exportedAt: new Date(Math.max(localTime, remoteTime, Date.now())).toISOString(),
    progression: mergedProgression,
    biometrics: primary.biometrics,
    biomarkers: mergedBiomarkers,
    logs: mergedLogs,
    rejections: mergedRejections,
    pdfHistory: mergedPdfHistory,
    transformationGoal: primary.transformationGoal ?? secondary.transformationGoal,
    uploadedDietPlan: primary.uploadedDietPlan ?? secondary.uploadedDietPlan,
    smartwatchHistory: mergedSmartwatchHistory,
  };
}

/**
 * Encodes a UTF-8 string into URL-safe Base64 so a user can transfer their full state
 * between Mobile & Desktop via a single clickable link (?syncKey=...&syncData=...).
 */
export function encodeSnapshotToToken(snapshot: KinesisDatabaseDump): string {
  const compactSnapshot: KinesisDatabaseDump = {
    ...snapshot,
    logs: snapshot.logs.slice(0, 20),
    rejections: snapshot.rejections.slice(0, 10),
    pdfHistory: (snapshot.pdfHistory || []).slice(0, 8),
    smartwatchHistory: (snapshot.smartwatchHistory || []).slice(0, 5),
  };
  const json = JSON.stringify(compactSnapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeTokenToSnapshotJson(token: string): string {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Builds a Magic Sync Link that carries both the Personal Sync Key and the encoded snapshot.
 */
export async function createCrossDeviceSyncLink(): Promise<string> {
  const snapshot = await getKinesisSnapshot();
  const key = getPersonalSyncKey();
  const token = encodeSnapshotToToken(snapshot);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?syncKey=${encodeURIComponent(key)}&syncData=${encodeURIComponent(token)}`;
}

/**
 * Pushes the local device snapshot to /api/sync under the user's Sync Key.
 */
export async function pushProgressToCloud(customKey?: string): Promise<{
  ok: boolean;
  updatedAt?: string;
  error?: string;
}> {
  try {
    const key = customKey ? setPersonalSyncKey(customKey) : getPersonalSyncKey();
    const now = recordLocalModificationTime();
    const snapshot = await getKinesisSnapshot();
    const payload = { ...snapshot, exportedAt: now };

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, payload }),
    });

    if (!res.ok) {
      return { ok: false, error: 'Αδυναμία σύνδεσης με τον διακομιστή συγχρονισμού.' };
    }
    const data = await res.json();
    const ts = recordSyncTimestamp();
    return { ok: true, updatedAt: data.updatedAt || ts };
  } catch {
    return { ok: false, error: 'Εκτός σύνδεσης — τα δεδομένα είναι ασφαλή τοπικά.' };
  }
}

/**
 * Bidirectional Pair & Merge:
 * Fetches the remote snapshot for `targetKey`, merges it with the local snapshot
 * (so neither Phone nor PC loses uploaded PDFs or workouts!), saves locally, and pushes the merged result back!
 */
export async function pairAndMergeWithDevice(targetKey: string): Promise<{
  ok: boolean;
  key: string;
  merged: boolean;
  snapshot?: KinesisDatabaseDump;
  messageGreek: string;
  summary?: {
    pdfCount: number;
    logsCount: number;
    watchSyncsCount: number;
  };
  summaryGreek?: string;
  error?: string;
}> {
  const cleanKey = setPersonalSyncKey(targetKey);
  try {
    const localSnap = await getKinesisSnapshot();

    const getRes = await fetch(`/api/sync?key=${encodeURIComponent(cleanKey)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (getRes.ok) {
      const data = await getRes.json();
      if (data.found && data.payload) {
        const remoteSnap = data.payload as KinesisDatabaseDump;
        const mergedSnap = mergeKinesisSnapshots(localSnap, remoteSnap);
        const restored = await importDatabaseJson(JSON.stringify(mergedSnap));

        // Push the merged snapshot back so BOTH devices have the exact same combined state!
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: cleanKey, payload: restored }),
        });

        setDevicePaired(true);
        recordSyncTimestamp();

        const pdfCount = Array.isArray(restored.pdfHistory) ? restored.pdfHistory.length : 0;
        const logsCount = restored.logs.length;
        const watchSyncsCount = Array.isArray(restored.smartwatchHistory)
          ? restored.smartwatchHistory.length
          : 0;
        const msg = `Συγχωνεύτηκαν επιτυχώς στον κωδικό ${cleanKey}: ${pdfCount} αρχεία PDF εξετάσεων, ${logsCount} προπονήσεις, Στάδιο ${restored.progression.currentStage} (Φερριτίνη: ${restored.biomarkers.ferritin ?? '-'} ng/mL).`;
        return {
          ok: true,
          key: cleanKey,
          merged: true,
          snapshot: restored,
          messageGreek: msg,
          summaryGreek: msg,
          summary: { pdfCount, logsCount, watchSyncsCount },
        };
      }
    }

    // If remote had no data yet under that key, push local data to that key so the other device gets it immediately!
    const pushRes = await pushProgressToCloud(cleanKey);
    if (pushRes.ok) {
      setDevicePaired(true);
      const pdfCount = Array.isArray(localSnap.pdfHistory) ? localSnap.pdfHistory.length : 0;
      const logsCount = localSnap.logs.length;
      const watchSyncsCount = Array.isArray(localSnap.smartwatchHistory)
        ? localSnap.smartwatchHistory.length
        : 0;
      const msg = `Τα δεδομένα αυτής της συσκευής (${pdfCount} PDF εξετάσεων, ${logsCount} προπονήσεις) ανέβηκαν στον κοινό κωδικό ${cleanKey}! Άνοιξε την άλλη συσκευή στον ίδιο κωδικό.`;
      return {
        ok: true,
        key: cleanKey,
        merged: false,
        snapshot: localSnap,
        messageGreek: msg,
        summaryGreek: msg,
        summary: { pdfCount, logsCount, watchSyncsCount },
      };
    }

    return {
      ok: false,
      key: cleanKey,
      merged: false,
      messageGreek: 'Αδυναμία επικοινωνίας με τον διακομιστή συγχρονισμού.',
      error: 'Αδυναμία επικοινωνίας με τον διακομιστή συγχρονισμού.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Σφάλμα συγχρονισμού συσκευών.';
    return {
      ok: false,
      key: cleanKey,
      merged: false,
      messageGreek: msg,
      error: msg,
    };
  }
}

/**
 * Pulls and merges progress from /api/sync for the given Sync Key.
 */
export async function pullProgressFromCloud(
  customKey?: string,
  options?: { forceMerge?: boolean }
): Promise<{
  ok: boolean;
  found: boolean;
  updated: boolean;
  merged: boolean;
  snapshot?: KinesisDatabaseDump;
  error?: string;
}> {
  try {
    const key = customKey ? setPersonalSyncKey(customKey) : getPersonalSyncKey();
    const res = await fetch(`/api/sync?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!res.ok) {
      return {
        ok: false,
        found: false,
        updated: false,
        merged: false,
        error: 'Σφάλμα ανάκτησης δεδομένων συγχρονισμού.',
      };
    }

    const data = await res.json();
    if (!data.found || !data.payload) {
      return {
        ok: true,
        found: false,
        updated: false,
        merged: false,
        error: 'Δεν βρέθηκαν αποθηκευμένα δεδομένα για αυτόν τον κωδικό ακόμα.',
      };
    }

    const remoteSnap = data.payload as KinesisDatabaseDump;
    const localSnap = await getKinesisSnapshot();

    const remotePdfCount = Array.isArray(remoteSnap.pdfHistory) ? remoteSnap.pdfHistory.length : 0;
    const localPdfCount = Array.isArray(localSnap.pdfHistory) ? localSnap.pdfHistory.length : 0;
    const remoteTime = new Date(remoteSnap.exportedAt || 0).getTime();
    const localTime = new Date(localSnap.exportedAt || 0).getTime();

    const hasNewerOrMoreData =
      Boolean(options?.forceMerge) ||
      remoteTime > localTime ||
      remotePdfCount > localPdfCount ||
      (remoteSnap.logs?.length || 0) > (localSnap.logs?.length || 0) ||
      Boolean(remoteSnap.uploadedDietPlan && !localSnap.uploadedDietPlan);

    if (!hasNewerOrMoreData) {
      return { ok: true, found: true, updated: false, merged: false, snapshot: localSnap };
    }

    const merged = mergeKinesisSnapshots(localSnap, remoteSnap);
    const restored = await importDatabaseJson(JSON.stringify(merged));
    recordSyncTimestamp();

    return {
      ok: true,
      found: true,
      updated: hasNewerOrMoreData,
      merged: hasNewerOrMoreData,
      snapshot: restored,
    };
  } catch (err) {
    return {
      ok: false,
      found: false,
      updated: false,
      merged: false,
      error: err instanceof Error ? err.message : 'Σφάλμα συγχρονισμού.',
    };
  }
}
