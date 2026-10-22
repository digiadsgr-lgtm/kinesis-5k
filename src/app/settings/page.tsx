'use client';

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  RotateCcw,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  exportDatabaseJson,
  importDatabaseJson,
  resetAllData,
  seedDemoData,
} from '@/lib/storage/db';

export default function SettingsAndBackupPage() {
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [rawJsonInput, setRawJsonInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportJson = async () => {
    try {
      const jsonStr = await exportDatabaseJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kinesis-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage({
        type: 'success',
        text: 'Το αντίγραφο ασφαλείας JSON εξήχθη με επιτυχία.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Σφάλμα κατά την εξαγωγή JSON.',
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importDatabaseJson(text);
      setStatusMessage({
        type: 'success',
        text: 'Η εισαγωγή και επικύρωση του αρχείου JSON ολοκληρώθηκε επιτυχώς!',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Σφάλμα επικύρωσης σχήματος κατά την εισαγωγή JSON.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteImport = async () => {
    if (!rawJsonInput.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Επικόλλησε πρώτα το περιεχόμενο JSON στο πεδίο κειμένου.',
      });
      return;
    }
    try {
      await importDatabaseJson(rawJsonInput);
      setRawJsonInput('');
      setStatusMessage({
        type: 'success',
        text: 'Τα δεδομένα JSON επικυρώθηκαν και αποκαταστάθηκαν επιτυχώς.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Μη έγκυρο σχήμα JSON.',
      });
    }
  };

  const handleSeedDemo = async () => {
    await seedDemoData();
    setStatusMessage({
      type: 'success',
      text: 'Φορτώθηκαν ρεαλιστικά δεδομένα επίδειξης (Stage 2, βιομετρικά, φερριτίνη, ιστορικό & απορρίψεις).',
    });
  };

  const handleReset = async () => {
    await resetAllData();
    setStatusMessage({
      type: 'success',
      text: 'Έγινε πλήρης επαναφορά της βάσης στο Stage 0 (Σπάσιμο Αδράνειας).',
    });
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Settings className="h-5 w-5" />
          <h1 className="text-lg font-bold text-zinc-50">Ρυθμίσεις & Τοπικά Δεδομένα (Local-First)</h1>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Όλα τα δεδομένα σου αποθηκεύονται αποκλειστικά στη συσκευή σου (IndexedDB). Κανένα cloud,
          πλήρης ιδιωτικότητα.
        </p>
      </header>

      {statusMessage && (
        <div
          className={`flex items-start gap-2.5 rounded-2xl border p-4 text-xs font-medium ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Demo Seed Card */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-2 text-emerald-400">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-bold text-zinc-100">Δεδομένα Επίδειξης (Demo Προφίλ)</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Φόρτωσε με 1 κλικ ένα ρεαλιστικό σενάριο εργαζόμενου γραφείου στο Stage 2, με χαμηλή
          φερριτίνη (26 ng/mL), ιστορικό συνεδριών και μνήμη απορρίψεων.
        </p>
        <button
          type="button"
          onClick={handleSeedDemo}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
        >
          <Database className="h-4 w-4" />
          Φόρτωση Ρεαλιστικών Demo Δεδομένων
        </button>
      </section>

      {/* JSON Backup Export / Import */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-bold text-zinc-100">
          1-Click Αντίγραφο Ασφαλείας (JSON Export / Import)
        </h2>
        <p className="text-xs text-zinc-400">
          Εξαγωγή όλης της βάσης σε αρχείο JSON ή επαναφορά με αυστηρό έλεγχο εγκυρότητας σχήματος
          (Schema Validation).
        </p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
          >
            <Download className="h-4 w-4" />
            Εξαγωγή JSON Backup
          </button>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-xs font-bold text-zinc-200 hover:bg-zinc-700">
            <Upload className="h-4 w-4 text-emerald-400" />
            Εισαγωγή από Αρχείο JSON
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        <div className="pt-2">
          <label className="block text-xs text-zinc-400">
            Ή επικόλλησε απευθείας JSON Backup εδώ:
          </label>
          <textarea
            rows={4}
            value={rawJsonInput}
            onChange={(e) => setRawJsonInput(e.target.value)}
            placeholder='{"schemaVersion": "1.1.0", "progression": ...}'
            className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handlePasteImport}
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/80 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Επικύρωση & Εισαγωγή Κειμένου JSON
          </button>
        </div>
      </section>

      {/* Danger Zone: Reset */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-sm font-bold text-zinc-200">Μηδενισμός & Νέα Αρχή</h2>
        <p className="text-xs text-zinc-400">
          Διαγράφει τις τοπικές εγγραφές και επαναφέρει το προφίλ στο Stage 0 χωρίς καμία ποινή.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 py-3 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
        >
          <RotateCcw className="h-4 w-4" />
          Επαναφορά στο Stage 0 (Reset)
        </button>
      </section>
    </div>
  );
}
