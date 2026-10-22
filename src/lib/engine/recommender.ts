import {
  AlternativePrescription,
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  EnvironmentType,
  ModalityType,
  RecommendationOutput,
  RejectionEvent,
  RejectionReason,
  StageId,
  STAGES,
  MODALITY_LABELS_GREEK,
  UserProgressionState,
} from '@/types/kinesis';

export const ENVIRONMENT_FRICTION_MAP: Record<EnvironmentType, number> = {
  outdoor: 0, // 0% friction — ready to move outdoors
  home_gear: 35, // 35% friction — comfortable gear at home
  indoor_clothes: 75, // 75% friction — work clothes / sitting at desk
};

export interface RejectionHistoryItem {
  modality: ModalityType;
  reason: RejectionReason;
  timestamp?: string;
}

/**
 * Calculates Movement Opportunity Score (MOS) on a 0-100 scale.
 * Formula components:
 * - Mood (max 35): (mood / 5) * 35
 * - Energy (max 25): (energy / 5) * 25
 * - Time Window (max 20): (min(timeWindowMins, 30) / 30) * 20
 * - Environment Readiness (max 20): ((100 - envFriction) / 100) * 20
 */
export function calculateMOS(checkIn: CheckInInput): number {
  const moodClamped = Math.max(1, Math.min(5, checkIn.mood));
  const energyClamped = Math.max(1, Math.min(5, checkIn.energy));
  const timeClamped = Math.max(0, Math.min(30, checkIn.timeWindowMins));
  const envFriction = ENVIRONMENT_FRICTION_MAP[checkIn.environment] ?? 50;

  const moodTerm = (moodClamped / 5) * 35;
  const energyTerm = (energyClamped / 5) * 25;
  const timeTerm = (timeClamped / 30) * 20;
  const envTerm = ((100 - envFriction) / 100) * 20;

  return Math.round(moodTerm + energyTerm + timeTerm + envTerm);
}

interface CandidateModality {
  modality: ModalityType;
  score: number;
  impactLevel: 'zero' | 'low' | 'moderate' | 'high';
}

const MODALITY_IMPACT: Record<ModalityType, 'zero' | 'low' | 'moderate' | 'high'> = {
  mobility: 'zero',
  walk: 'low',
  treadmill: 'low',
  strength: 'low',
  stairs: 'moderate',
  walk_run: 'moderate',
  run: 'high',
};

const PENALTY_BY_REASON: Record<RejectionReason, number> = {
  boredom: 45,
  pain_fatigue: 65,
  environment_lock: 50,
  lack_of_time: 30,
};

function evaluateBiomarkerAlerts(biomarkers: BiomarkerProfile): {
  alerts: string[];
  dampenIntensity: boolean;
} {
  const alerts: string[] = [];
  let dampenIntensity = false;

  if (biomarkers.ferritin !== null && biomarkers.ferritin < 30) {
    alerts.push(
      `Χαμηλή Φερριτίνη (${biomarkers.ferritin} ng/mL): Μειωμένη ικανότητα μεταφοράς οξυγόνου. Ο αλγόριθμος περιορίζει την υψηλή ένταση για αποφυγή υπερκόπωσης.`
    );
    dampenIntensity = true;
  }

  if (biomarkers.hemoglobin !== null && biomarkers.hemoglobin < 12.5) {
    alerts.push(
      `Χαμηλή Αιμοσφαιρίνη (${biomarkers.hemoglobin} g/dL): Προστατευτικός κόφτης αερόβιας έντασης (έμφαση σε Zone 1-2).`
    );
    dampenIntensity = true;
  }

  if (biomarkers.crp !== null && biomarkers.crp > 3.0) {
    alerts.push(
      `Αυξημένη CRP (${biomarkers.crp} mg/L): Ένδειξη συστηματικής φλεγμονής. Αποφεύγονται οι κραδασμοί στους τένοντες σήμερα.`
    );
    dampenIntensity = true;
  }

  if (biomarkers.vitaminD !== null && biomarkers.vitaminD < 25) {
    alerts.push(
      `Χαμηλή Βιταμίνη D (${biomarkers.vitaminD} ng/mL): Προσοχή στη βαθμιαία φόρτιση οστών και τενόντων.`
    );
  }

  if (biomarkers.vitaminB12 !== null && biomarkers.vitaminB12 < 250) {
    alerts.push(
      `Οριακή Βιταμίνη B12 (${biomarkers.vitaminB12} pg/mL): Ενδέχεται να αυξάνει την αντιληπτή νευρομυϊκή κόπωση.`
    );
  }

  if (biomarkers.fastingGlucose !== null && biomarkers.fastingGlucose > 105) {
    alerts.push(
      `Γλυκόζη Νηστείας (${biomarkers.fastingGlucose} mg/dL): Το σταθερό περπάτημα μετά το γεύμα βελτιστοποιεί άμεσα την ευαισθησία στην ινσουλίνη.`
    );
  }

  if (biomarkers.medicalRestrictions && biomarkers.medicalRestrictions.trim().length > 0) {
    alerts.push(`Ιατρική Σημείωση: ${biomarkers.medicalRestrictions.trim()}`);
  }

  return { alerts, dampenIntensity };
}

