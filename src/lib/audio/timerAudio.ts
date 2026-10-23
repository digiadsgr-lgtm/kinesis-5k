'use client';

/**
 * KINESIS Web Audio Synthesizer for Workout Timer Cues.
 * Generates 100% offline, distinct acoustic cues so the user never confuses
 * a 30-second or 1-minute rhythm marker with the final 3-2-1 completion fanfare.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(
  freqHz: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  type: OscillatorType = 'sine'
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqHz, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * 1. Pre-start 5-second countdown tick (5, 4, 3, 2, 1):
 * Discreet, soft warm wooden tick (392 Hz, 55ms).
 */
export function playPrepCountdownTick(): void {
  try {
    playTone(392, 0, 0.055, 0.07, 'sine');
  } catch {
    // ignore audio block
  }
}

/**
 * 1b. "ΠΑΜΕ!" (Start of workout after 5s prep):
 * Warm two-note uplifting chime (440 Hz -> 587.33 Hz).
 */
export function playWorkoutStartChime(): void {
  try {
    playTone(440, 0, 0.09, 0.09, 'sine');
    playTone(587.33, 0.09, 0.16, 0.11, 'sine');
  } catch {
    // ignore
  }
}

/**
 * 2. Every 30 seconds (:30 mark):
 * Very discreet, soft single droplet pulse (528 Hz, 45ms, very low volume).
 * Designed so the user feels the rhythm without EVER thinking time is up.
 */
export function playHalfMinuteDiscreetPulse(): void {
  try {
    playTone(528, 0, 0.045, 0.05, 'sine');
  } catch {
    // ignore
  }
}

/**
 * 3. Every full minute (:00 mark, while workout continues):
 * Gentle double-soft pulse (493.88 Hz -> 587.33 Hz, short & calm).
 * Clearly indicates "1 more minute completed, keep going calmly".
 */
export function playFullMinuteDiscreetPulse(): void {
  try {
    playTone(493.88, 0, 0.06, 0.065, 'sine');
    playTone(587.33, 0.08, 0.08, 0.075, 'sine');
  } catch {
    // ignore
  }
}

/**
 * 4. Final 3, 2, 1 seconds before completion:
 * Distinct ascending crystal countdown tones (3 -> 659 Hz, 2 -> 784 Hz, 1 -> 880 Hz).
 */
export function playFinalThreeTwoOneBeep(secondRemaining: 3 | 2 | 1): void {
  try {
    const freqMap: Record<3 | 2 | 1, number> = {
      3: 659.25, // E5
      2: 783.99, // G5
      1: 880.0, // A5
    };
    playTone(freqMap[secondRemaining], 0, 0.14, 0.13, 'triangle');
  } catch {
    // ignore
  }
}

/**
 * 5. Grand Finale at 00:00:
 * Rich, celebratory 4-note ascending Major Fanfare (C5 -> E5 -> G5 -> C6)
 * so the user celebrates finishing the session with zero ambiguity.
 */
export function playGrandFinaleFanfare(): void {
  try {
    playTone(523.25, 0.0, 0.14, 0.14, 'triangle'); // C5
    playTone(659.25, 0.13, 0.14, 0.15, 'triangle'); // E5
    playTone(783.99, 0.26, 0.16, 0.16, 'triangle'); // G5
    playTone(1046.5, 0.4, 0.45, 0.2, 'triangle'); // C6 sustained
    playTone(523.25, 0.4, 0.45, 0.1, 'sine'); // Warm root harmony
  } catch {
    // ignore
  }
}
