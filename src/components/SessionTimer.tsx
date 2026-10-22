'use client';

import React, { useEffect, useState } from 'react';
import { Play, Pause, CheckCircle2, X, RotateCcw, Sparkles } from 'lucide-react';
import { ModalityType, MODALITY_LABELS_GREEK } from '@/types/kinesis';

export interface ActiveTimerSession {
  title: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  habitPointsAward: number;
  structuralPointsAward: number;
  wasNegotiated: 'primary' | 'bored_swap' | 'micro_step';
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
  const [secondsLeft, setSecondsLeft] = useState<number>(totalSeconds);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const [rpe, setRpe] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isRunning || isFinishing) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setIsRunning(false);
          setIsFinishing(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, isFinishing]);

  const elapsedSeconds = totalSeconds - secondsLeft;
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const handleConfirmFinish = async () => {
    setIsSaving(true);
    const actualMins = Math.max(
      1,
      Math.round((elapsedSeconds > 30 ? elapsedSeconds : totalSeconds) / 60)
    );
    await onComplete(actualMins, rpe, notes);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-zinc-950/98 p-5 text-zinc-100 backdrop-blur-lg">
      {/* Top Bar */}
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            {MODALITY_LABELS_GREEK[session.modality]}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Κλείσιμο χρονομέτρου"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-zinc-400 hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Content */}
      {!isFinishing ? (
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {session.intensityLabel}
          </p>
          <h2 className="mt-2 text-lg font-semibold leading-snug text-zinc-100">
            {session.title}
          </h2>

          {/* Minimalist Countdown Circle */}
          <div className="relative my-8 flex h-60 w-60 flex-col items-center justify-center rounded-full border-4 border-zinc-800 bg-zinc-900/70 shadow-2xl">
            <div
              className="absolute inset-0 rounded-full border-4 border-emerald-500/70 transition-all duration-500"
              style={{
                clipPath: `inset(${100 - progressPercent}% 0 0 0)`,
              }}
            />
            <span className="font-mono text-5xl font-bold tracking-tight text-zinc-50">
              {formatTime(secondsLeft)}
            </span>
            <span className="mt-2 text-xs text-zinc-400">
              {isRunning ? 'Σε εξέλιξη • Χωρίς πίεση' : 'Σε παύση'}
            </span>
          </div>

          <div className="flex w-full items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setSecondsLeft(totalSeconds)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-300 active:scale-95"
              title="Επαναφορά"
            >
              <RotateCcw className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setIsRunning((prev) => !prev)}
              className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-98"
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

          <button
            type="button"
            onClick={() => {
              setIsRunning(false);
              setIsFinishing(true);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/90 py-3.5 text-sm font-medium text-emerald-400 hover:bg-zinc-900"
          >
            <CheckCircle2 className="h-4 w-4" />
            Ολοκλήρωση Κίνησης Τώρα (+{session.habitPointsAward} πόντοι συνέπειας)
          </button>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
            <h3 className="text-lg font-bold">Το Επόμενο Βήμα Ολοκληρώθηκε</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Κέρδισες <strong className="text-emerald-400">+{session.habitPointsAward}</strong> πόντους
            Συνέπειας και <strong className="text-zinc-200">+{session.structuralPointsAward}</strong>{' '}
            πόντους Δομικής Ανοχής.
          </p>

          <div className="mt-5">
            <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
              <span>Υποκειμενική Δυσκολία (RPE 1-10)</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-emerald-400">{rpe}/10</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
              <span>1 • Ξεκούραστο</span>
              <span>5 • Μέτριο</span>
              <span>10 • Μέγιστο</span>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-zinc-300">
              Σημείωση αίσθησης (προαιρετικό)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="π.χ. Άνετη αναπνοή, ξεμπλόκαρε η μέση..."
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleConfirmFinish}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <CheckCircle2 className="h-5 w-5" />
            {isSaving ? 'Αποθήκευση...' : 'Καταχώρηση & Ενημέρωση Σταδίου'}
          </button>
        </div>
      )}

      {/* Footer Notice */}
      <div className="mx-auto w-full max-w-md text-center text-xs text-zinc-500">
        Κάθε έναρξη κίνησης ενισχύει το νευρικό κύκλωμα της συνήθειας. Μηδέν ενοχές.
      </div>
    </div>
  );
}