function buildPrescriptionDetails(
  modality: ModalityType,
  stage: StageId,
  durationMins: number,
  zone1Cap: boolean,
  zeroFriction: boolean
): {
  title: string;
  intensityLabel: string;
  habitPointsAward: number;
  structuralPointsAward: number;
} {
  if (zeroFriction) {
    const microDuration = Math.max(2, Math.min(5, durationMins));
    const microTitles: Record<ModalityType, string> = {
      mobility: `${microDuration}' Αποσυμπίεση Σπονδυλικής Στήλης & Ισχίων`,
      walk: `${microDuration}' Μικρο-Περπάτημα Αφύπνισης (Χωρίς Αλλαγή Ρούχων)`,
      stairs: `${microDuration}' Ήπια Ανάβαση 2 Ορόφων`,
      strength: `${microDuration}' Ισομετρική Ενεργοποίηση Γαστροκνημίου`,
      treadmill: `${microDuration}' Χαλαρό Ξεκίνημα στον Διάδρομο`,
      walk_run: `${microDuration}' Ρυθμικό Περπάτημα Αποφόρτισης`,
      run: `${microDuration}' Ελεύθερο Περπάτημα Έξοδος από το Σπίτι`,
    };
    return {
      title: microTitles[modality],
      intensityLabel: 'Zero-Friction • Ελάχιστη Τριβή',
      habitPointsAward: 15, // Full habit reward for overcoming high initiation friction
      structuralPointsAward: modality === 'mobility' ? 2 : 4,
    };
  }

  if (zone1Cap) {
    const z1Titles: Record<ModalityType, string> = {
      mobility: `${durationMins}' Πρωτόκολλο Κινητικότητας & Αποσυμπίεσης`,
      walk: `${durationMins}' Αερόβιο Περπάτημα Αποκατάστασης (Zone 1)`,
      treadmill: `${durationMins}' Ήπια Ροή σε Διάδρομο (Zone 1)`,
      strength: `${durationMins}' Ήπια Ενδυνάμωση Τενόντων & Ισορροπίας`,
      stairs: `${durationMins}' Αργή Ρυθμική Ανάβαση Σκάλας (Zone 1)`,
      walk_run: `${durationMins}' Περπάτημα Μεταβολικής Βάσης (Zone 1 Cap)`,
      run: `${durationMins}' Πολύ Χαλαρό Τρέξιμο Αναπνοής από τη Μύτη (Zone 1)`,
    };
    return {
      title: z1Titles[modality],
      intensityLabel: 'Zone 1 • Ελεγχόμενη Ένταση Ασφαλείας',
      habitPointsAward: 12,
      structuralPointsAward: modality === 'mobility' ? 3 : 6,
    };
  }

  switch (modality) {
    case 'mobility':
      return {
        title: `${durationMins}' Ενεργητική Αποσυμπίεση Ισχίων, Θώρακα & Ποδοκνημικής`,
        intensityLabel: 'Αποκατάσταση • Μηδενικός Κραδασμός',
        habitPointsAward: 12,
        structuralPointsAward: 4,
      };
    case 'walk':
      return {
        title: `${durationMins}' Ζωηρό Ρυθμικό Περπάτημα (${stage >= 1 ? 'Zone 2' : 'Αφύπνιση'})`,
        intensityLabel: stage >= 1 ? 'Zone 2 • Αερόβια Βάση' : 'Zone 1-2 • Σπάσιμο Αδράνειας',
        habitPointsAward: 12,
        structuralPointsAward: Math.round(durationMins * 0.45),
      };
    case 'stairs':
      return {
        title: `${durationMins}' Ελεγχόμενη Ανάβαση Σκάλας (Καρδιοαναπνευστικό Stimulus)`,
        intensityLabel: 'Zone 2 • Μηδενικός Κραδασμός Προσγείωσης',
        habitPointsAward: 14,
        structuralPointsAward: Math.round(durationMins * 0.65),
      };
    case 'treadmill':
      return {
        title: `${durationMins}' Διάδρομος με Ελαφριά Κλίση 1.5%`,
        intensityLabel: stage >= 2 ? 'Zone 2 • Ελεγχόμενη Μηχανική' : 'Zone 1-2 • Σταθερός Ρυθμός',
        habitPointsAward: 12,
        structuralPointsAward: Math.round(durationMins * 0.6),
      };
    case 'strength':
      return {
        title: `${durationMins}' Θωράκιση Αχιλλείου, Γονάτων & Κορμού (Χωρίς Εξοπλισμό)`,
        intensityLabel: 'Δομική Ανοχή • Προστασία Αρθρώσεων',
        habitPointsAward: 14,
        structuralPointsAward: Math.round(durationMins * 0.7),
      };
    case 'walk_run': {
      const runRatio = stage <= 2 ? '1 λεπτό τρέξιμο / 2 λεπτά περπάτημα' : '3 λεπτά τρέξιμο / 1 λεπτό περπάτημα';
      return {
        title: `${durationMins}' Εναλλαγές (${runRatio})`,
        intensityLabel: 'Zone 2 • Προοδευτική Φόρτιση Τενόντων',
        habitPointsAward: 15,
        structuralPointsAward: Math.round(durationMins * 0.85),
      };
    }
    case 'run': {
      const runType =
        stage === 5
          ? 'Ρυθμός Αγωνιστικής Οικονομίας 5K'
          : stage === 4
          ? 'Συνεχόμενη Αερόβια Ροή 5K'
          : 'Συνεχόμενο Άνετο Τρέξιμο (Conversational Pace)';
      return {
        title: `${durationMins}' ${runType}`,
        intensityLabel: stage === 5 ? 'Zone 2-3 • 5K Εξειδίκευση' : 'Zone 2 • Δρομική Οικονομία',
        habitPointsAward: 15,
        structuralPointsAward: Math.round(durationMins * 1.0),
      };
    }
  }
}

