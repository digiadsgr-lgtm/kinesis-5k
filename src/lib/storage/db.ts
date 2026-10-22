import {
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  KinesisDatabaseDump,
  ModalityType,
  MovementLog,
  RejectionEvent,
  RejectionReason,
  StageId,
  UserProgressionState,
} from '@/types/kinesis';
import { applyMovementToProgression } from '@/lib/engine/recommender';
import { PdfExtractionResult } from '@/lib/parser/pdfBiomarkerExtractor';

const DB_NAME = 'kinesis_sit_to_5k_db';
const DB_VERSION = 1;
const SCHEMA_VERSION = '1.1.0';

export const DEFAULT_CHECK_IN: CheckInInput = {
  mood: 3,
  energy: 3,
  timeWindowMins: 15,
  environment: 'indoor_clothes',
  painLevel: 0,
  painLocation: '',
};

export const DEFAULT_PROGRESSION: UserProgressionState = {
  id: 'singleton',
  currentStage: 0,
  habitConsistencyScore: 15,
  runningReadiness: 5,
  totalSessionsCompleted: 0,
  lastActiveDate: null,
  lastCheckIn: DEFAULT_CHECK_IN,
};

export const DEFAULT_BIOMETRICS: DailyBiometrics = {
  rhr: 62,
  baselineRhr: 60,
  hrv: 48,
  sleepScore: 76,
  stepsSoFar: 2450,
  weight: 79.5,
  date: new Date().toISOString().slice(0, 10),
};

