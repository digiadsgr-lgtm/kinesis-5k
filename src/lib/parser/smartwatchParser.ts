import { DailyBiometrics, ModalityType } from '@/types/kinesis';

export interface SmartwatchSyncResult {
  id: string;
  sourceName: string; // π.χ. 'Garmin Connect (.tcx)', 'Apple Health', 'Bluetooth HR Live', 'Samsung Health'
  syncedAt: string;
  biometricsUpdate: Partial<DailyBiometrics>;
  detectedWorkout?: {
    title: string;
    modality: ModalityType;
    durationMins: number;
    avgHeartRate?: number;
    calories?: number;
    distanceMeters?: number;
  };
  summaryGreek: string[];
}

/**
 * Parses smartwatch files (.tcx, .gpx, .csv, .json, .xml) or pasted health app summaries
 * into actionable DailyBiometrics and optional MovementLog workouts.
 */
export async function parseSmartwatchFile(file: File): Promise<SmartwatchSyncResult> {
  const text = await file.text();
  return parseSmartwatchRawContent(text, file.name);
}

export function parseSmartwatchRawContent(
  rawContent: string,
  fileNameOrSource: string = 'Smartwatch_Import'
): SmartwatchSyncResult {
  const trimmed = rawContent.trim();
  const lowerName = fileNameOrSource.toLowerCase();

  // 1. Check if JSON (Google Fit / Apple Shortcuts / Health Connect / Garmin JSON)
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || lowerName.endsWith('.json')) {
    try {
      const parsed = JSON.parse(trimmed);
      return parseSmartwatchJson(parsed, fileNameOrSource);
    } catch {
      // fall through to text/XML parsing
    }
  }

  // 2. Check if TCX / GPX / Apple Health XML
  if (
    trimmed.includes('<TrainingCenterDatabase') ||
    trimmed.includes('<gpx') ||
    trimmed.includes('<HealthData') ||
    lowerName.endsWith('.tcx') ||
    lowerName.endsWith('.gpx') ||
    lowerName.endsWith('.xml')
  ) {
    return parseSmartwatchXmlOrTcx(trimmed, fileNameOrSource);
  }

  // 3. Otherwise parse CSV or pasted Smartwatch / Health summary text
  return parseSmartwatchTextOrCsv(trimmed, fileNameOrSource);
}