/**
 * Pure, deterministic state-driven evaluation pipeline for KINESIS: Sit to 5K.
 */
export function calculateRecommendation(
  checkIn: CheckInInput,
  stage: StageId,
  biometrics: DailyBiometrics,
  biomarkers: BiomarkerProfile,
  rejectionHistory: Array<RejectionEvent | RejectionHistoryItem> = []
): RecommendationOutput {
  const safetyAlertsGreek: string[] = [];
  const mosScore = calculateMOS(checkIn);
  const biomarkerEval = evaluateBiomarkerAlerts(biomarkers);
  safetyAlertsGreek.push(...biomarkerEval.alerts);

  // =========================================================================
  // PIPELINE 1: SAFETY GATE (Executes First — Hard Priority Over Everything)
  // =========================================================================
  const highPain = checkIn.painLevel >= 4;
  const poorSleep = biometrics.sleepScore < 60;
  const elevatedRhr = biometrics.rhr > biometrics.baselineRhr + 5;

  if (highPain) {
    const locationText = checkIn.painLocation?.trim()
      ? ` στην περιοχή «${checkIn.painLocation.trim()}»`
      : '';
    safetyAlertsGreek.unshift(
      `Safety Gate Ενεργό: Καταγράφηκε πόνος ${checkIn.painLevel}/10${locationText}. Οι κραδασμοί κλειδώθηκαν στο μηδέν για προστασία των ιστών.`
    );

    const safeDuration = Math.max(5, Math.min(15, checkIn.timeWindowMins || 10));
    return {
      id: `rec-safety-pain-${stage}-${safeDuration}`,
      title: `${safeDuration}' Πρωτόκολλο Αποσυμπίεσης & Ήπιας Κινητικότητας (Zero Impact)`,
      modality: 'mobility',
      durationMins: safeDuration,
      intensityLabel: 'Safety Gate • Μηδενικός Κραδασμός',
      reasoningGreek: `Επειδή ανέφερες πόνο (${checkIn.painLevel}/10${locationText}), το Σύστημα Ασφαλείας παρακάμπτει κάθε δρομικό φορτίο. Σήμερα προστατεύουμε τους τένοντες με ήπια αιμάτωση χωρίς κραδασμούς, διατηρώντας ζωντανή τη συνήθεια.`,
      safetyAlertsGreek,
      mosScore,
      habitPointsAward: 15,
      structuralPointsAward: 3,
      safetyGateTriggered: true,
      zeroFrictionTriggered: false,
      boredAlternative: {
        id: `alt-safety-breath-${safeDuration}`,
        title: `${safeDuration}' Διαφραγματική Αναπνοή & Ήπιες Διατάσεις Αυχένα/Ώμων`,
        modality: 'mobility',
        durationMins: safeDuration,
        intensityLabel: 'Safety Gate • Νευρομυϊκή Χαλάρωση',
        reasoningGreek:
          'Εναλλακτική αποφόρτιση μηδενικού κραδασμού ώστε να μην επιβαρυνθεί καθόλου το σημείο ενόχλησης.',
        habitPointsAward: 15,
        structuralPointsAward: 2,
      },
      hardDowngrade: {
        id: `down-safety-micro`,
        title: `3' Ήπια Αποσυμπίεση Σπονδυλικής Στήλης δίπλα στην καρέκλα`,
        modality: 'mobility',
        durationMins: 3,
        intensityLabel: 'Micro-Recovery • 3 Λεπτά',
        reasoningGreek:
          'Το ελάχιστο ασφαλές βήμα αποκατάστασης: 3 λεπτά ήπιας κίνησης χωρίς καμία πίεση.',
        habitPointsAward: 14,
        structuralPointsAward: 2,
      },
    };
  }

  let zone1Cap = false;
  if (poorSleep || elevatedRhr || biomarkerEval.dampenIntensity) {
    zone1Cap = true;
    if (poorSleep) {
      safetyAlertsGreek.unshift(
        `Safety Gate (Ύπνος ${biometrics.sleepScore}/100 < 60): Το αυτόνομο νευρικό σύστημα είναι κουρασμένο. Η ένταση περιορίζεται αυστηρά σε Zone 1.`
      );
    }
    if (elevatedRhr) {
      safetyAlertsGreek.unshift(
        `Safety Gate (RHR ${biometrics.rhr} bpm έναντι βάσης ${biometrics.baselineRhr} bpm): Αυξημένοι παλμοί ηρεμίας (+${
          biometrics.rhr - biometrics.baselineRhr
        } bpm). Κόφτης έντασης σε Zone 1.`
      );
    }
  }

  // =========================================================================
  // PIPELINE 2: MOVEMENT OPPORTUNITY SCORE (MOS < 40 -> Zero-Friction Protocol)
  // =========================================================================
  const zeroFrictionTriggered = mosScore < 40;

  // =========================================================================
  // PIPELINE 3: BEHAVIORAL MEMORY & REJECTION TAXONOMY RANKING
  // =========================================================================
  const stageDef = STAGES[stage];
  const candidatePool: ModalityType[] = [...stageDef.allowedModalities];

  // Ensure mobility and walk are always available as safe fallbacks
  if (!candidatePool.includes('mobility')) candidatePool.push('mobility');
  if (!candidatePool.includes('walk')) candidatePool.push('walk');

  const recentRejections = rejectionHistory.slice(-10);

  const scoredCandidates: CandidateModality[] = candidatePool.map((modality) => {
    let score = 100;
    const impact = MODALITY_IMPACT[modality];

    // Stage-appropriate primary preference
    if (stage === 0 && (modality === 'mobility' || modality === 'walk')) score += 20;
    if (stage === 1 && (modality === 'walk' || modality === 'stairs')) score += 20;
    if (stage === 2 && modality === 'walk_run') score += 25;
    if (stage >= 3 && modality === 'run') score += 30;

    // Zone 1 cap (from sleep < 60, elevated RHR, or biomarker dampener) blocks high impact
    if (zone1Cap) {
      if (impact === 'high') score -= 90;
      if (impact === 'moderate') score -= 50;
      if (modality === 'walk' || modality === 'mobility') score += 25;
    }

    // Zero-friction mode prefers zero-prep modalities
    if (zeroFrictionTriggered) {
      if (modality === 'mobility' || modality === 'walk' || modality === 'stairs') {
        score += 30;
      } else {
        score -= 45;
      }
    }

    // Environment friction adjustments
    if (checkIn.environment === 'indoor_clothes') {
      if (modality === 'mobility' || modality === 'stairs') score += 25;
      if (modality === 'walk') score += 10;
      if (modality === 'run' || modality === 'walk_run') score -= 50;
    } else if (checkIn.environment === 'home_gear') {
      if (modality === 'treadmill' || modality === 'strength' || modality === 'mobility') {
        score += 20;
      }
    } else if (checkIn.environment === 'outdoor') {
      if (modality === 'run' || modality === 'walk_run' || modality === 'walk') {
        score += 25;
      }
    }

    // Apply rejection taxonomy penalties from behavioral memory
    for (const rej of recentRejections) {
      if (rej.modality === modality) {
        score -= PENALTY_BY_REASON[rej.reason] ?? 35;
      }
      // Cross-modality adaptations based on specific rejection reason
      if (rej.reason === 'environment_lock' && (modality === 'run' || modality === 'walk_run')) {
        score -= 20;
      }
      if (rej.reason === 'pain_fatigue' && (impact === 'high' || impact === 'moderate')) {
        score -= 30;
      }
    }

    return {
      modality,
      score,
      impactLevel: impact,
    };
  });

  scoredCandidates.sort((a, b) => b.score - a.score);

  const primaryModality = scoredCandidates[0].modality;
  const secondaryCandidate =
    scoredCandidates.find((c) => c.modality !== primaryModality) ?? scoredCandidates[0];

  // Determine optimal duration
  let targetDuration = checkIn.timeWindowMins;
  if (zeroFrictionTriggered) {
    targetDuration = Math.max(2, Math.min(5, checkIn.timeWindowMins || 5));
  } else if (zone1Cap) {
    targetDuration = Math.max(5, Math.min(20, checkIn.timeWindowMins));
  } else {
    targetDuration = Math.max(5, Math.min(45, checkIn.timeWindowMins));
  }

  const primaryDetails = buildPrescriptionDetails(
    primaryModality,
    stage,
    targetDuration,
    zone1Cap,
    zeroFrictionTriggered
  );

  // Build plain-Greek reasoning
  const reasonParts: string[] = [];
  if (zeroFrictionTriggered) {
    reasonParts.push(
      `Το σκορ ευκαιρίας κίνησης είναι χαμηλό (MOS ${mosScore}/100), γι' αυτό ενεργοποιήθηκε το Πρωτόκολλο Μηδενικής Τριβής (${targetDuration} λεπτά). Σήμερα μας νοιάζει μόνο να μην σπάσει η νευρολογική αλυσίδα της εκκίνησης.`
    );
  } else if (zone1Cap) {
    reasonParts.push(
      `Λόγω των σημερινών βιομετρικών δεικτών αποκατάστασης, η ένταση κρατιέται αυστηρά σε Zone 1 (${targetDuration} λεπτά) ώστε να κερδίσεις συνέπεια χωρίς φυσιολογικό στρες.`
    );
  } else {
    reasonParts.push(
      `Με βάση το διαθέσιμο παράθυρο των ${checkIn.timeWindowMins}' και την ετοιμότητά σου (MOS ${mosScore}/100 στο ${stageDef.code}), αυτή είναι η βέλτιστη κίνηση για σήμερα.`
    );
  }

  const rejectedModalities = new Set(recentRejections.map((r) => r.modality));
  if (rejectedModalities.size > 0 && !rejectedModalities.has(primaryModality)) {
    const avoidedNames = Array.from(rejectedModalities)
      .slice(0, 2)
      .map((m) => MODALITY_LABELS_GREEK[m])
      .join(', ');
    reasonParts.push(
      `Η Μνήμη Συμπεριφοράς απέφυγε προτάσεις που απέρριψες πρόσφατα (${avoidedNames}) και προσάρμοσε τον τύπο κίνησης.`
    );
  }

  // Bored Alternative (Swaps modality while keeping feasible duration)
  const boredDetails = buildPrescriptionDetails(
    secondaryCandidate.modality,
    stage,
    targetDuration,
    zone1Cap,
    zeroFrictionTriggered
  );

  const boredAlternative: AlternativePrescription = {
    id: `alt-bored-${secondaryCandidate.modality}-${targetDuration}`,
    title: boredDetails.title,
    modality: secondaryCandidate.modality,
    durationMins: targetDuration,
    intensityLabel: boredDetails.intensityLabel,
    reasoningGreek: `Εναλλαγή σε «${MODALITY_LABELS_GREEK[secondaryCandidate.modality]}» για αλλαγή ερεθίσματος χωρίς απώλεια πόντων συνέπειας.`,
    habitPointsAward: boredDetails.habitPointsAward,
    structuralPointsAward: boredDetails.structuralPointsAward,
  };

  // Hard Downgrade (2-5 min micro-step without guilt or penalty)
  const microDuration = Math.min(3, targetDuration);
  const microModality: ModalityType =
    checkIn.environment === 'indoor_clothes' ? 'mobility' : 'walk';
  const microDetails = buildPrescriptionDetails(microModality, stage, microDuration, true, true);

  const hardDowngrade: AlternativePrescription = {
    id: `down-micro-${microModality}-${microDuration}`,
    title: microDetails.title,
    modality: microModality,
    durationMins: microDuration,
    intensityLabel: 'Micro-Step • 100% Επιβράβευση Εκκίνησης',
    reasoningGreek: `Μείωση διάρκειας σε ${microDuration} λεπτά μηδενικού κόστους. Η εκκίνηση μετράει 100% στη συνέπειά σου.`,
    habitPointsAward: 15,
    structuralPointsAward: 2,
  };

  return {
    id: `rec-${stage}-${primaryModality}-${targetDuration}-${mosScore}`,
    title: primaryDetails.title,
    modality: primaryModality,
    durationMins: targetDuration,
    intensityLabel: primaryDetails.intensityLabel,
    reasoningGreek: reasonParts.join(' '),
    safetyAlertsGreek,
    mosScore,
    habitPointsAward: primaryDetails.habitPointsAward,
    structuralPointsAward: primaryDetails.structuralPointsAward,
    boredAlternative,
    hardDowngrade,
    safetyGateTriggered: zone1Cap,
    zeroFrictionTriggered,
  };
}

