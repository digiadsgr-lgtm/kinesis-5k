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
  outdoor: 0, // 0% τριβή — ήδη έξω με αθλητικά
  home_gear: 25, // 25% τριβή — σπίτι με αθλητικά παπούτσια / διάδρομο
  home_slippers: 50, // 50% τριβή — σπίτι με παντόφλα / ρούχα σπιτιού
  indoor_clothes: 75, // 75% τριβή — γραφείο / ρούχα γραφείου
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
      `Χαμηλή Φερριτίνη (${biomarkers.ferritin} ng/mL): Μειωμένη μεταφορά οξυγόνου στους μύες. Ο αλγόριθμος περιορίζει την υψηλή ένταση για να μην εξαντληθείς.`
    );
    dampenIntensity = true;
  }

  if (biomarkers.hemoglobin !== null && biomarkers.hemoglobin < 12.5) {
    alerts.push(
      `Χαμηλή Αιμοσφαιρίνη (${biomarkers.hemoglobin} g/dL): Προστατευτικός κόφτης αερόβιας έντασης (έμφαση σε ήπιο ρυθμό Zone 1-2).`
    );
    dampenIntensity = true;
  }

  if (biomarkers.crp !== null && biomarkers.crp > 3.0) {
    alerts.push(
      `Αυξημένη CRP (${biomarkers.crp} mg/L): Ένδειξη φλεγμονής. Αποφεύγονται οι κραδασμοί στους τένοντες σήμερα.`
    );
    dampenIntensity = true;
  }

  if (biomarkers.vitaminD !== null && biomarkers.vitaminD < 25) {
    alerts.push(
      `Χαμηλή Βιταμίνη D (${biomarkers.vitaminD} ng/mL): Προσοχή στη βαθμιαία φόρτιση οστών και αρθρώσεων.`
    );
  }

  if (biomarkers.vitaminB12 !== null && biomarkers.vitaminB12 < 250) {
    alerts.push(
      `Οριακή Βιταμίνη B12 (${biomarkers.vitaminB12} pg/mL): Ενδέχεται να αυξάνει την αίσθηση κόπωσης.`
    );
  }

  if (biomarkers.fastingGlucose !== null && biomarkers.fastingGlucose > 105) {
    alerts.push(
      `Γλυκόζη Νηστείας (${biomarkers.fastingGlucose} mg/dL): Η σταθερή κίνηση μετά το φαγητό βοηθάει τους μύες να απορροφήσουν άμεσα το σάκχαρο.`
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
 * Generates crystal-clear, environment-aware Greek instructions & goals
 * so the user ALWAYS knows 1) what we achieve and 2) what exact physical movements to do.
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
  // 1. MOBILITY / ΞΕΜΠΛΟΚΑΡΙΣΜΑ ΣΩΜΑΤΟΣ
  // -------------------------------------------------------------------------
  if (modality === 'mobility') {
    if (isOffice) {
      return {
        title: `${durationMins}' Όρθιο Ξεμπλοκάρισμα Μέσης, Γοφών & Γάμπας (Δίπλα στο Γραφείο)`,
        intensityLabel: zeroFriction
          ? 'Zero-Friction • Με Ρούχα Γραφείου (Χωρίς Ίδρωμα)'
          : 'Μηδενικός Κραδασμός • Όρθιες Κινήσεις Γραφείου',
        whatWeAchieveGreek:
          'Όταν κάθεσαι ώρες, το μπροστινό μέρος των γοφών «μαζεύει» και τραβάει τη μέση, ενώ το αίμα λιμνάζει χαμηλά στα πόδια. Με 3 απλές όρθιες κινήσεις ανοίγουμε τους γοφούς και ενεργοποιούμε την κυκλοφορία χωρίς να τσαλακωθείς ή να ιδρώσεις.',
        stepByStepGreek: [
          '1. Άνοιγμα Γοφών (1 λεπτό): Σήκω όρθιος, κρατήσου από το γραφείο και κάνε ένα μεγάλο βήμα πίσω με το δεξί πόδι. Σπρώξε ελαφρά τη λεκάνη μπροστά μέχρι να νιώσεις ένα γλυκό τράβηγμα ψηλά στον δεξί γοφό. Μείνε 30" και άλλαξε πόδι (30").',
          '2. Αντλία Γάμπας (30 δευτ.): Στάσου στα δύο πόδια και σήκω αργά στις μύτες των ποδιών 15 φορές. Αυτό σπρώχνει το αίμα πίσω στην καρδιά και ξυπνάει τον Αχίλλειο τένοντα.',
          '3. Άνοιγμα Στήθους & Αυχένα (30 δευτ.): Πλέξε τα δάχτυλα πίσω από την πλάτη (ή πιάσε τις πίσω γωνίες της καρέκλας), τράβα τους ώμους πίσω-κάτω και πάρε 5 βαθιές ανάσες.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.35)),
      };
    }

    if (isHomeSlippers) {
      return {
        title: `${durationMins}' Ξεμπλοκάρισμα Μέσης & Γοφών στο Σπίτι (Χωρίς Παπούτσια)`,
        intensityLabel: zeroFriction
          ? 'Zero-Friction • Σπίτι με Παντόφλα / Χαλί'
          : 'Αποκατάσταση • Μηδενικός Κραδασμός στο Σπίτι',
        whatWeAchieveGreek:
          'Ξεκλειδώνουμε τη μέση, τους γοφούς και τους αστραγάλους στον χώρο του σπιτιού σου (σε καναπέ, καρέκλα ή χαλί), ώστε το σώμα να είναι ελαστικό και έτοιμο για περπάτημα ή τρέξιμο χωρίς πόνους.',
        stepByStepGreek: [
          '1. Τέντωμα Γοφού στον Καναπέ/Καρέκλα (1 λεπτό): Στάσου όρθιος, ακούμπησε το δεξί γόνατο πάνω στον καναπέ (το αριστερό πόδι πατάει κάτω) και σφίξε τον δεξί γλουτό για 30". Θα νιώσεις να ανοίγει όλο το μπροστινό μέρος του μηρού. Άλλαξε πλευρά για 30".',
          '2. Ξεμπλοκάρισμα Αστραγάλου στον Τοίχο (1 λεπτό): Βάλε τα δάχτυλα του δεξιού ποδιού 10 εκ. από τον τοίχο. Λύγισε το γόνατο ώστε να ακουμπήσει τον τοίχο χωρίς να σηκωθεί η φτέρνα από το πάτωμα (10 αργές επαναλήψεις σε κάθε πόδι).',
          ...(durationMins > 2
            ? [
                '3. Καθίσματα Καναπέ (1-2 λεπτά): Κάθισε και σήκω αργά από τον καναπέ ή την καρέκλα 12 φορές χωρίς να βάλεις χέρια, πιέζοντας τις φτέρνες στο πάτωμα.',
              ]
            : []),
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.4)),
      };
    }

    return {
      title: `${durationMins}' Ενεργοποίηση Αρθρώσεων, Αστραγάλων & Γοφών`,
      intensityLabel: 'Αποκατάσταση & Ευλυγισία • Μηδενικός Κραδασμός',
      whatWeAchieveGreek:
        'Λιπαίνουμε τις αρθρώσεις (γοφούς, γόνατα, αστραγάλους) και αυξάνουμε την αιμάτωση στους τένοντες χωρίς καμία καταπόνηση.',
      stepByStepGreek: [
        '1. Αιωρήσεις Ποδιών (1 λεπτό): Κρατήσου από έναν τοίχο και κούνησε το δεξί πόδι χαλαρά μπρος-πίσω 15 φορές σαν εκκρεμές. Επανάλαβε με το αριστερό.',
        '2. Λύγισμα Αστραγάλων (1 λεπτό): Κάνε 10 αργά λυγίσματα γονάτων προς τα εμπρός κρατώντας τις φτέρνες κολλημένες κάτω.',
        '3. Βαθιά Προβολή & Στροφή Κορμού (υπόλοιπος χρόνος): Κάνε ένα μεγάλο βήμα μπροστά, χαμήλωσε τη λεκάνη και στρίψε ήπια τον κορμό δεξιά-αριστερά.',
      ],
      habitPointsAward: 14,
      structuralPointsAward: Math.max(2, Math.round(durationMins * 0.4)),
    };
  }

  // -------------------------------------------------------------------------
  // 2. STRENGTH / ΕΝΔΥΝΑΜΩΣΗ ΠΟΔΙΩΝ & ΚΟΡΜΟΥ
  // -------------------------------------------------------------------------
  if (modality === 'strength') {
    if (isOffice) {
      return {
        title: `${durationMins}' Διακριτική Ενδυνάμωση Γάμπας & Ποδιών (Όρθιος στο Γραφείο)`,
        intensityLabel: 'Δομική Θωράκιση • Με Ρούχα Γραφείου',
        whatWeAchieveGreek:
          'Δυναμώνουμε τις γάμπες, τον Αχίλλειο τένοντα και τους μηρούς όρθιοι δίπλα στο γραφείο, ώστε τα πόδια να αντέχουν τους κραδασμούς του τρεξίματος χωρίς τραυματισμούς.',
        stepByStepGreek: [
          '1. Αργές Άρσεις στις Μύτες (1 λεπτό): Στάσου όρθιος πίσω από την καρέκλα. Ανέβα στις μύτες των ποδιών σε 2 δευτερόλεπτα, μείνε πάνω 2 δευτερόλεπτα και κατέβα αργά σε 3 δευτερόλεπτα (12-15 επαναλήψεις).',
          '2. Κάθισμα & Έγερση από Καρέκλα (1 λεπτό): Κάθισε στην καρέκλα και σήκω όρθιος 10 φορές χωρίς να χρησιμοποιήσεις τα χέρια σου, σφίγγοντας τους γλουτούς όταν σηκώνεσαι.',
          ...(durationMins > 2
            ? [
                '3. Ισορροπία στο Ένα Πόδι (υπόλοιπος χρόνος): Στάσου μόνο στο δεξί πόδι (με το γόνατο ελάχιστα λυγισμένο) για 30 δευτερόλεπτα. Άλλαξε στο αριστερό. Δυναμώνει όλους τους σταθεροποιητές του αστραγάλου.',
              ]
            : []),
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(3, Math.round(durationMins * 0.65)),
      };
    }

    if (isHomeSlippers) {
      return {
        title: `${durationMins}' Ενδυνάμωση Ποδιών, Γλουτών & Μέσης στο Σπίτι (Καρέκλα/Χαλί)`,
        intensityLabel: 'Δομική Ανοχή Σπιτιού • Χωρίς Αθλητικά Παπούτσια',
        whatWeAchieveGreek:
          'Χτίζουμε δυνατούς γλουτούς, τετρακεφάλους και γάμπες μέσα στο σπίτι. Όσο πιο δυνατοί είναι αυτοί οι μύες, τόσο λιγότερο ζορίζονται τα γόνατα και η μέση όταν περπατάς ή τρέχεις.',
        stepByStepGreek: [
          '1. Καθίσματα στον Καναπέ/Καρέκλα (Sit-to-Stand): 12 επαναλήψεις — κατεβαίνεις αργά μέχρι να ακουμπήσεις τον καναπέ και σηκώνεσαι δυναμικά χωρίς χέρια.',
          '2. Στήριξη στον Τοίχο (Wall Sit): Ακούμπησε την πλάτη στον τοίχο και κατέβα λίγο σαν να κάθεσαι σε αόρατη καρέκλα (στις 60 μοίρες, όχι πολύ βαθιά). Μείνε εκεί 30 δευτερόλεπτα. Θωρακίζει τα γόνατα.',
          ...(durationMins > 2
            ? [
                '3. Γέφυρες Γλουτών στο Χαλί/Καναπέ: Ξάπλωσε ανάσκελα με λυγισμένα γόνατα. Σήκωσε τη λεκάνη ψηλά σφίγγοντας τους γλουτούς, μείνε 2 δευτερόλεπτα και κατέβα (12 επαναλήψεις).',
                '4. Αργές Άρσεις Γάμπας: Κρατήσου από τον τοίχο και ανέβα-κατέβα στις μύτες των ποδιών 15 φορές.',
              ]
            : []),
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(3, Math.round(durationMins * 0.7)),
      };
    }

    return {
      title: `${durationMins}' Θωράκιση Αχιλλείου, Γονάτων & Κορμού στο Σπίτι`,
      intensityLabel: 'Δομική Ανοχή • Προστασία Αρθρώσεων Δρομέα',
      whatWeAchieveGreek:
        'Προετοιμάζουμε τους τένοντες (Αχίλλειο και επιγονατιδικό) και τον κορμό να απορροφούν με ασφάλεια το βάρος του σώματος σε κάθε βήμα.',
      stepByStepGreek: [
        '1. Εκκεντρικές Άρσεις Γάμπας (3 σετ x 12): Ανέβα στις μύτες με τα δύο πόδια σε 2" και κατέβα πολύ αργά (σε 4") νιώθοντας τη γάμπα να δουλεύει.',
        '2. Προβολές Πίσω (Reverse Lunges - 3 σετ x 8 ανά πόδι): Κάνε ένα βήμα πίσω, λύγισε και τα δύο γόνατα ελεγχόμενα και επίστρεψε στην αρχική θέση.',
        '3. Σανίδα Κορμού (2-3 σετ x 30"): Στηρίξου στους πήχεις (ή σε καναπέ) κρατώντας το σώμα σε ευθεία γραμμή και την κοιλιά σφιχτή.',
      ],
      habitPointsAward: 14,
      structuralPointsAward: Math.max(3, Math.round(durationMins * 0.7)),
    };
  }

  // -------------------------------------------------------------------------
  // 3. WALK / ΠΕΡΠΑΤΗΜΑ
  // -------------------------------------------------------------------------
  if (modality === 'walk') {
    if (isOffice) {
      return {
        title: `${durationMins}' Σβέλτο Περπάτημα στον Διάδρομο Γραφείου ή γύρω από το Κτίριο`,
        intensityLabel: zeroFriction
          ? 'Zero-Friction • Με Ρούχα Γραφείου'
          : 'Zone 1-2 • Αφύπνιση Κυκλοφορίας',
        whatWeAchieveGreek:
          'Ξεκολλάμε το σώμα από την καρέκλα, ρίχνουμε το σάκχαρο στο αίμα και καθαρίζουμε το μυαλό μέσα σε λίγα λεπτά χωρίς να χρειαστείς αθλητικά ρούχα.',
        stepByStepGreek: [
          `1. Σήκω από την καρέκλα τώρα και περπάτησε συνεχόμενα για ${durationMins} λεπτά (στον διάδρομο του κτιρίου, στην αυλή ή στο τετράγωνο).`,
          '2. Κράτα τους ώμους χαλαρούς (μακριά από τα αυτιά) και το βλέμμα μπροστά, όχι στο κινητό.',
          '3. Ο ρυθμός σου πρέπει να είναι σβέλτος αλλά άνετος, ώστε να μην ιδρώσεις.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: Math.max(2, Math.round(durationMins * 0.45)),
      };
    }

    if (isHomeSlippers) {
      return {
        title: `${durationMins}' Ρυθμικό Βήμα στη Θέση & Κίνηση μέσα στο Σπίτι`,
        intensityLabel: 'Zone 1-2 • Ενεργοποίηση στο Σπίτι',
        whatWeAchieveGreek:
          'Ανεβάζουμε ήπια τους παλμούς και ενεργοποιούμε τα πόδια μέσα στο σπίτι, χωρίς να χρειαστεί να ντυθείς ή να βγεις έξω.',
        stepByStepGreek: [
          '1. Περπάτησε ρυθμικά μέσα στο σπίτι ή κάνε ρυθμικό βήμα στη θέση (Marching) σηκώνοντας ελαφρά τα γόνατα.',
          '2. Κούνα παράλληλα τα χέρια μπρος-πίσω (όπως όταν περπατάς γρήγορα στον δρόμο) για να ανέβει η κυκλοφορία του αίματος.',
          '3. Κάθε 1 λεπτό, κάνε 5 αργά καθίσματα στον καναπέ/καρέκλα και συνέχισε το ρυθμικό βήμα.',
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
        'Χτίζουμε την αερόβια βάση (τα «εργοστάσια ενέργειας» των μυών) και συνηθίζουμε τα πέλματα και τους τένοντες στη συνεχή κίνηση χωρίς κραδασμούς.',
      stepByStepGreek: [
        `1. Περπάτησε με ζωηρό, σταθερό ρυθμό για ${durationMins} λεπτά.`,
        '2. Κανόνας Αναπνοής: Ο ρυθμός πρέπει να είναι τέτοιος ώστε να μπορείς να μιλάς άνετα σε ολόκληρες προτάσεις χωρίς να λαχανιάζεις.',
        '3. Πάτα μαλακά από τη φτέρνα προς τα δάχτυλα και δώσε ώθηση με τα χέρια λυγισμένα στις 90 μοίρες.',
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
      title: `${durationMins}' Ελεγχόμενη Ανάβαση Σκάλας (Χωρίς Κραδασμό Προσγείωσης)`,
      intensityLabel: zone1Cap
        ? 'Zone 1 • Αργός Ρυθμός Σκάλας'
        : 'Zone 2 • Δύναμη Ποδιών & Καρδιάς',
      whatWeAchieveGreek:
        'Η ανάβαση σκάλας δυναμώνει εντυπωσιακά τους τετρακεφάλους, τους γλουτούς και την καρδιά σε ελάχιστο χρόνο, χωρίς τον κραδασμό που έχει το τρέξιμο στον δρόμο.',
      stepByStepGreek: [
        '1. Ανέβα τα σκαλιά με σταθερό, ήρεμο ρυθμό πατώντας με ΟΛΟ το πέλμα στο σκαλοπάτι (όχι μόνο με τις μύτες).',
        '2. Στο κατέβασμα, κατέβα πολύ χαλαρά και αργά (ή πάρε το ασανσέρ αν είσαι σε πολυώροφο κτίριο) για να μην ζορίσεις τα γόνατα.',
        `3. Συνέχισε τις εναλλαγές ανάβασης-κατάβασης για ${durationMins} λεπτά συνολικά.`,
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
      title: `${durationMins}' Διάδρομος με Ελαφριά Κλίση 1% - 1.5%`,
      intensityLabel: zone1Cap ? 'Zone 1 • Ήπια Ροή σε Διάδρομο' : 'Zone 2 • Ελεγχόμενος Ρυθμός',
      whatWeAchieveGreek:
        'Η ελαφριά κλίση 1.5% στον διάδρομο προστατεύει τα γόνατα μειώνοντας τον κραδασμό προσγείωσης, ενώ γυμνάζει την καρδιά σε απόλυτα ελεγχόμενο περιβάλλον.',
      stepByStepGreek: [
        '1. Ρύθμισε την κλίση του διαδρόμου στο 1.0% ή 1.5%.',
        `2. Ξεκίνα τα πρώτα ${Math.min(2, durationMins)} λεπτά με άνετο περπάτημα (π.χ. 4.5 - 5.2 km/h).`,
        stage >= 2 && !zone1Cap
          ? '3. Στο κύριο μέρος, εναλλάσσεις 1 λεπτό πολύ χαλαρό τρέξιμο (7.0 - 8.0 km/h) με 2 λεπτά περπάτημα.'
          : '3. Διατήρησε ζωηρό περπάτημα (5.2 - 6.0 km/h) αναπνέοντας ήρεμα από τη μύτη.',
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
      title: `${durationMins}' Εναλλαγές Περπάτημα-Τρέξιμο (${ratioText})`,
      intensityLabel: 'Zone 2 • Προοδευτική Προσαρμογή Τενόντων',
      whatWeAchieveGreek:
        'Δίνουμε στους τένοντες και στα οστά το ερέθισμα του τρεξίματος σε μικρές, ασφαλείς δόσεις. Τα διαλείμματα περπατήματος μηδενίζουν την κόπωση πριν προλάβει να συσσωρευτεί.',
      stepByStepGreek: [
        '1. Ξεκίνα με 3 λεπτά ζωηρό περπάτημα για να ζεσταθούν οι αστράγαλοι και τα γόνατα.',
        `2. Κύριο Μέρος: Επανάλαβε τον κύκλο «${ratioText}» μέχρι να συμπληρωθεί ο χρόνος.`,
        '3. Σημαντικό: Στο τρέξιμο πήγαινε ΠΙΟ ΑΡΓΑ από όσο νομίζεις (ρυθμός συζήτησης, μικρά και ανάλαφρα βήματα).',
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
      stage === 5 ? 'Zone 2-3 • Αγωνιστική Οικονομία 5K' : 'Zone 2 • Αερόβια Δρομική Ροή',
    whatWeAchieveGreek:
      'Μαθαίνουμε το σώμα να καίει λίπος ως καύσιμο και να τρέχει οικονομικά με χαμηλούς παλμούς, χτίζοντας την αντοχή για τα 5 συνεχόμενα χιλιόμετρα.',
    stepByStepGreek: [
      '1. Τα πρώτα 3 λεπτά ξεκίνα με πολύ αργό τζόκινγκ ώστε να ανέβουν ομαλά οι παλμοί.',
      '2. Βρες έναν σταθερό, άνετο ρυθμό όπου μπορείς να μιλάς χωρίς να κόβεται η ανάσα σου.',
      '3. Κράτα το σώμα ψηλό, τους ώμους χαλαρούς και προσγειώσου μαλακά κάτω από το κέντρο βάρους σου (όχι με τεντωμένο πόδι μπροστά).',
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
      `Safety Gate Ενεργό: Καταγράφηκε πόνος ${checkIn.painLevel}/10${locationText}. Οι κραδασμοί κλειδώθηκαν στο μηδέν για προστασία των ιστών.`
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
      title: `${safeDuration}' Ήπιο Ξεμπλοκάρισμα Χωρίς Κραδασμούς (Προστασία Πόνου)`,
      modality: 'mobility',
      durationMins: safeDuration,
      intensityLabel: 'Safety Gate • Μηδενικός Κραδασμός',
      reasoningGreek: `Επειδή ανέφερες πόνο (${checkIn.painLevel}/10${locationText}), το Σύστημα Ασφαλείας κλειδώνει τους κραδασμούς στο μηδέν. Κάνουμε μόνο ήπια κίνηση ${safeDuration} λεπτών μακριά από το σημείο ενόχλησης.`,
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
        title: `${safeDuration}' Βαθιά Διαφραγματική Αναπνοή & Χαλάρωση Αυχένα/Ώμων`,
        modality: 'mobility',
        durationMins: safeDuration,
        intensityLabel: 'Safety Gate • Νευρομυϊκή Χαλάρωση',
        reasoningGreek:
          'Εναλλακτική αποφόρτιση μηδενικού κραδασμού ώστε να μην επιβαρυνθεί καθόλου το σημείο ενόχλησης.',
        whatWeAchieveGreek:
          'Ρίχνουμε την ένταση του νευρικού συστήματος και τη μυϊκή σύσπαση γύρω από την περιοχή που πονάει.',
        stepByStepGreek: [
          '1. Κάθισε αναπαυτικά με την πλάτη στηριγμένη και τους ώμους χαλαρούς.',
          '2. Εισέπνευσε αργά από τη μύτη για 4 δευτερόλεπτα φουσκώνοντας την κοιλιά.',
          '3. Εξέπνευσε αργά από το στόμα για 6 δευτερόλεπτα αφήνοντας τους ώμους να πέσουν.',
          '4. Κάνε 5 πολύ αργές κλίσεις του κεφαλιού δεξιά-αριστερά.',
        ],
        habitPointsAward: 15,
        structuralPointsAward: 2,
      },
      hardDowngrade: {
        id: `down-safety-micro`,
        title: `${microDuration}' Ήπιο Ξεμπλοκάρισμα & Αναπνοή δίπλα στην καρέκλα`,
        modality: 'mobility',
        durationMins: microDuration,
        intensityLabel: `Micro-Recovery • ${microDuration} Λεπτά`,
        reasoningGreek: `Το ελάχιστο ασφαλές βήμα αποκατάστασης: ${microDuration} λεπτά ήπιας κίνησης χωρίς καμία πίεση.`,
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
        `Safety Gate (Ύπνος ${biometrics.sleepScore}/100 < 60): Το νευρικό σύστημα είναι κουρασμένο. Η ένταση περιορίζεται αυστηρά σε Zone 1.`
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

    // Stage-appropriate primary preference
    if (stage === 0 && (modality === 'mobility' || modality === 'walk')) score += 20;
    if (stage === 1 && (modality === 'walk' || modality === 'stairs')) score += 20;
    if (stage === 2 && modality === 'walk_run') score += 25;
    if (stage >= 3 && modality === 'run') score += 30;

    // Zone 1 cap blocks high impact
    if (zone1Cap) {
      if (impact === 'high') score -= 90;
      if (impact === 'moderate') score -= 50;
      if (modality === 'walk' || modality === 'mobility') score += 25;
    }

    // Zero-friction mode prefers zero-prep modalities
    if (zeroFrictionTriggered) {
      if (modality === 'mobility' || modality === 'walk' || modality === 'strength') {
        score += 30;
      } else {
        score -= 45;
      }
    }

    // Environment-specific rules (Γραφείο vs Σπίτι/Παντόφλα vs Σπίτι/Αθλητικά vs Έξω)
    if (checkIn.environment === 'indoor_clothes') {
      // Office clothes: standing mobility, short office walk, or stairs — NEVER outdoor run or treadmill
      if (modality === 'mobility') score += 35;
      if (modality === 'walk' || modality === 'stairs') score += 20;
      if (modality === 'strength') score += 10;
      if (modality === 'run' || modality === 'walk_run' || modality === 'treadmill') score -= 80;
    } else if (checkIn.environment === 'home_slippers') {
      // Home with slippers / barefoot: home strength & mobility shine; no outdoor running or shoes required
      if (modality === 'strength' || modality === 'mobility') score += 40;
      if (modality === 'walk') score += 10;
      if (modality === 'run' || modality === 'walk_run' || modality === 'treadmill') score -= 80;
    } else if (checkIn.environment === 'home_gear') {
      if (modality === 'strength' || modality === 'treadmill' || modality === 'stairs') {
        score += 30;
      }
      if (modality === 'mobility') score += 15;
    } else if (checkIn.environment === 'outdoor') {
      if (modality === 'run' || modality === 'walk_run' || modality === 'walk') {
        score += 30;
      }
    }

    // Apply rejection taxonomy penalties from behavioral memory
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

  // STRICT DURATION CALCULATION:
  // Always respect checkIn.timeWindowMins as the upper bound!
  // If user put 2 mins, targetDuration MUST be 2 mins!
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

  // Build plain-Greek reasoning
  const reasonParts: string[] = [];
  if (requestedMins <= 5) {
    reasonParts.push(
      `Έχεις διαθέσιμα ακριβώς ${targetDuration} λεπτά, οπότε το πρόγραμμα προσαρμόστηκε αυστηρά στα ${targetDuration}' χωρίς να σου ζητάει παραπάνω χρόνο.`
    );
  } else if (zeroFrictionTriggered) {
    reasonParts.push(
      `Επειδή σήμερα η ενέργεια/διάθεση ή το περιβάλλον έχουν υψηλή τριβή (MOS ${mosScore}/100), το σύστημα κατέβασε τη διάρκεια στα ${targetDuration} λεπτά (Πρωτόκολλο Μηδενικής Τριβής) για να ξεκινήσεις πανεύκολα.`
    );
  } else if (zone1Cap) {
    reasonParts.push(
      `Λόγω των σημερινών δεικτών αποκατάστασης, η ένταση κρατιέται χαμηλά σε Zone 1 (${targetDuration} λεπτά) ώστε να κερδίσεις συνέπεια χωρίς κόπωση.`
    );
  } else {
    reasonParts.push(
      `Ιδανική αντιστοίχιση για τα ${targetDuration} διαθέσιμα λεπτά σου και τον χώρο που βρίσκεσαι (MOS ${mosScore}/100 στο ${stageDef.code}).`
    );
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

  // Bored Alternative (Swaps modality while strictly keeping targetDuration)
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
    reasoningGreek: `Εναλλαγή σε «${MODALITY_LABELS_GREEK[secondaryCandidate.modality]}» (${targetDuration} λεπτά) για αλλαγή ερεθίσματος χωρίς απώλεια πόντων συνέπειας.`,
    whatWeAchieveGreek: boredDetails.whatWeAchieveGreek,
    stepByStepGreek: boredDetails.stepByStepGreek,
    habitPointsAward: boredDetails.habitPointsAward,
    structuralPointsAward: boredDetails.structuralPointsAward,
  };

  // Hard Downgrade (2 min micro-step without guilt or penalty)
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
    intensityLabel: `Micro-Step ${microDuration}' • 100% Επιβράβευση Εκκίνησης`,
    reasoningGreek: `Μείωση στα ${microDuration} λεπτά μηδενικού κόστους. Η εκκίνηση μετράει 100% στη συνέπειά σου.`,
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
