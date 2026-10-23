'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ListChecks,
  Moon,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ModalityType, MODALITY_LABELS_GREEK } from '@/types/kinesis';
import {
  playFinalThreeTwoOneBeep,
  playFullMinuteDiscreetPulse,
  playGrandFinaleFanfare,
  playHalfMinuteDiscreetPulse,
  playPrepCountdownTick,
  playWorkoutStartChime,
  requestWorkoutScreenWakeLock,
  startWorkoutKeepAlive,
  stopWorkoutKeepAlive,
} from '@/lib/audio/timerAudio';

export const ACTIVE_TIMER_STORAGE_KEY = 'kinesis_active_workout_timer_v1';

export interface ActiveTimerSession {
  title: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  habitPointsAward: number;
  structuralPointsAward: number;
  wasNegotiated: 'primary' | 'bored_swap' | 'micro_step';
  exercisesGreek?: string[];
}

export interface PersistedTimerState {
  session: ActiveTimerSession;
  prepEndAtMs: number;
  workoutEndAtMs: number;
  isRunning: boolean;
  pausedPrepLeft: number;
  pausedSecondsLeft: number;
}

interface SessionTimerProps {
  session: ActiveTimerSession;
  onComplete: (actualMins: number, rpe: number, notes: string) => Promise<void>;
  onCancel: () => void;
}

