'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Footprints, PlusCircle, Sparkles } from 'lucide-react';
import {
  ModalityType,
  MODALITY_LABELS_GREEK,
  MovementLog,
  STAGES,
  UserProgressionState,
} from '@/types/kinesis';
import {
  DEFAULT_PROGRESSION,
  getKinesisSnapshot,
  recordMovementLog,
} from '@/lib/storage/db';

const MODALITIES: ModalityType[] = [
  'walk',
  'mobility',
  'stairs',
  'treadmill',
  'strength',
  'walk_run',
  'run',
];

const QUICK_DURATIONS = [3, 5, 10, 15, 20, 30, 45];

export default function QuickLogPage() {
  const [modality, setModality] = useState<ModalityType>('walk');
  const [durationMins, setDurationMins] = useState<number>(15);
  const [rpe, setRpe] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [progression, setProgression] = useState<UserProgressionState>(DEFAULT_PROGRESSION);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      getKinesisSnapshot().then((snap) => {
        setLogs(snap.logs);
        setProgression(snap.progression);
      });
    };
    load();
    window.addEventListener('kinesis-sync-restored', load);
    return () => window.removeEventListener('kinesis-sync-restored', load);
  }, []);

  const calculateAwards = (mod: ModalityType, mins: number) => {
    const habitPoints = mins <= 5 ? 15 : 14;
    const multipliers: Record<ModalityType, number> = {
      mobility: 0.3,
      walk: 0.45,
      treadmill: 0.6,
      stairs: 0.65,
      strength: 0.7,
      walk_run: 0.85,
      run: 1.0,
    };
    const structuralPoints = Math.max(2, Math.round(mins * multipliers[mod]));
    return { habitPoints, structuralPoints };
  };

  const previewAwards = calculateAwards(modality, durationMins);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { habitPoints, structuralPoints } = calculateAwards(modality, durationMins);

    const res = await recordMovementLog({
      title: `${durationMins}' ${MODALITY_LABELS_GREEK[modality]}`,
      modality,
      durationMins,
      intensityLabel: `RPE ${rpe}/10 • Χειροκίνητη Καταγραφή`,
      habitPointsEarned: habitPoints,
      structuralPointsEarned: structuralPoints,
      rpe,
      notes,
      wasNegotiated: 'manual_log',
    });

    setLogs((prev) => [res.log, ...prev]);
    setProgression(res.progression);
    setNotes('');

    if (res.stageAdvanced) {
      setFeedbackMessage(
        `Εξαιρετικά! Προήχθης στο ${STAGES[res.progression.currentStage].code}: ${
          STAGES[res.progression.currentStage].titleGreek
        }.`
      );
    } else {
      setFeedbackMessage(
        `Καταγράφηκε! +${habitPoints} πόντοι Συνέπειας & +${structuralPoints} πόντοι Δομικής Ανοχής.`
      );
    }
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <PlusCircle className="h-5 w-5" />
          <h1 className="text-lg font-bold text-zinc-50">Γρήγορη Καταγραφή Κίνησης</h1>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Κάθε κίνηση μέσα στη μέρα μετράει. Ακόμα και 3 λεπτά στις σκάλες του γραφείου χτίζουν το
          νευρικό κύκλωμα.
        </p>
      </header>

      {feedbackMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* 100% Responsive 2-Column Layout on Desktop, 1-Column on Mobile */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="min-w-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 lg:col-span-6"
        >
          <div>
            <label className="block text-xs font-semibold text-zinc-300">
              Τύπος Κίνησης
            </label>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {MODALITIES.map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModality(mod)}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition ${
                    modality === mod
                      ? 'border border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                      : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{MODALITY_LABELS_GREEK[mod]}</span>
                  {modality === mod && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span>Διάρκεια (λεπτά)</span>
              <span className="text-emerald-400">{durationMins} λεπτά</span>
            </label>
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {QUICK_DURATIONS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMins(mins)}
                  className={`min-h-[42px] rounded-xl py-2 text-xs font-semibold transition ${
                    durationMins === mins
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mins}&apos;
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span>Πόσο κουράστηκες; (1 = Πανεύκολα, 10 = Πολύ)</span>
              <span className="font-bold text-emerald-400">{rpe}/10</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300">
              Σημείωση (προαιρετικό)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="π.χ. Περπάτημα γυρνώντας από τη δουλειά..."
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              Πόντοι που θα αποδοθούν:
            </span>
            <span className="font-semibold text-emerald-400">
              +{previewAwards.habitPoints} Συνέπεια • +{previewAwards.structuralPoints} Δομική
            </span>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Καταχώρηση Κίνησης ({STAGES[progression.currentStage].code})
          </button>
        </form>

        {/* Recent Logs */}
        <section className="min-w-0 space-y-2.5 lg:col-span-6">
          <h2 className="text-sm font-bold text-zinc-200">
            Πρόσφατο Ιστορικό Κινήσεων ({logs.length})
          </h2>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 text-center text-xs text-zinc-400">
              Δεν υπάρχουν καταγραφές ακόμα. Κάνε την πρώτη σου κίνηση σήμερα!
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
              {logs.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Footprints className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-xs font-semibold text-zinc-100">{item.title}</span>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
                      <Clock className="h-3 w-3 text-emerald-400" />
                      {item.durationMins}&apos;
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-zinc-400">
                    <span>{item.intensityLabel}</span>
                    <span className="text-emerald-400">
                      +{item.habitPointsEarned} Συνέπεια / +{item.structuralPointsEarned} Δομή
                    </span>
                  </div>
                  {item.notes && (
                    <p className="mt-1.5 text-[11px] italic text-zinc-400">«{item.notes}»</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
