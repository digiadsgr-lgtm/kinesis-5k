import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface ConnectedDeviceRecord {
  deviceId: string;
  deviceType: 'mobile' | 'desktop';
  deviceLabel: string;
  lastSeenAt: string;
}

interface SyncStoreEntry {
  payload: unknown;
  updatedAt: string;
  devices: ConnectedDeviceRecord[];
}

// Global in-memory + /tmp cache for serverless instances
const globalStore = globalThis as unknown as {
  __kinesisSyncStore?: Map<string, SyncStoreEntry>;
};

if (!globalStore.__kinesisSyncStore) {
  globalStore.__kinesisSyncStore = new Map();
}

const TMP_FILE = path.join(os.tmpdir(), 'kinesis_cloud_sync_store.json');

function sanitizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}

async function readDiskStore(): Promise<Record<string, SyncStoreEntry>> {
  try {
    const raw = await fs.readFile(TMP_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDiskStore(data: Record<string, SyncStoreEntry>): Promise<void> {
  try {
    await fs.writeFile(TMP_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore read-only fs errors
  }
}

function upsertDevice(
  existing: ConnectedDeviceRecord[] | undefined,
  incoming?: { deviceId?: string; deviceType?: string; deviceLabel?: string }
): ConnectedDeviceRecord[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  if (!incoming || !incoming.deviceId) return list;

  const now = new Date().toISOString();
  const devType: 'mobile' | 'desktop' =
    incoming.deviceType === 'mobile' ? 'mobile' : 'desktop';
  const label =
    incoming.deviceLabel || (devType === 'mobile' ? 'Κινητό Τηλέφωνο' : 'Υπολογιστής (PC)');

  const idx = list.findIndex((d) => d.deviceId === incoming.deviceId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      deviceType: devType,
      deviceLabel: label,
      lastSeenAt: now,
    };
  } else {
    list.push({
      deviceId: incoming.deviceId,
      deviceType: devType,
      deviceLabel: label,
      lastSeenAt: now,
    });
  }

  return list.slice(-8);
}

export async function GET(req: NextRequest) {
  const rawKey = req.nextUrl.searchParams.get('key') || '';
  const deviceId = req.nextUrl.searchParams.get('deviceId') || undefined;
  const deviceType = req.nextUrl.searchParams.get('deviceType') || undefined;
  const deviceLabel = req.nextUrl.searchParams.get('deviceLabel') || undefined;
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
    return NextResponse.json({ found: false, connectedDevices: [] }, { status: 200 });
  }

  if (deviceId) {
    record.devices = upsertDevice(record.devices, { deviceId, deviceType, deviceLabel });
    globalStore.__kinesisSyncStore?.set(key, record);
    const disk = await readDiskStore();
    disk[key] = record;
    await writeDiskStore(disk);
  }

  return NextResponse.json({
    found: true,
    updatedAt: record.updatedAt,
    payload: record.payload,
    connectedDevices: record.devices || [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      key?: string;
      payload?: unknown;
      deviceInfo?: {
        deviceId?: string;
        deviceType?: 'mobile' | 'desktop';
        deviceLabel?: string;
      };
    };
    const key = sanitizeKey(body.key || '');

    if (!key || key.length < 4 || !body.payload) {
      return NextResponse.json(
        { error: 'Μη έγκυρος κωδικός ή δεδομένα συγχρονισμού.' },
        { status: 400 }
      );
    }

    const disk = await readDiskStore();
    const existing = globalStore.__kinesisSyncStore?.get(key) || disk[key];
    const updatedDevices = upsertDevice(existing?.devices, body.deviceInfo);

    const entry: SyncStoreEntry = {
      payload: body.payload,
      updatedAt: new Date().toISOString(),
      devices: updatedDevices,
    };

    globalStore.__kinesisSyncStore?.set(key, entry);
    disk[key] = entry;
    await writeDiskStore(disk);

    return NextResponse.json({
      ok: true,
      key,
      updatedAt: entry.updatedAt,
      connectedDevices: entry.devices,
    });
  } catch {
    return NextResponse.json(
      { error: 'Σφάλμα αποθήκευσης συγχρονισμού.' },
      { status: 500 }
    );
  }
}
