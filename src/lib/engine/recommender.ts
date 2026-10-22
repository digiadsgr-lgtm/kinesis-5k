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
  outdoor: 0, // 0% τριβή — ήδη έξω
  home_gear: 25, // 25% τριβή — σπίτι έτοιμος για γυμναστική
  home_slippers: 50, // 50% τριβή — σπίτι με παντόφλα / κάλτσες
  indoor_clothes: 75, // 75% τριβή — γραφείο / ρούχα δουλειάς
};

export interface RejectionHistoryItem {
  modality: ModalityType;
  reason: RejectionReason;
  timestamp?: string;
}

/**
 * Calculates Movement Opportunity Score (MOS) on a 0-100 scale.
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
      `Χαμηλή Φερριτίνη (${biomarkers.ferritin} ng/mL): Το σώμα μεταφέρει λιγότερο οξυγόνο στους μύες. Κρατάμε την ένταση χαλαρή για να μην εξαντληθείς.`
    );
    dampenIntensity = true;
  }

  if (biomarkers.hemoglobin !== null && biomarkers.hemoglobin < 12.5) {
    alerts.push(
      `Χαμηλή Αιμοσφαιρίνη (${biomarkers.hemoglobin} g/dL): Προστατευτικός κόφτης έντασης (ήπιος ρυθμός Zone 1-2).`
    );
    dampenIntensity = true;
  }

  if (biomarkers.crp !== null && biomarkers.crp > 3.0) {
    alerts.push(
      `Αυξημένη CRP (${biomarkers.crp} mg/L): Ένδειξη φλεγμονής. Αποφεύγονται οι κραδασμοί σήμερα.`
    );
    dampenIntensity = true;
  }

  if (biomarkers.vitaminD !== null && biomarkers.vitaminD < 25) {
    alerts.push(
      `Χαμηλή Βιταμίνη D (${biomarkers.vitaminD} ng/mL): Προσοχή στην ομαλή ενδυνάμωση οστών και αρθρώσεων.`
    );
  }

  if (biomarkers.vitaminB12 !== null && biomarkers.vitaminB12 < 250) {
    alerts.push(
      `Οριακή Βιταμίνη B12 (${biomarkers.vitaminB12} pg/mL): Μπορεί να φέρνει πιο εύκολα αίσθηση κούρασης.`
    );
  }

  if (biomarkers.fastingGlucose !== null && biomarkers.fastingGlucose > 105) {
    alerts.push(
      `Γλυκόζη Νηστείας (${biomarkers.fastingGlucose} mg/dL): Η ήπια κίνηση μετά το φαγητό βοηθάει τους μύες να ρίξουν άμεσα το σάκχαρο.`
    );
  }

  if (biomarkers.medicalRestrictions && biomarkers.medicalRestrictions.trim().length > 0) {
    alerts.push(`Σημείωση Υγείας: ${biomarkers.medicalRestrictions.trim()}`);
  }

  return { alerts, dampenIntensity };
}

interface PrescriptionBlueprint {
  title: string;
  intensityLabel: string;
  whatWeAchieveGreek: string;
  stepByStepGreek: string[];
  habitPointsAward: number;
  structuralPointsAward: number;
}

/**
 * Generates crystal-clear, 100% equipment-free Greek instructions & goals
 * understandable by anyone from 5 to 105 years old.
 */
