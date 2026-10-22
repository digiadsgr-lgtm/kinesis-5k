'use client';

import React, { useRef, useState } from 'react';
import {
  Apple,
  CheckCircle2,
  Flame,
  FileUp,
  HeartHandshake,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Utensils,
} from 'lucide-react';
import {
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  MovementLog,
  UserProgressionState,
} from '@/types/kinesis';
import {
  calculateAthleticMachineProgress,
  createSampleBalancedDietPlan,
  getDailyNutritionAndMotivation,
  parseDietPlanFile,
  parseDietPlanFromText,
  PersonalTransformationGoal,
  PRESET_GOALS_GREEK,
  UploadedDietPlan,
} from '@/lib/engine/nutritionAndMotivation';
import { ActiveTimerSession } from './SessionTimer';

interface GoalAndNutritionHubProps {
  progression: UserProgressionState;
  checkIn: CheckInInput;
  biometrics: DailyBiometrics;
  biomarkers: BiomarkerProfile;
  logs: MovementLog[];
  goal: PersonalTransformationGoal;
  dietPlan: UploadedDietPlan | null;
  onSaveGoal: (updated: PersonalTransformationGoal) => Promise<void>;
  onSaveDietPlan: (plan: UploadedDietPlan | null) => Promise<void>;
  onTriggerCravingResetWorkout: (session: ActiveTimerSession) => void;
}