export default function SessionTimer({
  session,
  onComplete,
  onCancel,
}: SessionTimerProps) {
  const totalSeconds = Math.max(60, session.durationMins * 60);

  // Wall-clock deadline references so the timer NEVER stops or loses time even if the phone screen turns off!
  const prepEndAtMsRef = useRef<number>(Date.now() + 5000);
  const workoutEndAtMsRef = useRef<number>(Date.now() + 5000 + totalSeconds * 1000);
  const lastFiredCueSecRef = useRef<number | null>(null);
  const lastFiredPrepSecRef = useRef<number | null>(5);
  const hasStartedMainRef = useRef<boolean>(false);

  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number>(5);
  const [secondsLeft, setSecondsLeft] = useState<number>(totalSeconds);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [pocketDimMode, setPocketDimMode] = useState<boolean>(false);
  const [cueBanner, setCueBanner] = useState<string | null>(
    'Ετοιμάσου! Ξεκινάμε σε 5 δευτερόλεπτα με διακριτικό ήχο...'
  );

  const [rpe, setRpe] = useState<number>(3);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const soundEnabledRef = useRef<boolean>(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const persistTimerSnapshot = useCallback(
    (
      running: boolean,
      currentPrepLeft: number,
      currentSecLeft: number,
      prepEndMs: number,
      workoutEndMs: number
    ) => {
      if (typeof window === 'undefined') return;
      try {
        const payload: PersistedTimerState = {
          session,
          prepEndAtMs: prepEndMs,
          workoutEndAtMs: workoutEndMs,
          isRunning: running,
          pausedPrepLeft: currentPrepLeft,
          pausedSecondsLeft: currentSecLeft,
        };
        window.localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage quota errors
      }
    },
    [session]
  );

  const clearPersistedTimerSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACTIVE_TIMER_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Restore existing wall-clock deadlines if the mobile browser reloaded the page while in pocket
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedTimerState;
        if (parsed && parsed.session?.title === session.title) {
          const now = Date.now();
          if (parsed.isRunning) {
            prepEndAtMsRef.current = parsed.prepEndAtMs;
            workoutEndAtMsRef.current = parsed.workoutEndAtMs;
            const remPrep = Math.max(0, Math.ceil((parsed.prepEndAtMs - now) / 1000));
            const remWork = Math.max(0, Math.ceil((parsed.workoutEndAtMs - now) / 1000));
            setPrepSecondsLeft(remPrep);
            setSecondsLeft(remWork);
            if (remPrep === 0) {
              hasStartedMainRef.current = true;
            }
            return;
          } else {
            setIsRunning(false);
            setPrepSecondsLeft(parsed.pausedPrepLeft);
            setSecondsLeft(parsed.pausedSecondsLeft);
            return;
          }
        }
      }
    } catch {
      // ignore
    }

    // Fresh timer start
    const now = Date.now();
    prepEndAtMsRef.current = now + 5000;
    workoutEndAtMsRef.current = now + 5000 + totalSeconds * 1000;
    persistTimerSnapshot(true, 5, totalSeconds, prepEndAtMsRef.current, workoutEndAtMsRef.current);
    if (soundEnabledRef.current) {
      playPrepCountdownTick();
    }
  }, [session.title, totalSeconds, persistTimerSnapshot]);

  // Activate Screen Wake Lock + Background Audio Keep-Alive while workout is running
  useEffect(() => {
    if (isRunning && !isFinishing) {
      startWorkoutKeepAlive(session.title).then((locked) => {
        setWakeLockActive(locked);
      });
    } else {
      stopWorkoutKeepAlive();
      setWakeLockActive(false);
    }

    return () => {
      stopWorkoutKeepAlive();
    };
  }, [isRunning, isFinishing, session.title]);

  // Core Wall-Clock Evaluation Function (runs every 250ms AND immediately when screen wakes up)
  const evaluateWallClock = useCallback(() => {
    if (!isRunning || isFinishing) return;

    const now = Date.now();

    // Phase 1: 5-Second Preparation Countdown
    if (now < prepEndAtMsRef.current) {
      const nextPrep = Math.max(1, Math.ceil((prepEndAtMsRef.current - now) / 1000));
      setPrepSecondsLeft(nextPrep);
      if (lastFiredPrepSecRef.current !== nextPrep) {
        lastFiredPrepSecRef.current = nextPrep;
        if (soundEnabledRef.current) {
          playPrepCountdownTick();
        }
        setCueBanner(`Ετοιμάσου: ${nextPrep}...`);
      }
      return;
    }

    // Transition from Prep -> Main Workout Start
    if (!hasStartedMainRef.current) {
      hasStartedMainRef.current = true;
      setPrepSecondsLeft(0);
      if (soundEnabledRef.current) {
        playWorkoutStartChime();
      }
      setCueBanner(
        'ΠΑΜΕ! Το χρονόμετρο τρέχει αδιάκοπα (ακόμα κι αν κλείσεις την οθόνη ή βάλεις το κινητό στην τσέπη).'
      );
    }

    // Phase 2: Main Workout Countdown via exact Wall-Clock timestamp
    const nextSec = Math.max(0, Math.ceil((workoutEndAtMsRef.current - now) / 1000));
    setSecondsLeft(nextSec);

    if (nextSec <= 0) {
      if (soundEnabledRef.current) {
        playGrandFinaleFanfare();
      }
      setPocketDimMode(false);
      setIsRunning(false);
      setIsFinishing(true);
      clearPersistedTimerSnapshot();
      stopWorkoutKeepAlive();
      return;
    }

    // Fire acoustic cues exactly once per milestone second
    if (lastFiredCueSecRef.current !== nextSec) {
      lastFiredCueSecRef.current = nextSec;

      if (nextSec === 3 || nextSec === 2 || nextSec === 1) {
        if (soundEnabledRef.current) {
          playFinalThreeTwoOneBeep(nextSec);
        }
        setCueBanner(`Φινάλε σε ${nextSec}... Σχεδόν τελείωσες!`);
      } else if (nextSec < totalSeconds && nextSec > 4) {
        if (nextSec % 60 === 0) {
          if (soundEnabledRef.current) {
            playFullMinuteDiscreetPulse();
          }
          const minsDone = Math.round((totalSeconds - nextSec) / 60);
          setCueBanner(
            `⏱️ Ολοκληρώθηκε ${minsDone}ο λεπτό! (Διακριτικός ήχος λεπτού — συνεχίζουμε ήρεμα)`
          );
        } else if (nextSec % 60 === 30) {
          if (soundEnabledRef.current) {
            playHalfMinuteDiscreetPulse();
          }
          setCueBanner(
            '🔔 30" Ρυθμός: Διακριτική υπενθύμιση ροής (Ο χρόνος συνεχίζεται κανονικά)'
          );
        }
      }
    }
  }, [isRunning, isFinishing, totalSeconds, clearPersistedTimerSnapshot]);

  // Run wall-clock check every 300ms + re-sync & re-lock screen immediately on visibilitychange / focus
  useEffect(() => {
    if (!isRunning || isFinishing) return;

    const interval = window.setInterval(evaluateWallClock, 300);

    const handleVisibilityOrFocus = () => {
      evaluateWallClock();
      if (document.visibilityState === 'visible') {
        requestWorkoutScreenWakeLock().then((locked) => {
          setWakeLockActive(locked);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
    };
  }, [isRunning, isFinishing, evaluateWallClock]);

  const elapsedSeconds = totalSeconds - secondsLeft;
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const handleTogglePlayPause = () => {
    if (isRunning) {
      // Pause: freeze current remaining seconds
      setIsRunning(false);
      persistTimerSnapshot(
        false,
        prepSecondsLeft,
        secondsLeft,
        prepEndAtMsRef.current,
        workoutEndAtMsRef.current
      );
    } else {
      // Resume: compute new wall-clock deadlines from remaining seconds
      const now = Date.now();
      const newPrepEnd = now + prepSecondsLeft * 1000;
      const newWorkoutEnd = newPrepEnd + secondsLeft * 1000;
      prepEndAtMsRef.current = newPrepEnd;
      workoutEndAtMsRef.current = newWorkoutEnd;
      setIsRunning(true);
      persistTimerSnapshot(true, prepSecondsLeft, secondsLeft, newPrepEnd, newWorkoutEnd);
    }
  };

  const handleSkipPrepImmediateStart = () => {
    const now = Date.now();
    prepEndAtMsRef.current = now;
    workoutEndAtMsRef.current = now + secondsLeft * 1000;
    hasStartedMainRef.current = true;
    setPrepSecondsLeft(0);
    if (soundEnabled) playWorkoutStartChime();
    setCueBanner('ΠΑΜΕ! Το χρονόμετρο ξεκίνησε.');
    persistTimerSnapshot(true, 0, secondsLeft, now, workoutEndAtMsRef.current);
  };

  const handleResetTimer = () => {
    const now = Date.now();
    prepEndAtMsRef.current = now + 5000;
    workoutEndAtMsRef.current = now + 5000 + totalSeconds * 1000;
    hasStartedMainRef.current = false;
    lastFiredCueSecRef.current = null;
    lastFiredPrepSecRef.current = 5;
    setPrepSecondsLeft(5);
    setSecondsLeft(totalSeconds);
    setIsRunning(true);
    setCueBanner('Επαναφορά: Ξεκινάμε σε 5 δευτερόλεπτα...');
    persistTimerSnapshot(true, 5, totalSeconds, prepEndAtMsRef.current, workoutEndAtMsRef.current);
    if (soundEnabled) {
      playPrepCountdownTick();
    }
  };

  const handleCancelTimer = () => {
    clearPersistedTimerSnapshot();
    stopWorkoutKeepAlive();
    onCancel();
  };

  const handleConfirmFinish = async () => {
    setIsSaving(true);
    clearPersistedTimerSnapshot();
    await stopWorkoutKeepAlive();
    const actualMins = Math.max(
      1,
      Math.round((elapsedSeconds > 30 ? elapsedSeconds : totalSeconds) / 60)
    );
    await onComplete(actualMins, rpe, notes);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-zinc-950/98 p-4 pb-8 text-zinc-100 backdrop-blur-lg">
      {/* POCKET / BATTERY-SAVER BLACK SCREEN OVERLAY */}
      {pocketDimMode && !isFinishing && (
        <div
          onClick={() => setPocketDimMode(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setPocketDimMode(false);
          }}
          className="fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center bg-black p-6 text-center select-none"
        >
          <Moon className="h-8 w-8 text-emerald-500/50" />
          <div className="mt-3 font-mono text-5xl font-bold text-emerald-400/70">
            {prepSecondsLeft > 0 ? `00:0${prepSecondsLeft}` : formatTime(secondsLeft)}
          </div>
          <p className="mt-2 text-xs font-semibold text-zinc-400">
            Λειτουργία Τσέπης / Εξοικονόμησης Μπαταρίας Ενεργή
          </p>
          <p className="mt-1 max-w-xs text-[11px] text-zinc-500">
            Η άσκηση και οι ήχοι (30&quot;, 1&apos;, 3-2-1 Φινάλε) συνεχίζονται κανονικά χωρίς να
            κλείνει η εφαρμογή.
          </p>
          <span className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-bold text-emerald-400">
            Πάτησε οπουδήποτε στην οθόνη για επαναφορά φωτεινότητας
          </span>
        </div>
      )}

      {/* Top Bar */}
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            {MODALITY_LABELS_GREEK[session.modality]} • Χωρίς Εξοπλισμό
          </span>

          {!isFinishing && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-extrabold text-emerald-300"
              title="Η οθόνη και το χρονόμετρο παραμένουν ενεργά μέχρι να τελειώσει η άσκηση"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {wakeLockActive
                ? 'Οθόνη Ανοιχτή & Background Ενεργό'
                : 'Αδιάκοπη Λειτουργία (Anti-Sleep Ενεργό)'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isFinishing && (
            <button
              type="button"
              onClick={() => setPocketDimMode(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-bold text-zinc-200 transition hover:border-emerald-500/40"
              title="Σβήνει τη φωτεινότητα για να βάλεις το κινητό στην τσέπη χωρίς να σταματήσει η άσκηση"
            >
              <Smartphone className="h-4 w-4 text-emerald-400" />
              <span>Τσέπη</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`inline-flex h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
              soundEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400'
            }`}
            title="Ενεργοποίηση / Απενεργοποίηση Ηχητικών Σημάτων Χρονομέτρου"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-4 w-4 text-emerald-400" />
                <span>Ήχοι Ενεργοί</span>
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4" />
                <span>Αθόρυβο</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCancelTimer}
            aria-label="Κλείσιμο χρονομέτρου"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {!isFinishing ? (
        <div className="mx-auto my-auto flex w-full max-w-2xl flex-col items-center py-3 text-center">
          <p className="text-xs font-medium text-emerald-400">{session.intensityLabel}</p>
          <h2 className="mt-1 text-lg font-bold leading-snug text-zinc-50 sm:text-xl">
            {session.title}
          </h2>

          {/* Anti-Sleep Reassurance Pill */}
          <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-1.5 text-[11px] text-zinc-300">
            🔒 <strong className="text-emerald-400">Δεν κλείνει η άσκηση:</strong> Το κινητό μένει
            ενεργό μέχρι το 00:00 — κι αν κλειδώσεις την οθόνη στην τσέπη σου, ο χρόνος & οι ήχοι
            συνεχίζουν κανονικά!
          </div>

          {/* Acoustic Status / Cue Banner */}
          {cueBanner && (
            <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
              <span>{cueBanner}</span>
              {prepSecondsLeft > 0 && (
                <button
                  type="button"
                  onClick={handleSkipPrepImmediateStart}
                  className="ml-1 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold text-zinc-950"
                >
                  Άμεση Έναρξη
                </button>
              )}
            </div>
          )}

          <div className="mt-4 grid w-full grid-cols-1 items-center gap-5 md:grid-cols-12">
            {/* Left / Top: Large Readable Countdown Circle & Controls */}
            <div className="flex flex-col items-center md:col-span-5">
              <div
                className={`relative my-3 flex h-48 w-48 flex-col items-center justify-center rounded-full border-4 bg-zinc-900/80 shadow-2xl transition-all ${
                  prepSecondsLeft > 0
                    ? 'border-amber-400/80'
                    : secondsLeft <= 3
                    ? 'scale-105 border-emerald-400'
                    : 'border-zinc-800'
                }`}
              >
                <div
                  className="absolute inset-0 rounded-full border-4 border-emerald-500/80 transition-all duration-500"
                  style={{
                    clipPath: `inset(${100 - progressPercent}% 0 0 0)`,
                  }}
                />
                {prepSecondsLeft > 0 ? (
                  <>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      Έναρξη σε
                    </span>
                    <span className="font-mono text-5xl font-extrabold text-amber-300">
                      {prepSecondsLeft}
                    </span>
                    <span className="mt-1 text-[11px] font-medium text-zinc-300">
                      Πάρε θέση...
                    </span>
                  </>
                ) : (
                  <>
                    {secondsLeft <= 3 && secondsLeft > 0 && (
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                        Φινάλε {secondsLeft}!
                      </span>
                    )}
                    <span className="font-mono text-4xl font-bold tracking-tight text-zinc-50">
                      {formatTime(secondsLeft)}
                    </span>
                    <span className="mt-1 text-xs font-medium text-zinc-400">
                      {isRunning ? 'Σε εξέλιξη • Με τον ρυθμό σου' : 'Σε παύση'}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-2 flex w-full items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleResetTimer}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-300 active:scale-95"
                  title="Επαναφορά χρόνου (με αντίστροφη μέτρηση 5 δευτ.)"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 text-base font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-98"
                >
                  {isRunning ? (
                    <>
                      <Pause className="h-5 w-5 fill-current" />
                      Παύση
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 fill-current" />
                      Συνέχεια
                    </>
                  )}
                </button>
              </div>

              {/* Acoustic Cues Legend & 1-Click Sound Preview */}
              <div className="mt-3 w-full rounded-xl border border-zinc-800/90 bg-zinc-900/70 p-2.5 text-left text-[11px] text-zinc-300">
                <div className="font-bold text-emerald-400">
                  🔊 Έξυπνα Ηχητικά Σήματα (Δοκιμή με 1 κλικ):
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => playPrepCountdownTick()}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-left text-[10px] hover:border-emerald-500/40"
                  >
                    • <strong>5&quot; Έναρξη:</strong> Απαλό τικ προετοιμασίας
                  </button>
                  <button
                    type="button"
                    onClick={() => playHalfMinuteDiscreetPulse()}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-left text-[10px] hover:border-emerald-500/40"
                  >
                    • <strong>Κάθε 30&quot;:</strong> Διακριτική σταγόνα ρυθμού
                  </button>
                  <button
                    type="button"
                    onClick={() => playFullMinuteDiscreetPulse()}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-left text-[10px] hover:border-emerald-500/40"
                  >
                    • <strong>Κάθε 1&apos;:</strong> Διπλός ήρεμος τόνος λεπτού
                  </button>
                  <button
                    type="button"
                    onClick={() => playGrandFinaleFanfare()}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-left text-[10px] hover:border-emerald-500/40"
                  >
                    • <strong>Φινάλε (3-2-1):</strong> Μελωδία ολοκλήρωσης
                  </button>
                </div>
              </div>
            </div>

            {/* Right / Bottom: Easy-to-Read Numbered Exercise Steps */}
            <div className="w-full md:col-span-7">
              {session.exercisesGreek && session.exercisesGreek.length > 0 && (
                <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <ListChecks className="h-4 w-4" />
                    <span>Τι κάνουμε βήμα-βήμα:</span>
                  </div>
                  <ol className="mt-2.5 space-y-2.5 text-sm leading-relaxed text-zinc-100">
                    {session.exercisesGreek.map((ex, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                          {idx + 1}
                        </span>
                        <span>{ex.replace(/^Βήμα\s*\d+\s*[:(-]?\s*/i, '')}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (soundEnabled) playGrandFinaleFanfare();
              clearPersistedTimerSnapshot();
              stopWorkoutKeepAlive();
              setIsRunning(false);
              setIsFinishing(true);
            }}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            <CheckCircle2 className="h-4 w-4" />
            Τέλειωσα! Καταγραφή (+{session.habitPointsAward} πόντοι)
          </button>
        </div>
      ) : (
        <div className="mx-auto my-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
            <h3 className="text-lg font-bold">Μπράβο! Η Κίνηση Ολοκληρώθηκε</h3>
          </div>
          <p className="mt-1.5 text-sm text-zinc-300">
            Κέρδισες <strong className="text-emerald-400">+{session.habitPointsAward}</strong> πόντους
            Συνέπειας και <strong className="text-zinc-100">+{session.structuralPointsAward}</strong>{' '}
            πόντους Δύναμης & Αντοχής.
          </p>

          <div className="mt-5">
            <label className="flex items-center justify-between text-sm font-semibold text-zinc-200">
              <span>Πώς σου φάνηκε;</span>
              <span className="rounded-lg bg-zinc-800 px-2.5 py-0.5 text-emerald-400">
                {rpe}/10
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="mt-3 w-full"
            />
            <div className="mt-1.5 flex justify-between text-xs text-zinc-400">
              <span>1 • Πανεύκολη</span>
              <span>5 • Κανονική</span>
              <span>10 • Πολύ κουραστική</span>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-zinc-300">
              Σημείωση (προαιρετικό)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="π.χ. Ξεπιάστηκε η μέση μου, ένιωσα πολύ ωραία..."
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleConfirmFinish}
            className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <CheckCircle2 className="h-5 w-5" />
            {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση Προόδου'}
          </button>
        </div>
      )}

      {/* Footer Notice */}
      <div className="mx-auto w-full max-w-md text-center text-xs text-zinc-500">
        Κάθε μικρή κίνηση μετράει. Χωρίς άγχος και χωρίς εξοπλισμό.
      </div>
    </div>
  );
}