function parseSmartwatchJson(data: unknown, sourceName: string): SmartwatchSyncResult {
  const obj = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  const biometricsUpdate: Partial<DailyBiometrics> = {};
  const summaryGreek: string[] = [];

  const num = (val: unknown): number | undefined => {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const rhr = num(
    obj.rhr ??
      obj.restingHeartRate ??
      obj.resting_heart_rate ??
      obj.heartRate ??
      obj['com.google.heart_rate.bpm'] ??
      obj.bpm
  );
  if (rhr && rhr >= 35 && rhr <= 130) {
    biometricsUpdate.rhr = Math.round(rhr);
    summaryGreek.push(`Παλμοί Ηρεμίας: ${biometricsUpdate.rhr} bpm`);
  }

  const hrv = num(
    obj.hrv ?? obj.heartRateVariability ?? obj.rmssd ?? obj['com.google.heart_rate.variability']
  );
  if (hrv && hrv >= 10 && hrv <= 220) {
    biometricsUpdate.hrv = Math.round(hrv);
    summaryGreek.push(`Ξεκούραση Καρδιάς (HRV): ${biometricsUpdate.hrv} ms`);
  }

  const sleep = num(
    obj.sleepScore ??
      obj.sleep_score ??
      obj.sleep ??
      obj['com.google.sleep.segment'] ??
      obj.sleepEfficiency
  );
  if (sleep && sleep >= 10 && sleep <= 100) {
    biometricsUpdate.sleepScore = Math.round(sleep);
    summaryGreek.push(`Ποιότητα Ύπνου: ${biometricsUpdate.sleepScore}/100`);
  }

  const steps = num(
    obj.steps ??
      obj.stepsSoFar ??
      obj.stepCount ??
      obj.dailySteps ??
      obj['com.google.step_count.delta'] ??
      obj.step_count
  );
  if (steps !== undefined && steps >= 0 && steps <= 100000) {
    biometricsUpdate.stepsSoFar = Math.round(steps);
    summaryGreek.push(`Βήματα Ημέρας: ${biometricsUpdate.stepsSoFar}`);
  }

  const weight = num(
    obj.weight ?? obj.bodyMass ?? obj.weightKg ?? obj['com.google.weight'] ?? obj.weight_kg
  );
  if (weight && weight >= 30 && weight <= 250) {
    biometricsUpdate.weight = Number(weight.toFixed(1));
    summaryGreek.push(`Βάρος: ${biometricsUpdate.weight} kg`);
  }

  let detectedWorkout: SmartwatchSyncResult['detectedWorkout'];
  const durationMins = num(obj.durationMins ?? obj.workoutMinutes ?? obj.activeMinutes);
  if (durationMins && durationMins >= 2) {
    detectedWorkout = {
      title: `${Math.round(durationMins)}' Προπόνηση από Smartwatch (${sourceName})`,
      modality: 'walk_run',
      durationMins: Math.round(durationMins),
      avgHeartRate: num(obj.avgHeartRate ?? obj.averageHeartRate),
    };
    summaryGreek.push(`Εντοπίστηκε προπόνηση: ${Math.round(durationMins)} λεπτά`);
  }

  return {
    id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceName,
    syncedAt: new Date().toISOString(),
    biometricsUpdate,
    detectedWorkout,
    summaryGreek,
  };
}

function parseSmartwatchXmlOrTcx(xml: string, sourceName: string): SmartwatchSyncResult {
  const biometricsUpdate: Partial<DailyBiometrics> = {};
  const summaryGreek: string[] = [];

  // Extract all HeartRateBpm / Value tags from TCX or GPX
  const hrMatches = Array.from(
    xml.matchAll(/<(?:Value|gpxtpx:hr|hr)>\s*(\d{2,3})\s*<\//gi)
  ).map((m) => Number(m[1]));

  const validHrs = hrMatches.filter((n) => n >= 38 && n <= 210);
  let avgHr: number | undefined;
  if (validHrs.length > 0) {
    const minHr = Math.min(...validHrs);
    avgHr = Math.round(validHrs.reduce((a, b) => a + b, 0) / validHrs.length);
    // Estimate resting heart rate if minimum recorded HR is in resting range
    const estimatedRhr = minHr < 85 ? minHr : Math.max(52, Math.round(minHr * 0.72));
    biometricsUpdate.rhr = estimatedRhr;
    summaryGreek.push(`Παλμοί από ρολόι: Μέσος ${avgHr} bpm (Εκτίμηση Ηρεμίας ${estimatedRhr} bpm)`);
  }

  // Extract TotalTimeSeconds from TCX
  const timeMatches = Array.from(
    xml.matchAll(/<TotalTimeSeconds>\s*([\d.]+)\s*<\/TotalTimeSeconds>/gi)
  ).map((m) => Number(m[1]));
  const totalSeconds = timeMatches.reduce((a, b) => a + b, 0);

  // Extract DistanceMeters from TCX
  const distMatches = Array.from(
    xml.matchAll(/<DistanceMeters>\s*([\d.]+)\s*<\/DistanceMeters>/gi)
  ).map((m) => Number(m[1]));
  const totalDist = distMatches.length > 0 ? Math.max(...distMatches) : 0;

  // Detect Activity Sport="Running" / "Walking"
  const sportMatch = xml.match(/Sport="(Running|Walking|Biking|Fitness|Other)"/i);
  const sport = sportMatch ? sportMatch[1].toLowerCase() : 'walking';
  const modality: ModalityType =
    sport === 'running' ? (totalSeconds > 1200 ? 'run' : 'walk_run') : 'walk';

  let detectedWorkout: SmartwatchSyncResult['detectedWorkout'];
  if (totalSeconds >= 60) {
    const mins = Math.max(2, Math.round(totalSeconds / 60));
    detectedWorkout = {
      title: `${mins}' Κίνηση Smartwatch (${
        sport === 'running' ? 'Τρέξιμο' : 'Περπάτημα'
      }${totalDist > 100 ? ` • ${(totalDist / 1000).toFixed(2)} km` : ''})`,
      modality,
      durationMins: mins,
      avgHeartRate: avgHr,
      distanceMeters: Math.round(totalDist),
    };
    summaryGreek.push(
      `Δραστηριότητα Smartwatch: ${mins} λεπτά${
        totalDist > 100 ? ` (${(totalDist / 1000).toFixed(2)} km)` : ''
      }`
    );

    if (totalDist > 100) {
      const estimatedSteps = Math.round(totalDist * 1.32);
      biometricsUpdate.stepsSoFar = estimatedSteps;
      summaryGreek.push(`Βήματα διαδρομής: +${estimatedSteps} βήματα`);
    }
  }

  return {
    id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceName,
    syncedAt: new Date().toISOString(),
    biometricsUpdate,
    detectedWorkout,
    summaryGreek,
  };
}

function parseSmartwatchTextOrCsv(text: string, sourceName: string): SmartwatchSyncResult {
  const normalized = text.replace(/,/g, '.');
  const biometricsUpdate: Partial<DailyBiometrics> = {};
  const summaryGreek: string[] = [];

  const extractFirst = (patterns: RegExp[], min: number, max: number): number | null => {
    for (const pat of patterns) {
      const m = normalized.match(pat);
      if (m && m[1]) {
        const val = parseFloat(m[1]);
        if (Number.isFinite(val) && val >= min && val <= max) {
          return val;
        }
      }
    }
    return null;
  };

  const rhr = extractFirst(
    [
      /(?:rhr|resting\s*heart\s*rate|παλμο[ιί]\s*ηρεμ[ιί]ας|καρδιακο[ιί]\s*παλμο[ιί])[^0-9]{0,20}(\d{2,3})/i,
      /(\d{2,3})\s*bpm/i,
    ],
    35,
    125
  );
  if (rhr !== null) {
    biometricsUpdate.rhr = Math.round(rhr);
    summaryGreek.push(`Παλμοί Ηρεμίας: ${biometricsUpdate.rhr} bpm`);
  }

  const hrv = extractFirst(
    [/(?:hrv|μεταβλητ[οό]τητα|rmssd)[^0-9]{0,20}(\d{2,3})/i, /(\d{2,3})\s*ms/i],
    12,
    200
  );
  if (hrv !== null) {
    biometricsUpdate.hrv = Math.round(hrv);
    summaryGreek.push(`HRV (Ξεκούραση Καρδιάς): ${biometricsUpdate.hrv} ms`);
  }

  const sleep = extractFirst(
    [/(?:sleep\s*score|sleep|[υύ]πνος|σκορ\s*[υύ]πνου)[^0-9]{0,20}(\d{2,3})/i],
    20,
    100
  );
  if (sleep !== null) {
    biometricsUpdate.sleepScore = Math.round(sleep);
    summaryGreek.push(`Ποιότητα Ύπνου: ${biometricsUpdate.sleepScore}/100`);
  }

  const steps = extractFirst(
    [/(?:steps|β[ηή]ματα)[^0-9]{0,20}(\d{3,6})/i, /(\d{3,6})\s*(?:steps|β[ηή]ματα)/i],
    100,
    80000
  );
  if (steps !== null) {
    biometricsUpdate.stepsSoFar = Math.round(steps);
    summaryGreek.push(`Βήματα: ${biometricsUpdate.stepsSoFar}`);
  }

  const weight = extractFirst(
    [/(?:weight|β[αά]ρος|κιλ[αά])[^0-9]{0,20}(\d{2,3}(?:\.\d)?)/i],
    35,
    240
  );
  if (weight !== null) {
    biometricsUpdate.weight = Number(weight.toFixed(1));
    summaryGreek.push(`Βάρος: ${biometricsUpdate.weight} kg`);
  }

  return {
    id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceName,
    syncedAt: new Date().toISOString(),
    biometricsUpdate,
    summaryGreek,
  };
}

/**
 * Generates a realistic sample Garmin/Smartwatch TCX file so the user can test
 * file upload or 1-click smartwatch sync immediately.
 */
export function createSampleSmartwatchTcx(
  scenario: 'morning_recovery' | 'walk_run_workout' | 'google_health_sync' = 'walk_run_workout'
): string {
  if (scenario === 'google_health_sync') {
    return JSON.stringify(
      {
        source: 'Google Health Connect / Health Sync Bridge',
        'com.google.step_count.delta': 6840,
        'com.google.heart_rate.bpm': 57,
        'com.google.heart_rate.variability': 61,
        'com.google.sleep.segment': 84,
        'com.google.weight': 94.0,
        activeMinutes: 18,
        avgHeartRate: 118,
      },
      null,
      2
    );
  }
  if (scenario === 'morning_recovery') {
    return JSON.stringify(
      {
        source: 'Garmin Forerunner / Apple Watch Sync',
        rhr: 56,
        hrv: 64,
        sleepScore: 86,
        stepsSoFar: 5420,
        weight: 76.8,
      },
      null,
      2
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${new Date().toISOString()}</Id>
      <Lap StartTime="${new Date().toISOString()}">
        <TotalTimeSeconds>1200</TotalTimeSeconds>
        <DistanceMeters>2450</DistanceMeters>
        <AverageHeartRateBpm><Value>128</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>142</Value></MaximumHeartRateBpm>
        <Track>
          <Trackpoint><HeartRateBpm><Value>58</Value></HeartRateBpm></Trackpoint>
          <Trackpoint><HeartRateBpm><Value>124</Value></HeartRateBpm></Trackpoint>
          <Trackpoint><HeartRateBpm><Value>132</Value></HeartRateBpm></Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}