export default function GoalAndNutritionHub({
  progression,
  checkIn,
  biometrics,
  biomarkers,
  logs,
  goal,
  dietPlan,
  onSaveGoal,
  onSaveDietPlan,
  onTriggerCravingResetWorkout,
}: GoalAndNutritionHubProps) {
  const [tipOffset, setTipOffset] = useState<number>(0);
  const [isEditingGoal, setIsEditingGoal] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>(goal.primaryGoalTitle);
  const [draftWhy, setDraftWhy] = useState<string>(goal.personalWhy);
  const [draftWeeklyMins, setDraftWeeklyMins] = useState<number>(goal.weeklyTargetMinutes);

  const [showPasteDiet, setShowPasteDiet] = useState<boolean>(false);
  const [pastedDietText, setPastedDietText] = useState<string>('');
  const [dietStatus, setDietStatus] = useState<string | null>(null);
  const dietFileInputRef = useRef<HTMLInputElement | null>(null);

  const dailyTip = getDailyNutritionAndMotivation(
    progression.currentStage,
    checkIn,
    biometrics,
    biomarkers,
    tipOffset
  );

  const machineStats = calculateAthleticMachineProgress(progression, biometrics, logs, goal);

  const handleSaveGoalForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveGoal({
      ...goal,
      primaryGoalTitle: draftTitle.trim() || goal.primaryGoalTitle,
      personalWhy: draftWhy.trim() || goal.personalWhy,
      weeklyTargetMinutes: Math.max(10, draftWeeklyMins),
    });
    setIsEditingGoal(false);
  };

  const handleSelectPresetGoal = async (preset: (typeof PRESET_GOALS_GREEK)[number]) => {
    setDraftTitle(preset.title);
    setDraftWhy(preset.why);
    setDraftWeeklyMins(preset.weeklyMins);
    await onSaveGoal({
      ...goal,
      primaryGoalTitle: preset.title,
      personalWhy: preset.why,
      weeklyTargetMinutes: preset.weeklyMins,
    });
    setIsEditingGoal(false);
  };

  const handleCravingResetClick = async () => {
    await onSaveGoal({
      ...goal,
      cravingResetsCompleted: (goal.cravingResetsCompleted || 0) + 1,
    });

    onTriggerCravingResetWorkout({
      title: "2' SOS Επανεκκίνηση Καναπέ & Διακοπή Λιγούρας",
      modality: 'mobility',
      durationMins: 2,
      intensityLabel: 'Ψυχολογική Αποφόρτιση • Χωρίς Ενοχές',
      habitPointsAward: 15,
      structuralPointsAward: 3,
      wasNegotiated: 'micro_step',
      exercisesGreek: [
        'Βήμα 1 (Ενυδάτωση): Πιες 1 μεγάλο ποτήρι νερό με ήρεμες γουλιές.',
        'Βήμα 2 (Αλλαγή Θέσης): Σήκω όρθιος μακριά από τον καναπέ ή την κουζίνα και τέντωσε τα χέρια ψηλά.',
        `Βήμα 3 (Κίνηση 90 Δευτερολέπτων): ${dailyTip.cravingResetMicroActionGreek}`,
        'Βήμα 4 (Αναπνοή): Πάρε 4 βαθιές ανάσες (4" εισπνοή από τη μύτη, 6" εκπνοή από το στόμα). Η ψυχολογική ένταση πέφτει αμέσως!',
      ],
    });
  };

  const handleDietFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseDietPlanFile(file);
      await onSaveDietPlan(parsed);
      setDietStatus(`Η διατροφή σου («${file.name}») αναλύθηκε και συνδέθηκε με την κίνησή σου!`);
    } catch {
      setDietStatus('Σφάλμα ανάγνωσης αρχείου διατροφής. Δοκίμασε επικόλληση κειμένου.');
    } finally {
      if (dietFileInputRef.current) dietFileInputRef.current.value = '';
    }
  };

  const handlePasteDietSubmit = async () => {
    if (!pastedDietText.trim()) return;
    const parsed = parseDietPlanFromText(pastedDietText, 'Προσωπικό_Πλάνο_Διατροφής');
    await onSaveDietPlan(parsed);
    setPastedDietText('');
    setShowPasteDiet(false);
    setDietStatus('Το πλάνο διατροφής σου αποθηκεύτηκε και οργανώθηκε σε γεύματα!');
  };

  const handleLoadSampleDiet = async () => {
    const sample = createSampleBalancedDietPlan();
    await onSaveDietPlan(sample);
    setDietStatus(
      'Φορτώθηκε το Έτοιμο Πλάνο Κορεσμού & Ενέργειας (ειδικά σχεδιασμένο για να κόβει το βραδινό τσιμπολόγημα)!'
    );
  };

  return (
    <section
      id="goal-nutrition-section"
      aria-label="Στόχος, Διατροφικό Tip Ημέρας & Μεταμόρφωση σε Αθλητική Μηχανή"
      className="scroll-mt-20 space-y-5"
    >
      {/* 1. DAILY NUTRITION TIP & PSYCHOLOGICAL SPARK CARD */}
      <div className="rounded-2xl border border-emerald-500/40 bg-zinc-900/95 p-4 sm:p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-400">
            <Apple className="h-3.5 w-3.5" />
            Διατροφικό Tip & Κίνητρο Ημέρας • {dailyTip.badgeGreek}
          </span>

          <button
            type="button"
            onClick={() => setTipOffset((prev) => prev + 1)}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:border-emerald-500/40 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            Άλλο Tip
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {/* Nutrition Tip Box */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-bold text-zinc-100">{dailyTip.nutritionTitleGreek}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
              {dailyTip.nutritionTipGreek}
            </p>
            <div className="mt-2.5 border-t border-zinc-800/80 pt-2 text-[11px] text-emerald-400">
              <strong>Γιατί δουλεύει: </strong>
              <span className="text-zinc-300">{dailyTip.whyItWorksScienceGreek}</span>
            </div>
          </div>

          {/* Movement Spark & Respect for Couch Inertia Box */}
          <div className="flex flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Flame className="h-4 w-4 shrink-0" />
                <span>{dailyTip.movementSparkTitleGreek}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-100">
                {dailyTip.movementSparkTextGreek}
              </p>
              <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-zinc-950/60 p-2.5 text-[11px] text-zinc-300">
                <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{dailyTip.couchRespectMessageGreek}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCravingResetClick}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/20 transition active:scale-[0.99]"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              SOS Καναπέ & Λιγούρας: Κάνε 2&apos; Επανεκκίνηση Τώρα
            </button>
          </div>
        </div>
      </div>

      {/* 2. TRANSFORMATION GOAL: FROM COUCH TO ATHLETIC MACHINE */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/95 p-4 sm:p-5 shadow-lg lg:col-span-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Trophy className="h-4 w-4" />
                Περισσότερη Κίνηση = Πιο Κοντά στον Στόχο
              </span>
              <h3 className="mt-1 text-base font-bold text-zinc-50">
                Μεταμόρφωση σε Αθλητική Μηχανή
              </h3>
            </div>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-right">
              <span className="block text-[10px] font-semibold text-emerald-400">Μεταμόρφωση</span>
              <span className="text-base font-extrabold text-zinc-50">
                {machineStats.machineScore}%
              </span>
            </div>
          </div>

          {/* Progress Bar from Couch to Athletic Machine */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-emerald-400">{machineStats.phaseTitleGreek}</span>
              <span className="text-zinc-400">
                {machineStats.weeklyMinutesDone}/{machineStats.weeklyTargetMinutes}&apos; αυτή την
                εβδομάδα
              </span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${machineStats.machineScore}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">
              {machineStats.phaseDescriptionGreek}
            </p>
          </div>

          {/* User's Personal Goal Box */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Target className="h-3.5 w-3.5" />
                Ο Προσωπικός μου Στόχος:
              </span>
              <button
                type="button"
                onClick={() => setIsEditingGoal((prev) => !prev)}
                className="text-[11px] font-semibold text-emerald-400 underline hover:opacity-80"
              >
                {isEditingGoal ? 'Κλείσιμο' : 'Αλλαγή Στόχου'}
              </button>
            </div>

            {!isEditingGoal ? (
              <div className="mt-1.5 space-y-1">
                <p className="text-sm font-bold text-zinc-100">{goal.primaryGoalTitle}</p>
                <p className="text-xs italic text-zinc-400">«{goal.personalWhy}»</p>
                <div className="mt-2 flex flex-wrap gap-2 pt-1 text-[11px] text-zinc-300">
                  <span className="rounded-lg bg-zinc-900 px-2.5 py-1">
                    Εβδομαδιαίος Στόχος: <strong>{goal.weeklyTargetMinutes} λεπτά</strong>
                  </span>
                  <span className="rounded-lg bg-zinc-900 px-2.5 py-1">
                    Νίκες απέναντι στη λιγούρα: <strong>{goal.cravingResetsCompleted || 0}</strong>
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveGoalForm} className="mt-3 space-y-3">
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-400">
                    Έτοιμοι Στόχοι (Πάτησε για επιλογή):
                  </span>
                  <div className="mt-1.5 space-y-1.5">
                    {PRESET_GOALS_GREEK.map((preset, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectPresetGoal(preset)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-200 hover:border-emerald-500/40"
                      >
                        <div className="font-bold text-emerald-400">{preset.title}</div>
                        <div className="text-[11px] text-zinc-400">{preset.why}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Ή γράψε τον δικό σου Στόχο:
                  </label>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Γιατί είναι σημαντικό για σένα; (Χωρίς άγχος):
                  </label>
                  <input
                    type="text"
                    value={draftWhy}
                    onChange={(e) => setDraftWhy(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-xs font-semibold text-zinc-300">
                    <span>Στόχος Λεπτών Κίνησης την Εβδομάδα:</span>
                    <span className="text-emerald-400">{draftWeeklyMins} λεπτά</span>
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={180}
                    step={5}
                    value={draftWeeklyMins}
                    onChange={(e) => setDraftWeeklyMins(Number(e.target.value))}
                    className="mt-1.5 w-full"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950"
                >
                  Αποθήκευση Στόχου
                </button>
              </form>
            )}
          </div>
        </div>

        {/* 3. PERSONAL DIET PLAN UPLOADER & MEAL SYNERGY */}
        <div className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/95 p-4 sm:p-5 shadow-lg lg:col-span-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Utensils className="h-4 w-4" />
                Η Διατροφή Μου & Καύσιμο Κίνησης
              </span>
              <h3 className="mt-1 text-base font-bold text-zinc-50">
                 ανέβασε τη Διατροφή σου (PDF ή Κείμενο)
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Έχεις πρόγραμμα από διατροφολόγο ή δική σου διατροφή; Ανέβασέ το εδώ για να το έχεις
                πάντα δίπλα στην άσκησή σου!
              </p>
            </div>
          </div>

          {dietStatus && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{dietStatus}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/15 transition active:scale-95">
              <FileUp className="h-4 w-4" />
              Ανέβασμα Διατροφής (PDF / TXT)
              <input
                ref={dietFileInputRef}
                type="file"
                accept="application/pdf,.pdf,.txt,.md"
                onChange={handleDietFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleLoadSampleDiet}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-xs font-bold text-zinc-100 hover:bg-zinc-700"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              Έτοιμο Πλάνο Χωρίς Πείνα
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <button
              type="button"
              onClick={() => setShowPasteDiet((prev) => !prev)}
              className="underline hover:text-zinc-200"
            >
              {showPasteDiet ? 'Κλείσιμο επικόλλησης' : 'Ή γράψε / επικόλλησε τα γεύματά σου εδώ'}
            </button>

            {dietPlan && (
              <button
                type="button"
                onClick={() => {
                  onSaveDietPlan(null);
                  setDietStatus(null);
                }}
                className="inline-flex items-center gap-1 text-zinc-400 hover:text-amber-400"
              >
                <Trash2 className="h-3 w-3" />
                Καθαρισμός
              </button>
            )}
          </div>

          {showPasteDiet && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <textarea
                rows={4}
                value={pastedDietText}
                onChange={(e) => setPastedDietText(e.target.value)}
                placeholder={
                  'π.χ.\nΠρωινό: Γιαούρτι με βρώμη\nΜεσημεριανό: Κοτόπουλο με σαλάτα\nΑπογευματινό: 1 μπανάνα\nΒραδινό: Ομελέτα με 2 αυγά'
                }
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePasteDietSubmit}
                className="w-full rounded-lg bg-emerald-500 py-2 text-xs font-bold text-zinc-950"
              >
                Αποθήκευση Γευμάτων
              </button>
            </div>
          )}

          {dietPlan ? (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-400">
                  Ενεργό Πλάνο: {dietPlan.fileName}
                </span>
                <span className="text-[10px] text-zinc-500">{dietPlan.uploadedAt}</span>
              </div>

              <div className="space-y-2 pt-1">
                {dietPlan.meals.map((meal, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-zinc-800/90 bg-zinc-900/90 p-2.5 text-xs"
                  >
                    <div className="font-bold text-emerald-400">{meal.slotLabelGreek}</div>
                    <div className="mt-0.5 text-zinc-100">{meal.descriptionGreek}</div>
                    <div className="mt-1 text-[10px] text-zinc-400">
                      ⚡ {meal.movementSynergyGreek}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-center text-xs text-zinc-400">
              Δεν έχεις ανεβάσει ακόμα διατροφή. Ανέβασε το PDF/αρχείο του διατροφολόγου σου ή
              πάτησε <strong>«Έτοιμο Πλάνο Χωρίς Πείνα»</strong> για να δεις πώς συνδυάζεται το
              φαγητό με την κίνηση!
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