/**
 * Updates dual progression metrics (habitConsistencyScore & runningReadiness)
 * and evaluates stage transitions when thresholds are satisfied.
 */
export function applyMovementToProgression(
  current: UserProgressionState,
  habitPointsAward: number,
  structuralPointsAward: number
): {
  updated: UserProgressionState;
  stageAdvanced: boolean;
} {
  const newHabitScore = Math.min(100, Math.round(current.habitConsistencyScore + habitPointsAward));
  const newReadiness = Math.min(
    100,
    Math.round(current.runningReadiness + structuralPointsAward)
  );

  let nextStage: StageId = current.currentStage;
  let stageAdvanced = false;

  const currentStageDef = STAGES[current.currentStage];
  if (
    current.currentStage < 5 &&
    newHabitScore >= currentStageDef.minHabitScoreToAdvance &&
    newReadiness >= currentStageDef.minReadinessToAdvance
  ) {
    nextStage = (current.currentStage + 1) as StageId;
    stageAdvanced = true;
  }

  return {
    updated: {
      ...current,
      currentStage: nextStage,
      habitConsistencyScore: newHabitScore,
      runningReadiness: newReadiness,
      totalSessionsCompleted: current.totalSessionsCompleted + 1,
      lastActiveDate: new Date().toISOString(),
    },
    stageAdvanced,
  };
}
