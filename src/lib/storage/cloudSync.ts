import { KinesisDatabaseDump } from '@/types/kinesis';
import { getKinesisSnapshot, importDatabaseJson } from './db';

const SYNC_KEY_STORAGE = 'kinesis_personal_sync_key_v1';
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
 * Encodes a UTF-8 string into URL-safe Base64 so a user can transfer their full state
 * between Mobile & Desktop via a single clickable link (?sync=...).
 */
export function encodeSnapshotToToken(snapshot: KinesisDatabaseDump): string {
  const compactSnapshot: KinesisDatabaseDump = {
    ...snapshot,
    logs: snapshot.logs.slice(0, 25),
    rejections: snapshot.rejections.slice(0, 15),
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
 * Pushes the local device snapshot to /api/sync under the user's secret Sync Key.
 */
export async function pushProgressToCloud(customKey?: string): Promise<{
  ok: boolean;
  updatedAt?: string;
  error?: string;
}> {
  try {
    const key = customKey ? setPersonalSyncKey(customKey) : getPersonalSyncKey();
    const snapshot = await getKinesisSnapshot();

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, payload: snapshot }),
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
 * Pulls and merges progress from /api/sync for the given Sync Key.
 */
export async function pullProgressFromCloud(customKey?: string): Promise<{
  ok: boolean;
  found: boolean;
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
      return { ok: false, found: false, error: 'Σφάλμα ανάκτησης δεδομένων συγχρονισμού.' };
    }

    const data = await res.json();
    if (!data.found || !data.payload) {
      return {
        ok: true,
        found: false,
        error: 'Δεν βρέθηκαν αποθηκευμένα δεδομένα για αυτόν τον κωδικό ακόμα.',
      };
    }

    const restored = await importDatabaseJson(JSON.stringify(data.payload));
    recordSyncTimestamp();
    return { ok: true, found: true, snapshot: restored };
  } catch (err) {
    return {
      ok: false,
      found: false,
      error: err instanceof Error ? err.message : 'Σφάλμα συγχρονισμού.',
    };
  }
}
