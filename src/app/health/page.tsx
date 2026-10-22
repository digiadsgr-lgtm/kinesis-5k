'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Droplets,
  HeartPulse,
  Moon,
  Save,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { BiomarkerProfile, DailyBiometrics } from '@/types/kinesis';
import {
  DEFAULT_BIOMARKERS,
  DEFAULT_BIOMETRICS,
  getKinesisSnapshot,
  saveBiomarkers,
  saveBiometrics,
} from '@/lib/storage/db';

export default function HealthBiomarkersHub() {
  const [biometrics, setBiometrics] = useState<DailyBiometrics>(DEFAULT_BIOMETRICS);
  const [biomarkers, setBiomarkers] = useState<BiomarkerProfile>(DEFAULT_BIOMARKERS);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    getKinesisSnapshot().then((snap) => {
      setBiometrics(snap.biometrics);
      setBiomarkers(snap.biomarkers);
    });
  }, []);

  const handleSaveBiometrics = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveBiometrics(biometrics);
    setSavedNotice('Τα ημερήσια βιομετρικά αποθηκεύτηκαν και ενημέρωσαν το Safety Gate.');
  };

  const handleSaveBiomarkers = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveBiomarkers(biomarkers);
    setSavedNotice('Οι αιματολογικοί δείκτες αποθηκεύτηκαν τοπικά στη συσκευή σου.');
  };

  const parseNullableNumber = (val: string): number | null => {
    if (val.trim() === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const rhrElevated = biometrics.rhr > biometrics.baselineRhr + 5;
  const sleepLow = biometrics.sleepScore < 60;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <HeartPulse className="h-5 w-5" />
          <h1 className="text-lg font-bold text-zinc-50">Κέντρο Βιομετρικών & Αιματολογικών</h1>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Οι δείκτες αποκατάστασης και αίματος λειτουργούν ως αυτόματος «κόφτης ασφαλείας» στην
          ένταση.
        </p>
      </header>

      {/* Medical Disclaimer */}
      <section
        aria-label="Ιατρική Αποποίηση Ευθύνης"
        className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
          <Stethoscope className="h-4 w-4 shrink-0" />
          <span>Ιατρική Σημείωση & Αποποίηση Ευθύνης</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-amber-200/90">
          Το KINESIS δεν παρέχει ιατρική διάγνωση ούτε αντικαθιστά τον ιατρό σου. Οι βιοδείκτες
          χρησιμοποιούνται αποκλειστικά για την αυτόματη μείωση του προπονητικού φορτίου όταν ο
          οργανισμός εμφανίζει χαμηλή αποκατάσταση, χαμηλό σίδηρο ή ενδείξεις φλεγμονής.
        </p>
      </section>

      {savedNotice && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Daily Smartwatch Biometrics */}
      <form
        onSubmit={handleSaveBiometrics}
        className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-zinc-100">Ημερήσια Βιομετρικά (Smartwatch)</h2>
          </div>
          {(rhrElevated || sleepLow) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
              <ShieldAlert className="h-3 w-3" />
              Zone 1 Cap Ενεργό
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400">Σκορ Ύπνου (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={biometrics.sleepScore}
              onChange={(e) =>
                setBiometrics({ ...biometrics, sleepScore: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">
              Safety Gate αν &lt; 60
            </span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">HRV (ms)</label>
            <input
              type="number"
              min={10}
              max={200}
              value={biometrics.hrv}
              onChange={(e) => setBiometrics({ ...biometrics, hrv: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">
              Μεταβλητότητα Καρδιάς
            </span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Σημερινό RHR (bpm)</label>
            <input
              type="number"
              min={35}
              max={120}
              value={biometrics.rhr}
              onChange={(e) => setBiometrics({ ...biometrics, rhr: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">
              Safety Gate αν &gt; Βάση + 5
            </span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Βάση RHR (bpm)</label>
            <input
              type="number"
              min={35}
              max={120}
              value={biometrics.baselineRhr}
              onChange={(e) =>
                setBiometrics({ ...biometrics, baselineRhr: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">
              Μέσος όρος 30 ημερών
            </span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Βήματα Σήμερα</label>
            <input
              type="number"
              min={0}
              max={50000}
              value={biometrics.stepsSoFar}
              onChange={(e) =>
                setBiometrics({ ...biometrics, stepsSoFar: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Βάρος (kg)</label>
            <input
              type="number"
              step="0.1"
              min={35}
              max={250}
              value={biometrics.weight}
              onChange={(e) => setBiometrics({ ...biometrics, weight: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
        >
          <Save className="h-4 w-4" />
          Αποθήκευση Βιομετρικών Ημέρας
        </button>
      </form>

      {/* Blood Biomarkers Form */}
      <form
        onSubmit={handleSaveBiomarkers}
        className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-zinc-100">
            Αιματολογικοί Δείκτες (Biomarker Dampeners)
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400">Φερριτίνη (ng/mL)</label>
            <input
              type="number"
              step="0.1"
              value={biomarkers.ferritin ?? ''}
              onChange={(e) =>
                setBiomarkers({ ...biomarkers, ferritin: parseNullableNumber(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">Κόφτης αν &lt; 30</span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Αιμοσφαιρίνη (g/dL)</label>
            <input
              type="number"
              step="0.1"
              value={biomarkers.hemoglobin ?? ''}
              onChange={(e) =>
                setBiomarkers({ ...biomarkers, hemoglobin: parseNullableNumber(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">Κόφτης αν &lt; 12.5</span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Βιταμίνη D (ng/mL)</label>
            <input
              type="number"
              step="0.1"
              value={biomarkers.vitaminD ?? ''}
              onChange={(e) =>
                setBiomarkers({ ...biomarkers, vitaminD: parseNullableNumber(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">Ειδοποίηση αν &lt; 25</span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Βιταμίνη B12 (pg/mL)</label>
            <input
              type="number"
              step="1"
              value={biomarkers.vitaminB12 ?? ''}
              onChange={(e) =>
                setBiomarkers({ ...biomarkers, vitaminB12: parseNullableNumber(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">Ειδοποίηση αν &lt; 250</span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">CRP Φλεγμονή (mg/L)</label>
            <input
              type="number"
              step="0.1"
              value={biomarkers.crp ?? ''}
              onChange={(e) =>
                setBiomarkers({ ...biomarkers, crp: parseNullableNumber(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-0.5 block text-[10px] text-zinc-500">Κόφτης αν &gt; 3.0</span>
          </div>

          <div>
            <label className="block text-xs text-zinc-400">Γλυκόζη Νηστείας (mg/dL)</label>
            <input
              type="number"
              step="1"
              value={biomarkers.fastingGlucose ?? ''}
              onChange={(e) =>
                setBiomarkers({
                  ...biomarkers,
                  fastingGlucose: parseNullableNumber(e.target.value),
                })
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400">
            Ιατρικοί Περιορισμοί / Ευαισθησίες Τενόντων
          </label>
          <input
            type="text"
            value={biomarkers.medicalRestrictions}
            onChange={(e) =>
              setBiomarkers({ ...biomarkers, medicalRestrictions: e.target.value })
            }
            placeholder="π.χ. Ιστορικό τενοντίτιδας Αχιλλείου, ευαισθησία μέσης..."
            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.99]"
        >
          <Activity className="h-4 w-4" />
          Ενημέρωση Προφίλ Αιματολογικών
        </button>
      </form>
    </div>
  );
}