export const DEFAULT_BIOMARKERS: BiomarkerProfile = {
  ferritin: 55,
  hemoglobin: 14.2,
  vitaminD: 32,
  vitaminB12: 410,
  crp: 0.9,
  fastingGlucose: 91,
  medicalRestrictions: '',
  updatedAt: new Date().toISOString().slice(0, 10),
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB δεν είναι διαθέσιμο σε αυτό το περιβάλλον.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
      if (!db.objectStoreNames.contains('logs')) {
        db.createObjectStore('logs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('rejections')) {
        db.createObjectStore('rejections', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Σφάλμα ανοίγματος IndexedDB'));
  });
}

async function getKv<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDatabase();
    return await new Promise<T>((resolve) => {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result !== undefined ? (req.result as T) : fallback);
      };
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

async function setKv<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFromStore<T>(storeName: 'logs' | 'rejections'): Promise<T[]> {
  try {
    const db = await openDatabase();
    return await new Promise<T[]>((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function putInStore<T>(storeName: 'logs' | 'rejections', item: T): Promise<void> {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: 'kv' | 'logs' | 'rejections'): Promise<void> {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUploadedPdfHistory(): Promise<PdfExtractionResult[]> {
  return getKv<PdfExtractionResult[]>('pdf_history', []);
}

export async function saveUploadedPdfHistory(history: PdfExtractionResult[]): Promise<void> {
  await setKv('pdf_history', history);
}

export async function getKinesisSnapshot(): Promise<KinesisDatabaseDump> {
  const [progression, biometrics, biomarkers, logs, rejections] = await Promise.all([
    getKv<UserProgressionState>('progression', DEFAULT_PROGRESSION),
    getKv<DailyBiometrics>('biometrics', DEFAULT_BIOMETRICS),
    getKv<BiomarkerProfile>('biomarkers', DEFAULT_BIOMARKERS),
    getAllFromStore<MovementLog>('logs'),
    getAllFromStore<RejectionEvent>('rejections'),
  ]);

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const sortedRejections = [...rejections].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    progression,
    biometrics,
    biomarkers,
    logs: sortedLogs,
    rejections: sortedRejections,
  };
}

export async function saveCheckIn(checkIn: CheckInInput): Promise<UserProgressionState> {
  const progression = await getKv<UserProgressionState>('progression', DEFAULT_PROGRESSION);
  const updated: UserProgressionState = {
    ...progression,
    lastCheckIn: checkIn,
  };
  await setKv('progression', updated);
  return updated;
}

export async function saveProgression(progression: UserProgressionState): Promise<void> {
  await setKv('progression', progression);
}

export async function saveBiometrics(biometrics: DailyBiometrics): Promise<void> {
  await setKv('biometrics', {
    ...biometrics,
    date: new Date().toISOString().slice(0, 10),
  });
}

export async function saveBiomarkers(biomarkers: BiomarkerProfile): Promise<void> {
  await setKv('biomarkers', {
    ...biomarkers,
    updatedAt: new Date().toISOString().slice(0, 10),
  });
}

export async function recordMovementLog(
  input: Omit<MovementLog, 'id' | 'timestamp'>
): Promise<{
  log: MovementLog;
  progression: UserProgressionState;
  stageAdvanced: boolean;
}> {
  const log: MovementLog = {
    ...input,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  await putInStore('logs', log);

  const currentProgression = await getKv<UserProgressionState>('progression', DEFAULT_PROGRESSION);
  const { updated, stageAdvanced } = applyMovementToProgression(
    currentProgression,
    log.habitPointsEarned,
    log.structuralPointsEarned
  );

  await setKv('progression', updated);
  return { log, progression: updated, stageAdvanced };
}

export async function recordRejection(
  modality: ModalityType,
  reason: RejectionReason,
  stageAtTime: StageId,
  mosAtTime: number
): Promise<RejectionEvent> {
  const event: RejectionEvent = {
    id: `rej-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    modality,
    reason,
    stageAtTime,
    mosAtTime,
  };
  await putInStore('rejections', event);
  return event;
}

export async function resetAllData(): Promise<void> {
  await Promise.all([clearStore('kv'), clearStore('logs'), clearStore('rejections')]);
  await setKv('progression', DEFAULT_PROGRESSION);
  await setKv('biometrics', DEFAULT_BIOMETRICS);
  await setKv('biomarkers', DEFAULT_BIOMARKERS);
}

export async function seedDemoData(): Promise<KinesisDatabaseDump> {
  await Promise.all([clearStore('kv'), clearStore('logs'), clearStore('rejections')]);

  const now = Date.now();
  const dayMs = 86400000;

  const demoCheckIn: CheckInInput = {
    mood: 4,
    energy: 3,
    timeWindowMins: 20,
    environment: 'home_gear',
    painLevel: 1,
    painLocation: '',
  };

  const demoProgression: UserProgressionState = {
    id: 'singleton',
    currentStage: 2,
    habitConsistencyScore: 68,
    runningReadiness: 46,
    totalSessionsCompleted: 9,
    lastActiveDate: new Date(now - dayMs).toISOString(),
    lastCheckIn: demoCheckIn,
  };

  const demoBiometrics: DailyBiometrics = {
    rhr: 59,
    baselineRhr: 58,
    hrv: 54,
    sleepScore: 79,
    stepsSoFar: 4820,
    weight: 77.4,
    date: new Date().toISOString().slice(0, 10),
  };

  const demoBiomarkers: BiomarkerProfile = {
    ferritin: 26,
    hemoglobin: 13.8,
    vitaminD: 28,
    vitaminB12: 390,
    crp: 1.1,
    fastingGlucose: 92,
    medicalRestrictions: 'Ήπια ευαισθησία στον δεξί Αχίλλειο μετά από πολύωρη ορθοστασία',
    updatedAt: new Date(now - 7 * dayMs).toISOString().slice(0, 10),
  };

  const demoLogs: MovementLog[] = [
    {
      id: 'demo-log-1',
      timestamp: new Date(now - 6 * dayMs).toISOString(),
      title: "5' Αποσυμπίεση Σπονδυλικής Στήλης & Ισχίων",
      modality: 'mobility',
      durationMins: 5,
      intensityLabel: 'Zero-Friction • Ελάχιστη Τριβή',
      habitPointsEarned: 15,
      structuralPointsEarned: 2,
      rpe: 2,
      notes: 'Με ρούχα γραφείου ανάμεσα σε δύο συναντήσεις.',
      wasNegotiated: 'micro_step',
    },
    {
      id: 'demo-log-2',
      timestamp: new Date(now - 4 * dayMs).toISOString(),
      title: "15' Ελεγχόμενη Ανάβαση Σκάλας",
      modality: 'stairs',
      durationMins: 15,
      intensityLabel: 'Zone 2 • Μηδενικός Κραδασμός Προσγείωσης',
      habitPointsEarned: 14,
      structuralPointsEarned: 10,
      rpe: 5,
      notes: 'Αλλαγή από περπάτημα λόγω βαρεμάρας. Πολύ καλή ενεργοποίηση.',
      wasNegotiated: 'bored_swap',
    },
    {
      id: 'demo-log-3',
      timestamp: new Date(now - 2 * dayMs).toISOString(),
      title: "20' Εναλλαγές (1 λεπτό τρέξιμο / 2 λεπτά περπάτημα)",
      modality: 'walk_run',
      durationMins: 20,
      intensityLabel: 'Zone 2 • Προοδευτική Φόρτιση Τενόντων',
      habitPointsEarned: 15,
      structuralPointsEarned: 17,
      rpe: 5,
      notes: 'Άνετη αναπνοή, μηδενική ενόχληση στα γόνατα.',
      wasNegotiated: 'primary',
    },
    {
      id: 'demo-log-4',
      timestamp: new Date(now - 1 * dayMs).toISOString(),
      title: "15' Θωράκιση Αχιλλείου, Γονάτων & Κορμού",
      modality: 'strength',
      durationMins: 15,
      intensityLabel: 'Δομική Ανοχή • Προστασία Αρθρώσεων',
      habitPointsEarned: 14,
      structuralPointsEarned: 11,
      rpe: 4,
      notes: 'Ισομετρικές άρσεις γαστροκνημίου.',
      wasNegotiated: 'primary',
    },
  ];

  const demoRejections: RejectionEvent[] = [
    {
      id: 'demo-rej-1',
      timestamp: new Date(now - 5 * dayMs).toISOString(),
      modality: 'treadmill',
      reason: 'boredom',
      stageAtTime: 1,
      mosAtTime: 64,
    },
    {
      id: 'demo-rej-2',
      timestamp: new Date(now - 3 * dayMs).toISOString(),
      modality: 'walk',
      reason: 'lack_of_time',
      stageAtTime: 2,
      mosAtTime: 48,
    },
  ];

  await setKv('progression', demoProgression);
  await setKv('biometrics', demoBiometrics);
  await setKv('biomarkers', demoBiomarkers);

  for (const log of demoLogs) {
    await putInStore('logs', log);
  }
  for (const rej of demoRejections) {
    await putInStore('rejections', rej);
  }

  return getKinesisSnapshot();
}

export async function exportDatabaseJson(): Promise<string> {
  const snapshot = await getKinesisSnapshot();
  return JSON.stringify(snapshot, null, 2);
}

const VALID_STAGES = new Set([0, 1, 2, 3, 4, 5]);
const VALID_MODALITIES = new Set([
  'walk',
  'stairs',
  'treadmill',
  'mobility',
  'strength',
  'walk_run',
  'run',
]);
const VALID_REJECTION_REASONS = new Set([
  'boredom',
  'lack_of_time',
  'pain_fatigue',
  'environment_lock',
]);

export function validateBackupSchema(parsed: unknown): KinesisDatabaseDump {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Το αρχείο JSON δεν περιέχει έγκυρο αντικείμενο δεδομένων KINESIS.');
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.progression || typeof obj.progression !== 'object') {
    throw new Error('Λείπει το πεδίο "progression" (Κατάσταση Προόδου) από το αρχείο.');
  }

  const prog = obj.progression as Record<string, unknown>;
  if (typeof prog.currentStage !== 'number' || !VALID_STAGES.has(prog.currentStage)) {
    throw new Error('Μη έγκυρο Στάδιο (currentStage πρέπει να είναι 0 έως 5).');
  }
  if (
    typeof prog.habitConsistencyScore !== 'number' ||
    typeof prog.runningReadiness !== 'number'
  ) {
    throw new Error('Μη έγκυροι δείκτες habitConsistencyScore ή runningReadiness.');
  }

  if (!obj.biometrics || typeof obj.biometrics !== 'object') {
    throw new Error('Λείπει το πεδίο "biometrics" (Ημερήσια Βιομετρικά).');
  }
  const bio = obj.biometrics as Record<string, unknown>;
  if (typeof bio.rhr !== 'number' || typeof bio.sleepScore !== 'number') {
    throw new Error('Τα πεδία rhr και sleepScore στα βιομετρικά πρέπει να είναι αριθμοί.');
  }

  if (!obj.biomarkers || typeof obj.biomarkers !== 'object') {
    throw new Error('Λείπει το πεδίο "biomarkers" (Αιματολογικοί Δείκτες).');
  }

  if (!Array.isArray(obj.logs)) {
    throw new Error('Το πεδίο "logs" πρέπει να είναι λίστα καταγραφών.');
  }
  for (const item of obj.logs) {
    if (!item || typeof item !== 'object') {
      throw new Error('Βρέθηκε μη έγκυρη εγγραφή μέσα στο "logs".');
    }
    const l = item as Record<string, unknown>;
    if (typeof l.modality !== 'string' || !VALID_MODALITIES.has(l.modality)) {
      throw new Error(`Μη έγκυρος τύπος κίνησης (modality: ${String(l.modality)}) στα logs.`);
    }
  }

  if (!Array.isArray(obj.rejections)) {
    throw new Error('Το πεδίο "rejections" πρέπει να είναι λίστα απορρίψεων.');
  }
  for (const item of obj.rejections) {
    if (!item || typeof item !== 'object') {
      throw new Error('Βρέθηκε μη έγκυρη εγγραφή μέσα στο "rejections".');
    }
    const r = item as Record<string, unknown>;
    if (typeof r.reason !== 'string' || !VALID_REJECTION_REASONS.has(r.reason)) {
      throw new Error(`Μη έγκυρη αιτία απόρριψης (${String(r.reason)}) στα rejections.`);
    }
  }

  return obj as unknown as KinesisDatabaseDump;
}

export async function importDatabaseJson(rawJson: string): Promise<KinesisDatabaseDump> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Το αρχείο δεν είναι έγκυρο JSON. Ελέγξτε τη μορφοποίηση του αρχείου.');
  }

  const validated = validateBackupSchema(parsed);

  await Promise.all([clearStore('kv'), clearStore('logs'), clearStore('rejections')]);

  await setKv('progression', validated.progression);
  await setKv('biometrics', validated.biometrics);
  await setKv('biomarkers', validated.biomarkers);

  for (const log of validated.logs) {
    await putInStore('logs', log);
  }
  for (const rej of validated.rejections) {
    await putInStore('rejections', rej);
  }

  return getKinesisSnapshot();
}
