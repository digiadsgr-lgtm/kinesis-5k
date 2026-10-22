import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Global in-memory + /tmp cache for serverless instances
const globalStore = globalThis as unknown as {
  __kinesisSyncStore?: Map<string, { payload: unknown; updatedAt: string }>;
};

if (!globalStore.__kinesisSyncStore) {
  globalStore.__kinesisSyncStore = new Map();
}

const TMP_FILE = path.join(os.tmpdir(), 'kinesis_cloud_sync_store.json');

function sanitizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}

async function readDiskStore(): Promise<
  Record<string, { payload: unknown; updatedAt: string }>
> {
  try {
    const raw = await fs.readFile(TMP_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDiskStore(
  data: Record<string, { payload: unknown; updatedAt: string }>
): Promise<void> {
  try {
    await fs.writeFile(TMP_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore read-only fs errors
  }
}

export async function GET(req: NextRequest) {
  const rawKey = req.nextUrl.searchParams.get('key') || '';
  const key = sanitizeKey(rawKey);

  if (!key || key.length < 4) {
    return NextResponse.json(
      { error: 'Ο κωδικός συγχρονισμού πρέπει να έχει τουλάχιστον 4 χαρακτήρες.' },
      { status: 400 }
    );
  }

  let record = globalStore.__kinesisSyncStore?.get(key);
  if (!record) {
    const disk = await readDiskStore();
    if (disk[key]) {
      record = disk[key];
      globalStore.__kinesisSyncStore?.set(key, record);
    }
  }

  if (!record) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  return NextResponse.json({
    found: true,
    updatedAt: record.updatedAt,
    payload: record.payload,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { key?: string; payload?: unknown };
    const key = sanitizeKey(body.key || '');

    if (!key || key.length < 4 || !body.payload) {
      return NextResponse.json(
        { error: 'Μη έγκυρος κωδικός ή δεδομένα συγχρονισμού.' },
        { status: 400 }
      );
    }

    const entry = {
      payload: body.payload,
      updatedAt: new Date().toISOString(),
    };

    globalStore.__kinesisSyncStore?.set(key, entry);
    const disk = await readDiskStore();
    disk[key] = entry;
    await writeDiskStore(disk);

    return NextResponse.json({
      ok: true,
      key,
      updatedAt: entry.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: 'Σφάλμα αποθήκευσης συγχρονισμού.' },
      { status: 500 }
    );
  }
}
