'use client';

import React, { useEffect, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  MODALITY_LABELS_GREEK,
  MovementLog,
  RejectionEvent,
  REJECTION_REASON_LABELS_GREEK,
  StageId,
  STAGES,
  UserProgressionState,
} from '@/types/kinesis';
import {
  DEFAULT_PROGRESSION,
  getKinesisSnapshot,
  saveProgression,
} from '@/lib/storage/db';

const ALL_STAGES: StageId[] = [0, 1, 2, 3, 4, 5];

export default function ProgressAndBehaviorPage() {
  const [progression, setProgression] = useState<UserProgressionState>(DEFAULT_PROGRESSION);
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [rejections, setRejections] = useState<RejectionEvent[]>([]);

  useEffect(() => {
    const load = () => {
      getKinesisSnapshot().then((snap) => {
        setProgression(snap.progression);
        setLogs(snap.logs);
        setRejections(snap.rejections);
      });
    };
    load();
    window.addEventListener('kinesis-sync-restored', load);
    return () => window.removeEventListener('kinesis-sync-restored', load);
  }, []);

  const handleStageSelect = async (stage: StageId) => {
    const next: UserProgressionState = {
      ...progression,
      currentStage: stage,
    };
    setProgression(next);
    await saveProgression(next);
  };

  const currentStageDef = STAGES[progression.currentStage];
  const totalMinutesMoved = logs.reduce((acc, l) => acc + l.durationMins, 0);

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <TrendingUp className="h-5 w-5" />
          <h1 className="text-lg font-bold text-zinc-50">Διπλή Πρόοδος & Μνήμη Συμπεριφοράς</h1>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Διαχωρισμός της νευρολογικής συνέπειας από τη μηχανική αντοχή των τενόντων.
        </p>
      </header>

      {/* 100% Responsive 2-Column Layout on Desktop, 1-Column on Mobile */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          {/* Dual Progression Bars Card */}
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">
                  1. Συνέπεια Εκκίνησης (habitConsistencyScore)
                </span>
                <span className="text-sm font-bold text-emerald-400">
                  {progression.habitConsistencyScore}/100
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Επιβραβεύει κάθε νίκη απέναντι στην αδράνεια (ακόμα και 2 λεπτά κινητικότητας).
              </p>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progression.habitConsistencyScore}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-1 text-[10px] text-zinc-500">
                <span>Απαίτηση επόμενου σταδίου: {currentStageDef.minHabitScoreToAdvance}%</span>
                <span>Συνολικές συνεδρίες: {progression.totalSessionsCompleted}</span>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-100">
                  2. Δομική & Αερόβια Ετοιμότητα (runningReadiness)
                </span>
                <span className="text-sm font-bold text-zinc-100">
                  {progression.runningReadiness}/100
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Σταθμισμένο φορτίο τενόντων, οστών και καρδιοαναπνευστικού για ασφαλή μετάβαση στα
                5km.
              </p>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-400/80 transition-all duration-500"
                  style={{ width: `${progression.runningReadiness}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-1 text-[10px] text-zinc-500">
                <span>Απαίτηση επόμενου σταδίου: {currentStageDef.minReadinessToAdvance}%</span>
                <span>Συνολικά λεπτά κίνησης: {totalMinutesMoved}&apos;</span>
              </div>
            </div>
          </section>

          {/* Behavioral Memory & Rejection Taxonomy */}
          <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-emerald-400">
              <Brain className="h-4 w-4" />
              <h2 className="text-sm font-bold text-zinc-100">
                Μνήμη Συμπεριφοράς & Ταξινομία Απορρίψεων
              </h2>
            </div>
            <p className="text-xs text-zinc-400">
              Όταν αλλάζεις μια πρόταση, το σύστημα δεν σε τιμωρεί: καταγράφει την αιτία και
              προσαρμόζει τις επόμενες επιλογές.
            </p>

            {rejections.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs text-zinc-400">
                Δεν έχουν καταγραφεί απορρίψεις ακόμα. Το κουμπί «Μπορώ, αλλά βαριέμαι» ενημερώνει
                αυτόματα τη μνήμη.
              </div>
            ) : (
              <div className="space-y-2">
                {rejections.slice(0, 6).map((rej) => (
                  <div
                    key={rej.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-zinc-200">
                        {MODALITY_LABELS_GREEK[rej.modality]}
                      </span>
                      <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        {REJECTION_REASON_LABELS_GREEK[rej.reason]}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500">MOS {rej.mosAtTime}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* State-Driven Stages 0 -> 5 */}
        <section className="space-y-2.5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-zinc-100">
              Στάδια Μετάβασης (Stage 0 → Stage 5)
            </h2>
            <span className="text-[11px] text-zinc-400">Πάτησε για προσομοίωση σταδίου</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ALL_STAGES.map((stageId) => {
              const st = STAGES[stageId];
              const isCurrent = progression.currentStage === stageId;
              const isCompleted = progression.currentStage > stageId;

              return (
                <button
                  key={stageId}
                  type="button"
                  onClick={() => handleStageSelect(stageId)}
                  className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                    isCurrent
                      ? 'border-emerald-500/60 bg-zinc-900 shadow-lg'
                      : isCompleted
                      ? 'border-zinc-800 bg-zinc-900/70'
                      : 'border-zinc-800/60 bg-zinc-900/40 opacity-80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        {isCurrent ? (
                          <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Lock className="h-4 w-4 shrink-0 text-zinc-500" />
                        )}
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          {st.code}
                        </span>
                      </div>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Τρέχον
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold text-zinc-100">{st.titleGreek}</h3>
                    <p className="mt-1 text-xs font-medium text-zinc-300">{st.subtitleGreek}</p>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                    {st.descriptionGreek}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
