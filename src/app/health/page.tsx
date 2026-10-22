'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Droplets,
  FileText,
  FileUp,
  HeartPulse,
  Moon,
  Save,
  ShieldAlert,
  Sparkles,
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
import {
  createSampleGreekLabPdfBlob,
  extractBiomarkersFromFile,
  parseBiomarkersFromText,
  PdfExtractionResult,
} from '@/lib/parser/pdfBiomarkerExtractor';

export default function HealthBiomarkersHub() {
  const [biometrics, setBiometrics] = useState<DailyBiometrics>(DEFAULT_BIOMETRICS);
  const [biomarkers, setBiomarkers] = useState<BiomarkerProfile>(DEFAULT_BIOMARKERS);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<PdfExtractionResult | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
  const [pastedLabText, setPastedLabText] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getKinesisSnapshot().then((snap) => {
      setBiometrics(snap.biometrics);
      setBiomarkers(snap.biomarkers);
    });
  }, []);

  const applyExtractionToProfile = async (result: PdfExtractionResult) => {
    setPdfResult(result);
    if (result.detectedItems.length === 0 && result.extraFindingsGreek.length === 0) {
      setPdfError(
        'Δεν εντοπίστηκαν αναγνωρίσιμες τιμές αιματολογικών στο αρχείο. Αν το PDF είναι σκαναρισμένη εικόνα (χωρίς επιλέξιμο κείμενο), δοκίμασε την επικόλληση κειμένου ή συμπλήρωσε τα πεδία.'
      );
      return;
    }

    setPdfError(null);
    const mergedRestrictions =
      result.extraFindingsGreek.length > 0
        ? [biomarkers.medicalRestrictions, ...result.extraFindingsGreek]
            .filter(Boolean)
            .join(' • ')
        : biomarkers.medicalRestrictions;

    const nextBiomarkers: BiomarkerProfile = {
      ...biomarkers,
      ...result.updatedProfile,
      medicalRestrictions: mergedRestrictions,
    };

    setBiomarkers(nextBiomarkers);
    await saveBiomarkers(nextBiomarkers);
    setSavedNotice(
      `Αναγνώστηκαν αυτόματα ${result.detectedItems.length} βασικοί δείκτες από το «${result.fileName}» και αποθηκεύτηκαν στη συσκευή σου!`
    );
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingPdf(true);
    setPdfError(null);
    try {
      const result = await extractBiomarkersFromFile(file);
      await applyExtractionToProfile(result);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'Σφάλμα κατά την ανάγνωση του αρχείου PDF.'
      );
    } finally {
      setIsParsingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleTestSamplePdf = async () => {
    setIsParsingPdf(true);
    setPdfError(null);
    try {
      const blob = createSampleGreekLabPdfBlob();
      const sampleFile = new File([blob], 'Μικροβιολογικό_Εργαστήριο_Δείγμα.pdf', {
        type: 'application/pdf',
      });
      const result = await extractBiomarkersFromFile(sampleFile);
      await applyExtractionToProfile(result);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Σφάλμα δοκιμής PDF.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleDownloadSamplePdf = () => {
    const blob = createSampleGreekLabPdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'KINESIS_Sample_Lab_Results.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleParsePastedText = async () => {
    if (!pastedLabText.trim()) return;
    const result = parseBiomarkersFromText(pastedLabText, 'Επικολλημένο_Κείμενο_Εξετάσεων');
    await applyExtractionToProfile(result);
    setPastedLabText('');
    setShowPasteBox(false);
  };

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

      {/* NEW: PDF LAB REPORT SMART EXTRACTOR (100% Local-First) */}
      <section
        aria-label="Αυτόματη Ανάγνωση PDF Μικροβιολογικού"
        className="space-y-3.5 rounded-2xl border border-emerald-500/35 bg-zinc-900 p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3 w-3" />
              100% Τοπική Ανάλυση στη Συσκευή
            </span>
            <h2 className="mt-1.5 text-sm font-bold text-zinc-100">
              Αυτόματη Ανάγνωση Αιματολογικών από PDF
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Ανέβασε το PDF του διαγνωστικού κέντρου ή του myHealth. Το σύστημα εντοπίζει και
              κρατάει αυτόματα Φερριτίνη, Αιμοσφαιρίνη, Βιταμίνη D, B12, CRP, Γλυκόζη, HCT & CPK
              χωρίς να στείλει τίποτα στο internet.
            </p>
          </div>
          <FileText className="h-6 w-6 shrink-0 text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]">
            <FileUp className="h-4 w-4" />
            {isParsingPdf ? 'Ανάλυση PDF...' : 'Ανέβασμα PDF Εξετάσεων'}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf,.txt"
              onChange={handlePdfUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleTestSamplePdf}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Δοκιμή με Ενδεικτικό PDF
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <button
            type="button"
            onClick={() => setShowPasteBox((p) => !p)}
            className="underline decoration-zinc-600 hover:text-zinc-200"
          >
            {showPasteBox ? 'Κλείσιμο επικόλλησης κειμένου' : 'Ή επικόλλησε κείμενο εξετάσεων'}
          </button>

          <button
            type="button"
            onClick={handleDownloadSamplePdf}
            className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
          >
            <Download className="h-3 w-3" />
            Λήψη δείγματος PDF
          </button>
        </div>

        {showPasteBox && (
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <textarea
              rows={3}
              value={pastedLabText}
              onChange={(e) => setPastedLabText(e.target.value)}
              placeholder="π.χ. Φερριτίνη: 22.4 ng/mL, Αιμοσφαιρίνη: 13.8 g/dL, Βιταμίνη D: 24 ng/mL, CRP: 1.2 mg/L..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleParsePastedText}
              className="w-full rounded-lg bg-emerald-500/20 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
            >
              Εξαγωγή Τιμών από Κείμενο
            </button>
          </div>
        )}

        {pdfError && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>{pdfError}</span>
          </div>
        )}

        {pdfResult && pdfResult.detectedItems.length > 0 && (
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-zinc-950 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
              <span>Στοιχεία που κρατήθηκαν από: {pdfResult.fileName}</span>
              <span>{pdfResult.detectedItems.length} δείκτες</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {pdfResult.detectedItems.map((item) => (
                <div
                  key={item.key}
                  className={`rounded-lg border p-2 text-xs ${
                    item.status === 'warning'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                  }`}
                >
                  <div className="text-[10px] text-zinc-400">{item.labelGreek}</div>
                  <div className="mt-0.5 font-bold">
                    {item.value} {item.unit}{' '}
                    {item.status === 'warning' && (
                      <span className="text-[10px] font-semibold text-amber-400">• Κόφτης</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {pdfResult.extraFindingsGreek.length > 0 && (
              <div className="border-t border-zinc-800 pt-2 text-[11px] text-zinc-300">
                <strong className="text-emerald-400">Επιπλέον ευρήματα PDF: </strong>
                {pdfResult.extraFindingsGreek.join(' • ')}
              </div>
            )}
          </div>
        )}
      </section>

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
            <span className="mt-0.5 block text-[10px] text-zinc-500">Safety Gate αν &lt; 60</span>
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
            <span className="mt-0.5 block text-[10px] text-zinc-500">Μεταβλητότητα Καρδιάς</span>
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
            <span className="mt-0.5 block text-[10px] text-zinc-500">Μέσος όρος 30 ημερών</span>
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
            Ιατρικοί Περιορισμοί / Ευαισθησίες Τενόντων & Επιπλέον Δείκτες
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
