import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { DailyBiometrics } from '@/types/kinesis';

const WATCH_DIR = path.join(os.tmpdir(), 'kinesis_smartwatch_store');

interface StoredWatchPayload {
  updatedAt: string;
  source: string;
  biometrics: Partial<DailyBiometrics>;
}

const memoryWatchStore: Map<string, StoredWatchPayload> =
  (globalThis as unknown as { __kinesisWatchStore?: Map<string, StoredWatchPayload> })
    .__kinesisWatchStore ?? new Map<string, StoredWatchPayload>();

(globalThis as unknown as { __kinesisWatchStore?: Map<string, StoredWatchPayload> }).__kinesisWatchStore =
  memoryWatchStore;

function sanitizeKey(rawKey: string | null): string {
  if (!rawKey) return '';
  return rawKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

export async function GET(req: NextRequest) {
  const key = sanitizeKey(req.nextUrl.searchParams.get('key'));
  if (!key || key.length < 4) {
    return NextResponse.json(
      { error: 'Μη έγκυρος κωδικός συγχρονισμού Smartwatch.' },
      { status: 400 }
    );
  }

  let record = memoryWatchStore.get(key);
  if (!record) {
    try {
      const raw = await fs.readFile(path.join(WATCH_DIR, `${key}.json`), 'utf-8');
      record = JSON.parse(raw) as StoredWatchPayload;
      memoryWatchStore.set(key, record);
    } catch {
      // No watch payload yet
    }
  }

  if (!record) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  return NextResponse.json({
    found: true,
    updatedAt: record.updatedAt,
    source: record.source,
    biometrics: record.biometrics,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      key?: string;
      source?: string;
      rhr?: number;
      hrv?: number;
      sleepScore?: number;
      stepsSoFar?: number;
      weight?: number;
    };

    const key = sanitizeKey(body.key ?? null);
    if (!key || key.length < 4) {
      return NextResponse.json(
        { error: 'Απαιτείται ο Προσωπικός Κωδικός Συσκευής (π.χ. KIN-XXXX-123).' },
        { status: 400 }
      );
    }

    const biometrics: Partial<DailyBiometrics> = {};
    if (typeof body.rhr === 'number' && body.rhr >= 35 && body.rhr <= 140) {
      biometrics.rhr = Math.round(body.rhr);
    }
    if (typeof body.hrv === 'number' && body.hrv >= 10 && body.hrv <= 220) {
      biometrics.hrv = Math.round(body.hrv);
    }
    if (typeof body.sleepScore === 'number' && body.sleepScore >= 10 && body.sleepScore <= 100) {
      biometrics.sleepScore = Math.round(body.sleepScore);
    }
    if (typeof body.stepsSoFar === 'number' && body.stepsSoFar >= 0 && body.stepsSoFar <= 100000) {
      biometrics.stepsSoFar = Math.round(body.stepsSoFar);
    }
    if (typeof body.weight === 'number' && body.weight >= 30 && body.weight <= 250) {
      biometrics.weight = Number(body.weight.toFixed(1));
    }

    const record: StoredWatchPayload = {
      updatedAt: new Date().toISOString(),
      source: body.source || 'Smartwatch Webhook (Apple Health / Health Connect)',
      biometrics,
    };

    memoryWatchStore.set(key, record);
    try {
      await fs.mkdir(WATCH_DIR, { recursive: true });
      await fs.writeFile(path.join(WATCH_DIR, `${key}.json`), JSON.stringify(record), 'utf-8');
    } catch {
      // Ignore write error on read-only fs
    }

    return NextResponse.json({
      ok: true,
      updatedAt: record.updatedAt,
      biometrics: record.biometrics,
    });
  } catch {
    return NextResponse.json(
      { error: 'Σφάλμα ανάγνωσης δεδομένων Smartwatch.' },
      { status: 500 }
    );
  }
}
