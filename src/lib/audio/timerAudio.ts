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
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 100, 200, 100, 450]);
    }
  } catch {
    // ignore
  }
}

// ============================================================================
// ANTI-SLEEP & BACKGROUND KEEP-ALIVE ENGINE (Screen Wake Lock + Silent Audio)
// ============================================================================

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

let activeWakeLock: WakeLockSentinelLike | null = null;
let keepAliveAudioEl: HTMLAudioElement | null = null;
let keepAliveOscillator: OscillatorNode | null = null;

/**
 * Generates a tiny 1-second silent PCM WAV data URI so mobile browsers (iOS Safari / Android Chrome)
 * keep the JavaScript event loop and Web Audio context alive even if the user turns off the screen
 * or puts the phone in their pocket during a 15-minute walk/run.
 */
function createSilentWavDataUri(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 second
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Samples remain 0 (silence)
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${typeof btoa === 'function' ? btoa(binary) : ''}`;
}

/**
 * Requests a Screen Wake Lock so the phone screen does not turn off automatically
 * while the workout timer is running.
 */
export async function requestWorkoutScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    const navWithWakeLock = navigator as unknown as {
      wakeLock?: {
        request: (type: 'screen') => Promise<WakeLockSentinelLike>;
      };
    };
    if (navWithWakeLock.wakeLock && typeof navWithWakeLock.wakeLock.request === 'function') {
      if (activeWakeLock && !activeWakeLock.released) {
        return true;
      }
      activeWakeLock = await navWithWakeLock.wakeLock.request('screen');
      return true;
    }
  } catch {
    // Fallback to silent audio keep-alive if WakeLock is restricted by battery saver
  }
  return false;
}

/**
 * Releases the Screen Wake Lock immediately when the workout finishes or is paused/closed.
 */
export async function releaseWorkoutScreenWakeLock(): Promise<void> {
  try {
    if (activeWakeLock) {
      await activeWakeLock.release();
      activeWakeLock = null;
    }
  } catch {
    activeWakeLock = null;
  }
}

/**
 * Starts both:
 * 1) Screen Wake Lock (keeps screen on while exercising)
 * 2) Silent background audio loop + MediaSession metadata (keeps timer & audio cues running
 *    even if the user manually locks the phone screen and puts it in their pocket for 15+ minutes).
 */
export async function startWorkoutKeepAlive(workoutTitle?: string): Promise<boolean> {
  const wakeLockGranted = await requestWorkoutScreenWakeLock();

  try {
    const ctx = getAudioContext();
    if (ctx && !keepAliveOscillator) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(1, ctx.currentTime);
      gain.gain.setValueAtTime(0.00001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      keepAliveOscillator = osc;
    }
  } catch {
    // ignore
  }

  try {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      if (!keepAliveAudioEl) {
        keepAliveAudioEl = new Audio(createSilentWavDataUri());
        keepAliveAudioEl.loop = true;
        keepAliveAudioEl.volume = 0.01;
      }
      await keepAliveAudioEl.play().catch(() => {});
    }
  } catch {
    // ignore
  }

  try {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: workoutTitle || 'Άσκηση σε Εξέλιξη',
          artist: 'KINESIS: Sit to 5K',
          album: 'Ενεργό Χρονόμετρο Κίνησης',
        });
      }
      navigator.mediaSession.playbackState = 'playing';
    }
  } catch {
    // ignore
  }

  return wakeLockGranted;
}

/**
 * Stops the Screen Wake Lock and background keep-alive audio as soon as the workout ends.
 */
export async function stopWorkoutKeepAlive(): Promise<void> {
  await releaseWorkoutScreenWakeLock();

  try {
    if (keepAliveOscillator) {
      keepAliveOscillator.stop();
      keepAliveOscillator.disconnect();
      keepAliveOscillator = null;
    }
  } catch {
    keepAliveOscillator = null;
  }

  try {
    if (keepAliveAudioEl) {
      keepAliveAudioEl.pause();
      keepAliveAudioEl.currentTime = 0;
    }
  } catch {
    // ignore
  }

  try {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'none';
    }
  } catch {
    // ignore
  }
}