function buildPrescriptionDetails(
  modality: ModalityType,
  stage: StageId,
  durationMins: number,
  environment: EnvironmentType,
  zone1Cap: boolean,
  zeroFriction: boolean
): PrescriptionBlueprint {
  const isOffice = environment === 'indoor_clothes';
  const isHomeSlippers = environment === 'home_slippers';

  // -------------------------------------------------------------------------
  // 1. MOBILITY / ΞΕΜΠΛΟΚΑΡΙΣΜΑ & ΕΥΛΥΓΙΣΙΑ (100% χωρίς εξοπλισμό)
  // -------------------------------------------------------------------------
  if (modality === 'mobility') {
    if (isOffice) {
      return {
        title: `${durationMins}' Όρθιο Ξεμπλοκάρισμα Μέσης, Γοφών & Ποδιών (Στο Γραφείο)`,
        intensityLabel: zeroFriction
          ? 'Zero-Friction • Όρθιος με Ρούχα Δουλειάς'
          : 'Μηδενικός Κραδασμός • Όρθιες Κινήσεις Γραφείου',
        whatWeAchieveGreek:
          'Όταν καθόμαστε, το μπροστινό μέρος των γοφών «μαζεύει» και τραβάει τη μέση, ενώ το αίμα μένει χαμηλά στα πόδια. Με 3 πανεύκολες όρθιες κινήσεις ξεμπλοκάρουμε τη μέση και ανεβάζουμε το αίμα πίσω στην καρδιά χωρίς να ιδρώσουμε.',
        stepByStepGreek: [
          'Βήμα 1 (Άνοιγμα Γοφών): Σήκω όρθιος και κάνε ένα μεγάλο βήμα πίσω με το δεξί πόδι. Λύγισε ελαφρά το μπροστινό γόνατο μέχρι να νιώσεις ένα γλυκό τέντωμα ψηλά στον δεξί γοφό. Μείνε 30 δευτερόλεπτα και άλλαξε πόδι.',
          'Βήμα 2 (Ξύπνημα Γάμπας): Στάσου στα δύο πόδια και σήκω αργά στις μύτες των ποδιών 15 φορές.',
          'Βήμα 3 (Άνοιγμα Στήθους & Ώμων): Άνοιξε τα χέρια διάπλατα στο πλάι, τράβα τους ώμους πίσω-κάτω και πάρε 5 βαθιές ανάσες.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.35)),
      };
    }

    if (isHomeSlippers) {
      return {
        title: `${durationMins}' Ξεμούδιασμα Σώματος στο Σπίτι (Χωρίς Κανέναν Εξοπλισμό)`,
        intensityLabel: zeroFriction
          ? 'Zero-Friction • Σπίτι με Παντόφλα ή Κάλτσες'
          : 'Απαλή Κίνηση στο Σπίτι • Μόνο το Σώμα σου',
        whatWeAchieveGreek:
          'Διώχνουμε το πιάσιμο από τη μέση, τα γόνατα και τους ώμους όρθιοι μέσα στο δωμάτιο, χωρίς να χρειαστεί κανένα όργανο ή αθλητικά παπούτσια.',
        stepByStepGreek: [
          'Βήμα 1 (Περπάτημα στη Θέση): Περπάτα επιτόπου για 1 λεπτό σηκώνοντας χαλαρά τα γόνατα και κουνώντας τα χέρια.',
          'Βήμα 2 (Άνοιγμα Γοφών & Μέσης): Κάνε ένα μεγάλο βήμα πίσω με το δεξί πόδι και σήκωσε τα χέρια ψηλά παίρνοντας βαθιά ανάσα για 30 δευτερόλεπτα. Κάνε το ίδιο με το αριστερό πόδι.',
          ...(durationMins > 2
            ? [
                'Βήμα 3 (Ήπια Καθίσματα στον Αέρα): Με τα πόδια στο άνοιγμα των ώμων, λύγισε λίγο τα γόνατα (σαν να ξεκινάς να κάτσεις) και ξανασήκω όρθιος 10 φορές αργά.',
              ]
            : []),
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.4)),
      };
    }

    return {
      title: `${durationMins}' Ξεμπλοκάρισμα Αρθρώσεων, Μέσης & Αστραγάλων (Στο Σπίτι)`,
      intensityLabel: 'Ευλυγισία & Αποκατάσταση • Κανένας Εξοπλισμός',
      whatWeAchieveGreek:
        'Ζεσταίνουμε τις αρθρώσεις (γοφούς, γόνατα, αστραγάλους) μόνο με το σώμα μας, ώστε οι κινήσεις μας να είναι ανάλαφρες και χωρίς πόνους.',
      stepByStepGreek: [
        'Βήμα 1 (Κύκλοι Αστραγάλων & Γοφών): Σήκωσε ελαφρά το δεξί πόδι και κάνε 10 κύκλους με το πέλμα. Επανάλαβε με το αριστερό.',
        'Βήμα 2 (Μεγάλο Βήμα & Τέντωμα): Κάνε ένα μεγάλο βήμα μπροστά, λύγισε το μπροστινό γόνατο και άνοιξε τα χέρια στο πλάι. Επανάλαβε 8 φορές εναλλάξ.',
        'Βήμα 3 (Στροφές Κορμού): Με τα πόδια ανοιχτά, στρίψε απαλά τον κορμό και τα χέρια δεξιά-αριστερά 12 φορές.',
      ],
      habitPointsAward: 14,
      structuralPointsAward: Math.max(2, Math.round(durationMins * 0.4)),
    };
  }

  // -------------------------------------------------------------------------
  // 2. STRENGTH / ΕΝΔΥΝΑΜΩΣΗ ΠΟΔΙΩΝ & ΚΟΡΜΟΥ (100% χωρίς εξοπλισμό)
  // -------------------------------------------------------------------------
  if (modality === 'strength') {
    if (isOffice) {
      return {
        title: `${durationMins}' Όρθιο Δυνάμωμα Γάμπας & Ποδιών (Στο Γραφείο)`,
        intensityLabel: 'Δυνάμωμα Ποδιών • Με Ρούχα Γραφείου',
        whatWeAchieveGreek:
          'Δυναμώνουμε τις γάμπες και τους μηρούς όρθιοι, χωρίς κανέναν εξοπλισμό, ώστε τα γόνατα και οι αστράγαλοι να γίνουν δυνατοί.',
        stepByStepGreek: [
          'Βήμα 1 (Αργό Ανέβασμα στις Μύτες): Στάσου όρθιος, ανέβα στις μύτες των ποδιών σε 2 δευτερόλεπτα, μείνε πάνω 2 δευτερόλεπτα και κατέβα αργά (15 φορές).',
          'Βήμα 2 (Μικρά Ημικαθίσματα): Λύγισε λίγο τα γόνατα (με ίσια πλάτη) και σήκω όρθιος σφίγγοντας τους γλουτούς 12 φορές.',
          ...(durationMins > 2
            ? [
                'Βήμα 3 (Ισορροπία στο Ένα Πόδι): Στάσου στο δεξί πόδι για 30 δευτερόλεπτα και μετά στο αριστερό για 30 δευτερόλεπτα.',
              ]
            : []),
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(3, Math.round(durationMins * 0.65)),
      };
    }

    return {
      title: `${durationMins}' Δυνάμωμα Ποδιών, Γονάτων & Μέσης στο Σπίτι (Χωρίς Όργανα)`,
      intensityLabel: 'Δύναμη Σπιτιού • Μόνο το Σώμα σου',
      whatWeAchieveGreek:
        'Χτίζουμε δυνατούς μηρούς, γλουτούς και γάμπες χωρίς κανένα όργανο. Όσο πιο δυνατά είναι τα πόδια, τόσο πιο ξεκούραστα περπατάς και τρέχεις.',
      stepByStepGreek: [
        'Βήμα 1 (Καθίσματα στον Αέρα): Με τα πόδια στο άνοιγμα των ώμων, κατέβα αργά σαν να κάθεσαι και σήκω όρθιος (12 επαναλήψεις).',
        'Βήμα 2 (Κράτημα Ημικαθίσματος): Λύγισε λίγο τα γόνατα και μείνε ακίνητος εκεί για 20 δευτερόλεπτα. Δυναμώνει άμεσα τα γόνατα.',
        ...(durationMins > 2
          ? [
              'Βήμα 3 (Βήμα Πίσω): Κάνε ένα βήμα πίσω με το δεξί πόδι, λύγισε ελαφρά τα γόνατα και ξαναέλα μπροστά. Κάνε το ίδιο με το αριστερό (10 φορές συνολικά).',
              'Βήμα 4 (Αργές Άρσεις στις Μύτες): Ανέβα στις μύτες των ποδιών και κατέβα αργά 15 φορές.',
            ]
          : []),
      ],
      habitPointsAward: 15,
      structuralPointsAward: Math.max(3, Math.round(durationMins * 0.7)),
    };
  }

  // -------------------------------------------------------------------------
  // 3. WALK / ΠΕΡΠΑΤΗΜΑ
  // -------------------------------------------------------------------------
  if (modality === 'walk') {
    if (isOffice) {
      return {
        title: `${durationMins}' Σβέλτο Περπάτημα στον Χώρο Γραφείου ή στο Τετράγωνο`,
        intensityLabel: zeroFriction
          ? 'Zero-Friction • Με Ρούχα Γραφείου'
          : 'Zone 1-2 • Αφύπνιση Κυκλοφορίας',
        whatWeAchieveGreek:
          'Ξεκολλάμε το σώμα από την καρέκλα, ρίχνουμε το σάκχαρο στο αίμα και καθαρίζουμε το μυαλό μέσα σε λίγα λεπτά.',
        stepByStepGreek: [
          `Βήμα 1: Σήκω από την καρέκλα τώρα και περπάτησε συνεχόμενα για ${durationMins} λεπτά.`,
          'Βήμα 2: Κράτα τους ώμους χαλαρούς και το βλέμμα μπροστά, όχι στο κινητό.',
          'Βήμα 3: Ο ρυθμός σου πρέπει να είναι σβέλτος αλλά άνετος, ώστε να μην ιδρώσεις.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.45)),
      };
    }

    if (isHomeSlippers) {
      return {
        title: `${durationMins}' Ρυθμικό Περπάτημα στη Θέση μέσα στο Σπίτι`,
        intensityLabel: 'Zone 1-2 • Κίνηση στο Σπίτι Χωρίς Εξοπλισμό',
        whatWeAchieveGreek:
          'Ανεβάζουμε ήπια τους παλμούς και ζεσταίνουμε τα πόδια μέσα στο δωμάτιο, χωρίς να χρειαστεί να ντυθείς ή να βγεις έξω.',
        stepByStepGreek: [
          'Βήμα 1: Περπάτησε ρυθμικά στη θέση σηκώνοντας χαλαρά τα γόνατα.',
          'Βήμα 2: Κούνα παράλληλα τα χέρια μπρος-πίσω για να ανέβει η κυκλοφορία σε όλο το σώμα.',
          'Βήμα 3: Κάθε 1 λεπτό, κάνε 5 μικρά καθίσματα και συνέχισε το ρυθμικό βήμα.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.45)),
      };
    }

    return {
      title: `${durationMins}' Ζωηρό Ρυθμικό Περπάτημα (${
        zone1Cap ? 'Zone 1 Αποκατάστασης' : 'Zone 2 Αερόβια Βάση'
      })`,
      intensityLabel: zone1Cap
        ? 'Zone 1 • Ελεγχόμενη Ένταση Ασφαλείας'
        : 'Zone 2 • Χτίσιμο Αερόβιας Αντοχής',
      whatWeAchieveGreek:
        'Δυναμώνουμε την καρδιά και τους πνεύμονες και συνηθίζουμε τα πόδια στη συνεχή κίνηση χωρίς κραδασμούς.',
      stepByStepGreek: [
        `Βήμα 1: Περπάτησε με ζωηρό, σταθερό ρυθμό για ${durationMins} λεπτά.`,
        'Βήμα 2 (Κανόνας Αναπνοής): Πήγαινε με ρυθμό τέτοιο ώστε να μπορείς να μιλάς άνετα χωρίς να λαχανιάζεις.',
        'Βήμα 3: Πάτα μαλακά από τη φτέρνα προς τα δάχτυλα κουνώντας ρυθμικά τα χέρια.',
      ],
      habitPointsAward: 14,
      structuralPointsAward: Math.max(2, Math.round(durationMins * 0.5)),
    };
  }

  // -------------------------------------------------------------------------
  // 4. STAIRS / ΑΝΑΒΑΣΗ ΣΚΑΛΑΣ
  // -------------------------------------------------------------------------
  if (modality === 'stairs') {
    return {
      title: `${durationMins}' Ήρεμη Ανάβαση Σκάλας`,
      intensityLabel: zone1Cap
        ? 'Zone 1 • Αργός Ρυθμός Σκάλας'
        : 'Zone 2 • Δύναμη Ποδιών & Καρδιάς',
      whatWeAchieveGreek:
        'Η σκάλα δυναμώνει τους μηρούς, τους γλουτούς και την καρδιά σε ελάχιστο χρόνο, χωρίς τον κραδασμό του τρεξίματος.',
      stepByStepGreek: [
        'Βήμα 1: Ανέβα τα σκαλιά με ήρεμο, σταθερό ρυθμό πατώντας με ΟΛΟ το πέλμα στο σκαλοπάτι.',
        'Βήμα 2: Κατέβα πολύ αργά και χαλαρά για να ξεκουράζονται τα γόνατα.',
        `Βήμα 3: Συνέχισε για ${durationMins} λεπτά συνολικά.`,
      ],
      habitPointsAward: 15,
      structuralPointsAward: Math.max(3, Math.round(durationMins * 0.65)),
    };
  }

  // -------------------------------------------------------------------------
  // 5. TREADMILL / ΔΙΑΔΡΟΜΟΣ
  // -------------------------------------------------------------------------
  if (modality === 'treadmill') {
    return {
      title: `${durationMins}' Ζωηρό Περπάτημα ή Χαλαρό Τζόκινγκ`,
      intensityLabel: zone1Cap ? 'Zone 1 • Ήπια Ροή' : 'Zone 2 • Σταθερός Ρυθμός',
      whatWeAchieveGreek:
        'Γυμνάζουμε την καρδιά σε απόλυτα ελεγχόμενο, σταθερό ρυθμό προστατεύοντας τις αρθρώσεις.',
      stepByStepGreek: [
        `Βήμα 1: Ξεκίνα τα πρώτα ${Math.min(2, durationMins)} λεπτά με χαλαρό περπάτημα.`,
        stage >= 2 && !zone1Cap
          ? 'Βήμα 2: Εναλλάσσεις 1 λεπτό πολύ χαλαρό τρέξιμο με 2 λεπτά άνετο περπάτημα.'
          : 'Βήμα 2: Διατήρησε ζωηρό περπάτημα αναπνέοντας ήρεμα από τη μύτη.',
      ],
      habitPointsAward: 14,
      structuralPointsAward: Math.max(3, Math.round(durationMins * 0.6)),
    };
  }

  // -------------------------------------------------------------------------
  // 6. WALK_RUN / ΕΝΑΛΛΑΓΕΣ ΠΕΡΠΑΤΗΜΑ - ΤΡΕΞΙΜΟ
  // -------------------------------------------------------------------------
  if (modality === 'walk_run') {
    const ratioText =
      stage <= 2
        ? '1 λεπτό πολύ χαλαρό τρέξιμο / 2 λεπτά περπάτημα'
        : '3 λεπτά χαλαρό τρέξιμο / 1 λεπτό περπάτημα';
    return {
      title: `${durationMins}' Εναλλαγές Περπάτημα & Χαλαρό Τρέξιμο`,
      intensityLabel: 'Zone 2 • Ομαλή Προσαρμογή Ποδιών',
      whatWeAchieveGreek:
        'Συνηθίζουμε το σώμα στο τρέξιμο σε μικρές, ξεκούραστες δόσεις. Τα διαλείμματα περπατήματος κρατούν τους παλμούς χαμηλά.',
      stepByStepGreek: [
        'Βήμα 1: Ξεκίνα με 3 λεπτά ζωηρό περπάτημα για ζέσταμα.',
        `Βήμα 2: Επανάλαβε τον κύκλο «${ratioText}» μέχρι να τελειώσει ο χρόνος.`,
        'Βήμα 3: Στο τρέξιμο πήγαινε πολύ αργά και ανάλαφρα, ώστε να μπορείς να μιλάς άνετα.',
      ],
      habitPointsAward: 15,
      structuralPointsAward: Math.max(4, Math.round(durationMins * 0.85)),
    };
  }

  // -------------------------------------------------------------------------
  // 7. RUN / ΣΥΝΕΧΟΜΕΝΟ ΤΡΕΞΙΜΟ
  // -------------------------------------------------------------------------
  return {
    title: `${durationMins}' Συνεχόμενο Άνετο Τρέξιμο (Ρυθμός Συζήτησης)`,
    intensityLabel:
      stage === 5 ? 'Zone 2-3 • Αγωνιστική Ετοιμότητα 5K' : 'Zone 2 • Ξεκούραστη Δρομική Ροή',
    whatWeAchieveGreek:
      'Μαθαίνουμε το σώμα να τρέχει οικονομικά με χαμηλούς παλμούς, χτίζοντας την αντοχή για τα 5 συνεχόμενα χιλιόμετρα.',
    stepByStepGreek: [
      'Βήμα 1: Τα πρώτα 3 λεπτά ξεκίνα με πολύ αργό τζόκινγκ.',
      'Βήμα 2: Βρες έναν σταθερό, άνετο ρυθμό όπου μπορείς να μιλάς χωρίς να λαχανιάζεις.',
      'Βήμα 3: Κράτα τους ώμους χαλαρούς και κάνε μικρά, μαλακά βήματα.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: Math.max(5, Math.round(durationMins * 1.0)),
  };
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

  // STRICT TIME CEILING: Never exceed the user's selected timeWindowMins!
  const requestedMins = Math.max(2, checkIn.timeWindowMins || 10);

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
      `Safety Gate Ενεργό: Καταγράφηκε πόνος ${checkIn.painLevel}/10${locationText}. Οι κραδασμοί κλειδώθηκαν στο μηδέν για προστασία του σώματος.`
    );

    const safeDuration = Math.min(requestedMins, 15);
    const painBlueprint = buildPrescriptionDetails(
      'mobility',
      stage,
      safeDuration,
      checkIn.environment,
      true,
      safeDuration <= 5
    );

    const microDuration = Math.min(2, safeDuration);
    const microBlueprint = buildPrescriptionDetails(
      'mobility',
      stage,
      microDuration,
      checkIn.environment,
      true,
      true
    );

    return {
      id: `rec-safety-pain-${stage}-${safeDuration}`,
      title: `${safeDuration}' Απαλό Ξεμπλοκάρισμα Χωρίς Κραδασμούς (Προστασία Πόνου)`,
      modality: 'mobility',
      durationMins: safeDuration,
      intensityLabel: 'Safety Gate • Μηδενικός Κραδασμός',
      reasoningGreek: `Επειδή ανέφερες πόνο (${checkIn.painLevel}/10${locationText}), το Σύστημα Ασφαλείας κλειδώνει τους κραδασμούς στο μηδέν. Κάνουμε μόνο απαλή κίνηση ${safeDuration} λεπτών χωρίς καμία επιβάρυνση.`,
      whatWeAchieveGreek: painBlueprint.whatWeAchieveGreek,
      stepByStepGreek: painBlueprint.stepByStepGreek,
      safetyAlertsGreek,
      mosScore,
      habitPointsAward: 15,
      structuralPointsAward: 3,
      safetyGateTriggered: true,
      zeroFrictionTriggered: false,
      boredAlternative: {
        id: `alt-safety-breath-${safeDuration}`,
        title: `${safeDuration}' Βαθιά Αναπνοή & Χαλάρωση Αυχένα/Ώμων`,
        modality: 'mobility',
        durationMins: safeDuration,
        intensityLabel: 'Safety Gate • Χαλάρωση Σώματος',
        reasoningGreek:
          'Εναλλακτική αποφόρτιση μηδενικού κραδασμού ώστε να ξεκουραστεί πλήρως το σημείο ενόχλησης.',
        whatWeAchieveGreek:
          'Ρίχνουμε την ένταση στους μύες και ηρεμούμε το νευρικό σύστημα.',
        stepByStepGreek: [
          'Βήμα 1: Στάσου ή κάθισε αναπαυτικά με τους ώμους χαλαρούς.',
          'Βήμα 2: Εισέπνευσε αργά από τη μύτη για 4 δευτερόλεπτα φουσκώνοντας την κοιλιά.',
          'Βήμα 3: Εξέπνευσε αργά από το στόμα για 6 δευτερόλεπτα αφήνοντας τους ώμους να πέσουν.',
          'Βήμα 4: Κάνε 5 πολύ αργές κλίσεις του κεφαλιού δεξιά και αριστερά.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: 2,
      },
      hardDowngrade: {
        id: `down-safety-micro`,
        title: `${microDuration}' Απαλό Ξεμπλοκάρισμα & Αναπνοή`,
        modality: 'mobility',
        durationMins: microDuration,
        intensityLabel: `Micro-Recovery • ${microDuration} Λεπτά`,
        reasoningGreek: `Το ελάχιστο ασφαλές βήμα: ${microDuration} λεπτά ήπιας κίνησης χωρίς καμία πίεση.`,
        whatWeAchieveGreek: microBlueprint.whatWeAchieveGreek,
        stepByStepGreek: microBlueprint.stepByStepGreek,
        habitPointsAward: 15,
        structuralPointsAward: 2,
      },
    };
  }

  let zone1Cap = false;
  if (poorSleep || elevatedRhr || biomarkerEval.dampenIntensity) {
    zone1Cap = true;
    if (poorSleep) {
      safetyAlertsGreek.unshift(
        `Safety Gate (Ύπνος ${biometrics.sleepScore}/100 < 60): Το σώμα είναι κουρασμένο από τον ύπνο. Η ένταση κρατιέται χαμηλά (Zone 1).`
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
  // PIPELINE 3: BEHAVIORAL MEMORY & ENVIRONMENT-AWARE RANKING
  // =========================================================================
  const stageDef = STAGES[stage];
  const candidatePool: ModalityType[] = [...stageDef.allowedModalities];

  if (!candidatePool.includes('mobility')) candidatePool.push('mobility');
  if (!candidatePool.includes('walk')) candidatePool.push('walk');
  if (!candidatePool.includes('strength')) candidatePool.push('strength');

  const recentRejections = rejectionHistory.slice(-10);

  const scoredCandidates: CandidateModality[] = candidatePool.map((modality) => {
    let score = 100;
    const impact = MODALITY_IMPACT[modality];

    if (stage === 0 && (modality === 'mobility' || modality === 'walk')) score += 20;
    if (stage === 1 && (modality === 'walk' || modality === 'stairs')) score += 20;
    if (stage === 2 && modality === 'walk_run') score += 25;
    if (stage >= 3 && modality === 'run') score += 30;

    if (zone1Cap) {
      if (impact === 'high') score -= 90;
      if (impact === 'moderate') score -= 50;
      if (modality === 'walk' || modality === 'mobility') score += 25;
    }

    if (zeroFrictionTriggered) {
      if (modality === 'mobility' || modality === 'walk' || modality === 'strength') {
        score += 30;
      } else {
        score -= 45;
      }
    }

    if (checkIn.environment === 'indoor_clothes') {
      if (modality === 'mobility') score += 35;
      if (modality === 'walk' || modality === 'stairs') score += 20;
      if (modality === 'strength') score += 10;
      if (modality === 'run' || modality === 'walk_run' || modality === 'treadmill') score -= 80;
    } else if (checkIn.environment === 'home_slippers') {
      if (modality === 'strength' || modality === 'mobility') score += 40;
      if (modality === 'walk') score += 10;
      if (modality === 'run' || modality === 'walk_run' || modality === 'treadmill') score -= 80;
    } else if (checkIn.environment === 'home_gear') {
      if (modality === 'strength' || modality === 'mobility') score += 35;
      if (modality === 'walk' || modality === 'stairs') score += 20;
      if (modality === 'run' || modality === 'walk_run') score -= 60;
    } else if (checkIn.environment === 'outdoor') {
      if (modality === 'run' || modality === 'walk_run' || modality === 'walk') {
        score += 30;
      }
    }

    for (const rej of recentRejections) {
      if (rej.modality === modality) {
        score -= PENALTY_BY_REASON[rej.reason] ?? 35;
      }
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

  // STRICT DURATION CALCULATION: Never exceed checkIn.timeWindowMins!
  let targetDuration = requestedMins;
  if (zeroFrictionTriggered) {
    targetDuration = Math.min(requestedMins, 5);
  } else if (zone1Cap) {
    targetDuration = Math.min(requestedMins, 20);
  } else {
    targetDuration = Math.min(requestedMins, 45);
  }

  const primaryDetails = buildPrescriptionDetails(
    primaryModality,
    stage,
    targetDuration,
    checkIn.environment,
    zone1Cap,
    zeroFrictionTriggered
  );

  const reasonParts: string[] = [];
  if (requestedMins <= 5) {
    reasonParts.push(
      `Έχεις διαθέσιμα ακριβώς ${targetDuration} λεπτά, οπότε η άσκηση προσαρμόστηκε αυστηρά στα ${targetDuration}' χωρίς κανέναν εξοπλισμό.`
    );
  } else if (zeroFrictionTriggered) {
    reasonParts.push(
      `Επειδή σήμερα η ενέργεια ή η διάθεση είναι πιο χαμηλά, κρατάμε τη διάρκεια στα ${targetDuration} λεπτά (Πρωτόκολλο Μηδενικής Τριβής) για να ξεκινήσεις πανεύκολα.`
    );
  } else if (zone1Cap) {
    reasonParts.push(
      `Λόγω των σημερινών δεικτών αποκατάστασης, η ένταση κρατιέται χαμηλά σε Zone 1 (${targetDuration} λεπτά) ώστε να κερδίσεις συνέπεια χωρίς κούραση.`
    );
  } else {
    reasonParts.push(
      `Προσαρμοσμένο στα ${targetDuration} διαθέσιμα λεπτά σου και στον χώρο που βρίσκεσαι, χωρίς να χρειάζεσαι κανένα όργανο.`
    );
  }

  // Actively exploit Smartwatch Steps & HRV recovery in reasoning and point awards
  let smartwatchHabitBonus = 0;
  let smartwatchStructuralBonus = 0;

  if (biometrics.stepsSoFar < 1500) {
    reasonParts.push(
      `Το Smartwatch δείχνει παρατεταμένη ακινησία σήμερα (${biometrics.stepsSoFar} βήματα), γι' αυτό ξεκινάμε με ενεργοποίηση της κυκλοφορίας.`
    );
    smartwatchHabitBonus = 1;
  } else if (biometrics.stepsSoFar >= 7500) {
    reasonParts.push(
      `Το Smartwatch κατέγραψε ήδη ${biometrics.stepsSoFar} βήματα σήμερα! Κερδίζεις μπόνους συνέπειας προστατεύοντας τις αρθρώσεις από υπερφόρτωση.`
    );
    smartwatchHabitBonus = 2;
  }

  if (!zone1Cap && biometrics.hrv >= 55 && biometrics.sleepScore >= 75) {
    reasonParts.push(
      `Υψηλή αποκατάσταση Smartwatch (HRV ${biometrics.hrv} ms • Ύπνος ${biometrics.sleepScore}/100): Ιδανική μέρα για μεταβολική και μυϊκή πρόοδο!`
    );
    smartwatchStructuralBonus = 2;
  }

  const rejectedModalities = new Set(recentRejections.map((r) => r.modality));
  if (rejectedModalities.size > 0 && !rejectedModalities.has(primaryModality)) {
    const avoidedNames = Array.from(rejectedModalities)
      .slice(0, 2)
      .map((m) => MODALITY_LABELS_GREEK[m])
      .join(', ');
    reasonParts.push(
      `Η Μνήμη Συμπεριφοράς απέφυγε προτάσεις που απέρριψες πρόσφατα (${avoidedNames}) και άλλαξε τον τύπο κίνησης.`
    );
  }

  const boredDetails = buildPrescriptionDetails(
    secondaryCandidate.modality,
    stage,
    targetDuration,
    checkIn.environment,
    zone1Cap,
    zeroFrictionTriggered
  );

  const boredAlternative: AlternativePrescription = {
    id: `alt-bored-${secondaryCandidate.modality}-${targetDuration}`,
    title: boredDetails.title,
    modality: secondaryCandidate.modality,
    durationMins: targetDuration,
    intensityLabel: boredDetails.intensityLabel,
    reasoningGreek: `Εναλλαγή σε «${MODALITY_LABELS_GREEK[secondaryCandidate.modality]}» (${targetDuration} λεπτά) χωρίς εξοπλισμό.`,
    whatWeAchieveGreek: boredDetails.whatWeAchieveGreek,
    stepByStepGreek: boredDetails.stepByStepGreek,
    habitPointsAward: boredDetails.habitPointsAward,
    structuralPointsAward: boredDetails.structuralPointsAward,
  };

  const microDuration = Math.min(2, targetDuration);
  const microModality: ModalityType =
    checkIn.environment === 'indoor_clothes' || checkIn.environment === 'home_slippers'
      ? 'mobility'
      : 'walk';
  const microDetails = buildPrescriptionDetails(
    microModality,
    stage,
    microDuration,
    checkIn.environment,
    true,
    true
  );

  const hardDowngrade: AlternativePrescription = {
    id: `down-micro-${microModality}-${microDuration}`,
    title: microDetails.title,
    modality: microModality,
    durationMins: microDuration,
    intensityLabel: `Micro-Step ${microDuration}' • Πανεύκολο Ξεκίνημα`,
    reasoningGreek: `Μείωση στα ${microDuration} λεπτά. Ακόμα και ${microDuration} λεπτά κίνησης μετράνε 100% στη συνέπειά σου!`,
    whatWeAchieveGreek: microDetails.whatWeAchieveGreek,
    stepByStepGreek: microDetails.stepByStepGreek,
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
    whatWeAchieveGreek: primaryDetails.whatWeAchieveGreek,
    stepByStepGreek: primaryDetails.stepByStepGreek,
    safetyAlertsGreek,
    mosScore,
    habitPointsAward: Math.min(20, primaryDetails.habitPointsAward + smartwatchHabitBonus),
    structuralPointsAward: primaryDetails.structuralPointsAward + smartwatchStructuralBonus,
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
