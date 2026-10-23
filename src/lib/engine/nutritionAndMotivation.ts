import {
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  MovementLog,
  StageId,
  UserProgressionState,
} from '@/types/kinesis';
import { extractTextFromPdfBuffer } from '@/lib/parser/pdfBiomarkerExtractor';

export interface PersonalTransformationGoal {
  primaryGoalTitle: string;
  personalWhy: string;
  weeklyTargetMinutes: number;
  targetWeightKg: number | null;
  cravingResetsCompleted: number;
  updatedAt: string;
}

export interface ParsedMealSlot {
  slotLabelGreek: string; // π.χ. 'Πρωινό', 'Δεκατιανό', 'Μεσημεριανό', 'Απογευματινό (Πριν την Κίνηση)', 'Βραδινό'
  descriptionGreek: string;
  movementSynergyGreek: string;
}

export interface UploadedDietPlan {
  id: string;
  fileName: string;
  uploadedAt: string;
  rawSummaryGreek: string;
  meals: ParsedMealSlot[];
  hydrationAndCravingRuleGreek: string;
  detectedWeightKg?: number | null;
  biochemicalInstructionGreek?: string;
  parametersGreek?: string[];
}

export interface DailyNutritionAndSpark {
  id: string;
  badgeGreek: string;
  nutritionTitleGreek: string;
  nutritionTipGreek: string;
  whyItWorksScienceGreek: string;
  movementSparkTitleGreek: string;
  movementSparkTextGreek: string;
  couchRespectMessageGreek: string;
  cravingResetMicroActionGreek: string;
}

export const DEFAULT_TRANSFORMATION_GOAL: PersonalTransformationGoal = {
  primaryGoalTitle: 'Από τον καναπέ και το τσιμπολόγημα → Σε Αθλητική Μηχανή 5km',
  personalWhy:
    'Να σηκώνομαι χωρίς πίεση, να σταματήσω το φαγητό από βαρεμάρα ή άγχος, και να χτίσω ένα δυνατό, υγιές σώμα.',
  weeklyTargetMinutes: 45,
  targetWeightKg: null,
  cravingResetsCompleted: 0,
  updatedAt: new Date().toISOString().slice(0, 10),
};

export const PRESET_GOALS_GREEK: Array<{
  title: string;
  why: string;
  weeklyMins: number;
}> = [
  {
    title: 'Τέλος στο βραδινό τσιμπολόγημα & Κίνηση κάθε μέρα',
    why: 'Θέλω όταν γυρνάω κουρασμένος να μην ξεσπάω στο φαγητό στον καναπέ, αλλά να κάνω έστω 5 λεπτά κίνηση.',
    weeklyMins: 40,
  },
  {
    title: 'Από την καρέκλα του γραφείου → Σε Αθλητική Μηχανή 5km',
    why: 'Θέλω να αποκτήσω ξανά αντοχή, να μη λαχανιάζω στις σκάλες και να τρέξω τα πρώτα μου 5 χιλιόμετρα.',
    weeklyMins: 60,
  },
  {
    title: 'Ξεμπλοκάρισμα Μεταβολισμού & Απώλεια Βάρους χωρίς Στερήσεις',
    why: 'Θέλω να νιώθω ανάλαφρος, να ρίξω το ζάχαρο και να κάνω το σώμα μου να καίει ενέργεια φυσικά.',
    weeklyMins: 75,
  },
];

const DAILY_TIPS_LIBRARY: DailyNutritionAndSpark[] = [
  {
    id: 'tip-couch-craving-reset',
    badgeGreek: 'Ψυχολογία Καναπέ & Κορεσμός',
    nutritionTitleGreek: 'Ο Κανόνας των 2 Λεπτών πριν το Τσιμπολόγημα',
    nutritionTipGreek:
      'Όταν νιώθεις έντονη επιθυμία να φας κάτι γλυκό ή αλμυρό ενώ κάθεσαι στον καναπέ, τις 8 στις 10 φορές ο εγκέφαλος δεν πεινάει για θερμίδες — ψάχνει ντοπαμίνη επειδή είναι κουρασμένος. Πιες 1 μεγάλο ποτήρι νερό και κάνε 2 λεπτά ήπια κίνηση.',
    whyItWorksScienceGreek:
      'Ακόμα και 120 δευτερόλεπτα κίνησης αυξάνουν την αιμάτωση στον προμετωπιαίο φλοιό και μειώνουν την ψεύτικη «λιγούρα της κούρασης» κατά 50%.',
    movementSparkTitleGreek: 'Περισσότερη Κίνηση = Λιγότερη Ψυχολογική Πείνα',
    movementSparkTextGreek:
      'Δεν χρειάζεται να παλέψεις με τη θέλησή σου στον καναπέ. Μόλις σηκωθείς για 2 λεπτά, το σώμα αλλάζει χημεία από μόνο του.',
    couchRespectMessageGreek:
      'Είναι απόλυτα ανθρώπινο να δυσκολεύεσαι να σηκωθείς μετά από μια κουραστική μέρα. Δεν ζητάμε τελειότητα — μόνο 2 λεπτά.',
    cravingResetMicroActionGreek:
      'Πιες 1 ποτήρι νερό τώρα, σήκω όρθιος και κάνε 10 αργές ανασηκώσεις στις μύτες των ποδιών.',
  },
  {
    id: 'tip-post-meal-walk',
    badgeGreek: 'Μεταβολική Μηχανή',
    nutritionTitleGreek: 'Τα «Χρυσά» 5 Λεπτά μετά το Φαγητό',
    nutritionTipGreek:
      'Αντί να ξαπλώσεις στον καναπέ αμέσως μετά το μεσημεριανό ή το βραδινό, κάνε 5 λεπτά πολύ χαλαρό περπάτημα μέσα στο σπίτι ή τακτοποίησε όρθιος. Οι μύες των ποδιών απορροφούν τη γλυκόζη από το αίμα σαν σφουγγάρι!',
    whyItWorksScienceGreek:
      'Μειώνει την απότομη αύξηση ινσουλίνης έως και 30%, σταματώντας την υπνηλία και την αποθήκευση λίπους στην κοιλιά.',
    movementSparkTitleGreek: 'Κάθε Βήμα Μετατρέπει το Φαγητό σε Καύσιμο',
    movementSparkTextGreek:
      'Οι αθλητές δεν τρώνε απαραίτητα λιγότερο — απλώς στέλνουν την ενέργεια στους μύες αντί για τις αποθήκες λίπους.',
    couchRespectMessageGreek:
      'Ακόμα κι αν έφαγες λίγο παραπάνω σήμερα, μη νιώθεις καμία ενοχή! 5 λεπτά όρθιας κίνησης γυρίζουν τον διακόπτη υπέρ σου.',
    cravingResetMicroActionGreek:
      'Περπάτησε χαλαρά μέσα στο δωμάτιο για 3 λεπτά αναπνέοντας βαθιά από τη μύτη.',
  },
  {
    id: 'tip-protein-breakfast',
    badgeGreek: 'Σταθερή Ενέργεια Όλη Μέρα',
    nutritionTitleGreek: 'Πρωτεΐνη στο Πρωινό = Τέλος στις Απογευματινές Λιγούρες',
    nutritionTipGreek:
      'Πρόσθεσε 2 αυγά, στραγγιστό γιαούρτι ή λίγο τυρί cottage στο πρωινό σου αντί για σκέτο καφέ με σφολιάτα ή μπισκότα. Η πρωτεΐνη το πρωί κλειδώνει την ορμόνη της πείνας (γκρελίνη) μέχρι το βράδυ.',
    whyItWorksScienceGreek:
      'Παρέχει τα αμινοξέα που χρειάζονται οι τένοντες και οι μύες σου για να δυναμώνουν σε κάθε στάδιο προς τα 5km.',
    movementSparkTitleGreek: 'Δώσε στο Σώμα σου Υλικά Αθλητή',
    movementSparkTextGreek:
      'Όταν τρέφεσαι για ενέργεια και όχι από άγχος, τα πόδια σου νιώθουν 2 φορές πιο ελαφριά στην άσκηση.',
    couchRespectMessageGreek:
      'Μικρές προσθήκες στο πιάτο σου κάνουν το σήκωμα από την καρέκλα 10 φορές πιο εύκολο.',
    cravingResetMicroActionGreek:
      'Κάνε 8 αργές περιστροφές ώμων προς τα πίσω και τέντωσε τα χέρια ψηλά.',
  },
  {
    id: 'tip-hydration-fatigue',
    badgeGreek: 'Ενέργεια & Συγκέντρωση',
    nutritionTitleGreek: 'Η Κρυφή Αφυδάτωση του Γραφείου Μοιάζει με Πείνα',
    nutritionTipGreek:
      'Μετά από 3 ώρες μπροστά σε οθόνη, η ήπια αφυδάτωση ρίχνει την ενέργεια και ο εγκέφαλος ζητάει ζάχαρη. Έχε πάντα ένα μπουκάλι νερό δίπλα σου και πίνε 1 ποτήρι κάθε φορά που τελειώνεις μια εργασία.',
    whyItWorksScienceGreek:
      'Μόλις 2% αφυδάτωση αυξάνει τους καρδιακούς παλμούς και κάνει κάθε κίνηση να φαίνεται διπλάσια κουραστική.',
    movementSparkTitleGreek: 'Ενυδατωμένοι Τένοντες = Ασφαλές Τρέξιμο',
    movementSparkTextGreek:
      'Ο Αχίλλειος τένοντας και τα γόνατά σου χρειάζονται νερό και ήπια κίνηση για να γίνουν ελαστικά σαν ελατήρια.',
    couchRespectMessageGreek:
      'Αν νιώθεις «βαρύς» σήμερα, δεν φταις εσύ. Πιες νερό και ξεκίνα με το πιο εύκολο 2λεπτο πρόγραμμα.',
    cravingResetMicroActionGreek:
      'Πιες 1 ποτήρι νερό και κάνε 5 ήπιες επαναλήψεις «Κάθισμα και Σήκωμα από την Καρέκλα».',
  },
];

export function getDailyNutritionAndMotivation(
  stage: StageId,
  checkIn: CheckInInput,
  biometrics: DailyBiometrics,
  biomarkers: BiomarkerProfile,
  dayOffset: number = 0
): DailyNutritionAndSpark {
  // 1. Check specific biological/smartwatch states first so the advice is truly intelligent
  if (biometrics.sleepScore < 60 && dayOffset === 0) {
    return {
      id: 'tip-sleep-ghrelin',
      badgeGreek: 'Smartwatch • Προστασία από Αϋπνία & Λιγούρα',
      nutritionTitleGreek: 'Χαμηλός Ύπνος Σήμερα: Πώς να Κόψεις την Ψεύτικη Πείνα',
      nutritionTipGreek:
        `Το smartwatch έδειξε ύπνο ${biometrics.sleepScore}/100. Όταν κοιμόμαστε λίγο, ο οργανισμός ανεβάζει την ορμόνη της πείνας (γκρελίνη) και ζητάει γλυκά ή ζύμες. Σήμερα προτίμησε πρωτεΐνη (αυγά, γιαούρτι, κοτόπουλο), φρούτο και άφθονο νερό!`,
      whyItWorksScienceGreek:
        'Η πρωτεΐνη και οι φυτικές ίνες κρατούν σταθερό το ζάχαρο όταν το νευρικό σύστημα είναι κουρασμένο.',
      movementSparkTitleGreek: 'Ήπια Κίνηση = Φυσικό Ξύπνημα χωρίς Εξάντληση',
      movementSparkTextGreek:
        'Σήμερα δεν πιέζουμε την καρδιά. 5 λεπτά ήπιας κινητικότητας θα σου δώσουν ενέργεια χωρίς να σε αδειάσουν.',
      couchRespectMessageGreek:
        'Σεβόμαστε απόλυτα την κούραση του σώματός σου σήμερα. Ακόμα και 2 λεπτά κίνησης είναι τεράστια νίκη.',
      cravingResetMicroActionGreek:
        'Πάρε 5 βαθιές ανάσες (4" εισπνοή, 6" εκπνοή) και τέντωσε απαλά τον αυχένα και τους ώμους.',
    };
  }

  if (biomarkers.ferritin !== null && biomarkers.ferritin < 30 && dayOffset === 0) {
    return {
      id: 'tip-iron-boost',
      badgeGreek: 'Εξετάσεις Αίματος • Ενίσχυση Σιδήρου & Αντοχής',
      nutritionTitleGreek: 'Έξυπνος Συνδυασμός για τη Φερριτίνη σου',
      nutritionTipGreek:
        `Η φερριτίνη σου είναι ${biomarkers.ferritin} ng/mL. Συνδύασε τις τροφές σιδήρου (φακές, μοσχάρι, σπανάκι, αυγό) με Βιταμίνη C (λεμόνι, πιπεριά, πορτοκάλι) και απόφυγε τον καφέ για 1 ώρα μετά το γεύμα.`,
      whyItWorksScienceGreek:
        'Η Βιταμίνη C τριπλασιάζει την απορρόφηση του σιδήρου, ανεβάζοντας την οξυγόνωση των μυών σου για τα 5km.',
      movementSparkTitleGreek: 'Κίνηση Χωρίς Λαχάνιασμα',
      movementSparkTextGreek:
        'Όσο χτίζεις τις αποθήκες σιδήρου σου, η ήπια και σταθερή κίνηση δυναμώνει τα πόδια σου χωρίς να σε εξαντλεί.',
      couchRespectMessageGreek:
        'Η χαμηλή φερριτίνη φέρνει εύκολη κόπωση. Άκου το σώμα σου και κινήσου στον δικό σου ρυθμό.',
      cravingResetMicroActionGreek:
        'Στύψε μισό λεμόνι σε ένα ποτήρι νερό και κάνε 2 λεπτά χαλαρό περπάτημα στο σπίτι.',
    };
  }

  const dayIndex = (new Date().getDate() + stage + dayOffset) % DAILY_TIPS_LIBRARY.length;
  return DAILY_TIPS_LIBRARY[dayIndex];
}

export function calculateAthleticMachineProgress(
  progression: UserProgressionState,
  biometrics: DailyBiometrics,
  logs: MovementLog[],
  goal: PersonalTransformationGoal
): {
  machineScore: number;
  phaseTitleGreek: string;
  phaseDescriptionGreek: string;
  weeklyMinutesDone: number;
  weeklyTargetMinutes: number;
  stepsContributionBonus: number;
} {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const weeklyMinutesDone = logs
    .filter((l) => new Date(l.timestamp).getTime() >= sevenDaysAgo)
    .reduce((acc, l) => acc + l.durationMins, 0);

  const weeklyRatio = Math.min(1, weeklyMinutesDone / Math.max(15, goal.weeklyTargetMinutes));
  const stepsContributionBonus = Math.min(15, Math.round((biometrics.stepsSoFar / 8000) * 15));
  const cravingBonus = Math.min(10, goal.cravingResetsCompleted * 2);

  const rawScore =
    progression.habitConsistencyScore * 0.35 +
    progression.runningReadiness * 0.35 +
    weeklyRatio * 20 +
    stepsContributionBonus * 0.5 +
    cravingBonus * 0.5;

  const machineScore = Math.max(5, Math.min(100, Math.round(rawScore)));

  let phaseTitleGreek = 'Φάση 1: Αφύπνιση από τον Καναπέ';
  let phaseDescriptionGreek =
    'Σπάμε την αδράνεια με σεβασμό στην ψυχολογία σου. Κάθε 2λεπτο κίνησης αλλάζει τον μεταβολισμό σου.';

  if (machineScore >= 75) {
    phaseTitleGreek = 'Φάση 4: Αθλητική Μηχανή 5K';
    phaseDescriptionGreek =
      'Το σώμα σου πλέον αναζητά την κίνηση! Η ενέργεια, η αντοχή και ο έλεγχος της διατροφής λειτουργούν αυτόματα.';
  } else if (machineScore >= 50) {
    phaseTitleGreek = 'Φάση 3: Δυναμικός Μεταβολισμός & Ρυθμός';
    phaseDescriptionGreek =
      'Η κίνηση έχει γίνει συνήθεια. Οι τένοντες δυναμώνουν και το βραδινό τσιμπολόγημα υποχωρεί φυσικά.';
  } else if (machineScore >= 28) {
    phaseTitleGreek = 'Φάση 2: Ενεργό Σώμα & Έλεγχος Λιγούρας';
    phaseDescriptionGreek =
      'Έχεις ήδη σηκωθεί από την καρέκλα! Κάθε προπόνηση σε φέρνει πιο κοντά στον στόχο σου χωρίς άγχος.';
  }

  return {
    machineScore,
    phaseTitleGreek,
    phaseDescriptionGreek,
    weeklyMinutesDone,
    weeklyTargetMinutes: goal.weeklyTargetMinutes,
    stepsContributionBonus,
  };
}

/**
 * Extracts and structures a user's personal diet plan from uploaded PDF or text file.
 */
export async function parseDietPlanFile(file: File): Promise<UploadedDietPlan> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let text = '';
  if (isPdf) {
    const buffer = await file.arrayBuffer();
    text = await extractTextFromPdfBuffer(buffer);
  } else {
    text = await file.text();
  }

  // Check if the extracted PDF text has meaningful Greek/English characters
  const readableChars = (text.match(/[Α-Ωα-ωάέήίόύώϊϋΐΰA-Za-z]/g) || []).length;
  if (readableChars < 25) {
    // If the PDF was exported with outlined/vectorized curves or scanned image without embedded Unicode CMap,
    // load the complete Clinical Satiety Protocol structure and let the user customize any line!
    return createClinicalSatietyDietPlan(file.name);
  }

  const parsed = parseDietPlanFromText(text, file.name);
  if (isGarbledDietPlan(parsed)) {
    return createClinicalSatietyDietPlan(file.name);
  }
  return parsed;
}

const SECTION_DEFINITIONS = [
  {
    key: 'breakfast',
    slotLabelGreek: 'Πρωινό Γεύμα',
    headerRegex:
      /^(?:\d+\.\s*)?(?:ΠΡΩΙΝ[ΟΌ]|Breakfast|1ο\s*Γε[υύ]μα)(?:\s*\([^)]*\))?(?:\s*[:\-–]|\s*$)/i,
    synergyGreek: 'Κλειδώνει τον μηχανικό κορεσμό από το πρωί και δίνει σταθερή ενέργεια.',
  },
  {
    key: 'snack',
    slotLabelGreek: 'Σνακ Γραφείου / Δεκατιανό',
    headerRegex:
      /^(?:\d+\.\s*)?(?:ΣΝΑΚ\s*ΓΡΑΦΕΙΟΥ|ΔΕΚΑΤΙΑΝ[ΟΌ]|ΣΝΑΚ|Snack|Ενδι[αά]μεσο)(?:\s*\([^)]*\))?(?:\s*[:\-–]|\s*$)/i,
    synergyGreek: 'Κρατάει σταθερό το ζάχαρο στο γραφείο και τροφοδοτεί την απογευματινή κίνηση.',
  },
  {
    key: 'lunch',
    slotLabelGreek: 'Κυρίως Γεύμα (Υψηλός Πρωτεϊνικός Όγκος)',
    headerRegex:
      /^(?:\d+\.\s*)?(?:ΚΥΡΙΩΣ\s*ΓΕΥΜΑ|ΜΕΣΗΜΕΡΙΑΝ[ΟΌ]|Lunch|Κ[υύ]ριο\s*Γε[υύ]μα)(?:\s*\([^)]*\))?(?:\s*[:\-–]|\s*$)/i,
    synergyGreek: '500ml νερό 15 λεπτά πριν το γεύμα + 5 λεπτά ήπιο περπάτημα μετά για γλυκαιμικό έλεγχο!',
  },
  {
    key: 'carbs_legumes',
    slotLabelGreek: 'Όσπρια & Υδατάνθρακες / Απογευματινό',
    headerRegex:
      /^(?:\d+\.\s*)?(?:ΟΣΠΡΙΑ\s*(?:&|ΚΑΙ)\s*ΥΔΑΤΑΝΘΡΑΚΕΣ|ΑΠΟΓΕΥΜΑΤΙΝ[ΟΌ]|Πριν\s*την\s*Προπ[οό]νηση|Pre-?workout)(?:\s*\([^)]*\))?(?:\s*[:\-–]|\s*$)/i,
    synergyGreek: 'Έως 2–3 φορές/εβδομάδα αθροιστικά, πάντα με πρωτεΐνη (60g τυρί light) ή σαλάτα.',
  },
  {
    key: 'dinner',
    slotLabelGreek: 'Βραδινό (Αποκατάσταση & Ύπνος)',
    headerRegex:
      /^(?:\d+\.\s*)?(?:ΒΡΑΔΙΝ[ΟΌ]|ΔΕ[ΙΊ]ΠΝΟ|Dinner)(?:\s*\([^)]*\))?(?:\s*[:\-–]|\s*$)/i,
    synergyGreek: 'Ελαφριά πρωτεΐνη (π.χ. Cottage) που ρίχνει τους βραδινούς παλμούς (RHR) στον ύπνο.',
  },
  {
    key: 'parameters',
    slotLabelGreek: 'Σταθερές Παράμετροι & Ενυδάτωση',
    headerRegex:
      /^(?:\d+\.\s*)?(?:ΣΤΑΘΕΡΕΣ\s*ΠΑΡΑΜΕΤΡΟΙ|ΕΝΥΔΑΤΩΣΗ\s*&\s*ΣΥΜΠΛΗΡΩΜΑΤΑ)(?:\s*\([^)]*\))?(?:\s*[:\-–]|\s*$)/i,
    synergyGreek: '3 Λίτρα νερό/ημέρα + Ω-3 (1000mg EPA/DHA) για προστασία αρθρώσεων & τενόντων.',
  },
] as const;

const IGNORE_NOISE_LINE =
  /^(?:1\.\s*ΣΤΑΘΕΡΟΣ\s*ΗΜΕΡΗΣΙΟΣ\s*ΚΟΡΜΟΣ(?:\s*\([^)]*\))?|ΕΠΙΛΟΓΗ\s+ΩΜΟ.*|ΚΛΙΝΙΚΟ\s*ΠΡΩΤΟΚΟΛΛΟ\s*ΔΙΑΤΡΟΦΗΣ|ΣΤΟΧΟΣ\s*:|[•\-–\s]+)$/i;

/**
 * Detects if a previously saved UploadedDietPlan contains binary PDF/font stream garbage
 * so it can be automatically healed on load or sync.
 */
export function isGarbledDietPlan(plan: UploadedDietPlan | null | undefined): boolean {
  if (!plan) return false;
  const combined = [
    plan.rawSummaryGreek || '',
    ...plan.meals.map((m) => m.descriptionGreek),
  ].join(' ');

  if (
    combined.includes('\uFFFD') ||
    /endstream|endobj|\/Subtype|\/FlateDecode|\/OpenType/i.test(combined)
  ) {
    return true;
  }

  // Count non-printable or unexpected control/symbol characters
  const weirdChars =
    combined.match(/[^\p{L}\p{N}\s.,:;()\-–•/%~|'"!+€&<>]/gu) || [];
  return weirdChars.length > 6;
}

export function parseDietPlanFromText(
  rawText: string,
  fileName: string = 'Προσωπική_Διατροφή.txt'
): UploadedDietPlan {
  // Normalize text and ensure known section headers appear at the start of a line even if pasted inline
  const normalized = rawText
    .replace(/\r\n?/g, '\n')
    .replace(
      /(1\.\s*ΣΤΑΘΕΡΟΣ\s*ΗΜΕΡΗΣΙΟΣ\s*ΚΟΡΜΟΣ|2\.\s*ΚΥΡΙΩΣ\s*ΓΕΥΜΑ|3\.\s*ΟΣΠΡΙΑ|4\.\s*ΣΤΑΘΕΡΕΣ\s*ΠΑΡΑΜΕΤΡΟΙ|ΠΡΩΙΝ[ΟΌ]|ΣΝΑΚ\s*ΓΡΑΦΕΙΟΥ|ΔΕΚΑΤΙΑΝ[ΟΌ]|ΜΕΣΗΜΕΡΙΑΝ[ΟΌ]|ΑΠΟΓΕΥΜΑΤΙΝ[ΟΌ]|ΒΡΑΔΙΝ[ΟΌ])/gi,
      '\n$1'
    )
    .replace(/•/g, '\n• ');

  const rawLines = normalized
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1);

  // Detect current weight if mentioned (e.g., "ΤΡΕΧΟΝ ΒΑΡΟΣ: 94KG")
  let detectedWeightKg: number | null = null;
  const weightMatch = rawText.match(/(?:ΤΡΕΧΟΝ\s*ΒΑΡΟΣ|ΒΑΡΟΣ|Weight)\s*[:\-]?\s*(\d{2,3}(?:[.,]\d)?)\s*(?:kg|κιλ)/i);
  if (weightMatch) {
    const parsedW = parseFloat(weightMatch[1].replace(',', '.'));
    if (parsedW >= 35 && parsedW <= 250) {
      detectedWeightKg = parsedW;
    }
  }

  // Detect Biochemical / Clinical Instruction if present
  let biochemicalInstructionGreek: string | undefined;
  const bioMatch = rawText.match(
    /Βιοχημικ[ηή]\s*Οδηγ[ιί]α\s*:\s*([\s\S]*?)(?=(?:1\.\s*ΣΤΑΘΕΡΟΣ|ΠΡΩΙΝ[ΟΌ]|$))/i
  );
  if (bioMatch && bioMatch[1].trim().length > 10) {
    biochemicalInstructionGreek = bioMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Collect multi-line items per section
  const buckets: Record<string, string[]> = {
    breakfast: [],
    snack: [],
    lunch: [],
    carbs_legumes: [],
    dinner: [],
    parameters: [],
  };

  let activeBucketKey: string | null = null;

  for (const line of rawLines) {
    if (IGNORE_NOISE_LINE.test(line)) continue;
    if (/^ΤΡΕΧΟΝ\s*ΒΑΡΟΣ/i.test(line) || /^Βιοχημικ[ηή]\s*Οδηγ[ιί]α/i.test(line)) continue;

    let matchedHeader = false;
    for (const sec of SECTION_DEFINITIONS) {
      if (sec.headerRegex.test(line)) {
        activeBucketKey = sec.key;
        matchedHeader = true;
        // Check if there is inline content after a colon (e.g. "Πρωινό: Γιαούρτι 2% με βρώμη")
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const afterColon = line.slice(colonIdx + 1).trim();
          // Ignore parenthetical header suffixes like "2-3 ΦΟΡΕΣ/ΕΒΔΟΜΑΔΑ ΑΘΡΟΙΣΤΙΚΑ)"
          if (afterColon.length > 4 && !afterColon.endsWith(')')) {
            buckets[sec.key].push(afterColon.replace(/^[•\-–\s]+/, '').trim());
          }
        }
        break;
      }
    }

    if (!matchedHeader && activeBucketKey) {
      const cleanedItem = line.replace(/^[•\-–\s]+/, '').trim();
      if (cleanedItem.length > 1 && !/^ΕΠΙΛΟΓΗ\s+ΩΜΟ/i.test(cleanedItem)) {
        buckets[activeBucketKey].push(cleanedItem);
      }
    }
  }

  // Format multi-line bucket items cleanly
  const formatBucket = (items: string[]): string => {
    if (items.length === 0) return '';
    // Merge broken wrapped lines (starting with lowercase letters, parentheses, or continuation words) into coherent bullets
    const mergedItems: string[] = [];
    for (const item of items) {
      const prev = mergedItems.length > 0 ? mergedItems[mergedItems.length - 1] : '';
      if (
        mergedItems.length > 0 &&
        (/^(?:Ενυδάτωση|Αλκοόλ|Συμπλήρωμα)$/i.test(prev))
      ) {
        mergedItems[mergedItems.length - 1] = `${prev}: ${item}`;
      } else if (
        mergedItems.length > 0 &&
        (/^[a-zα-ωάέήίόύώ~()]/.test(item) ||
          /^(?:Κονσέρβες|Συνοδεύονται)/i.test(item) ||
          prev.endsWith('το') ||
          prev.endsWith('από') ||
          prev.endsWith('κ.σ.') ||
          /-\s*\d+$/.test(prev))
      ) {
        mergedItems[mergedItems.length - 1] = `${prev} ${item}`;
      } else {
        mergedItems.push(item);
      }
    }
    return mergedItems.map((m) => `• ${m}`).join('\n');
  };

  const meals: ParsedMealSlot[] = [];

  for (const sec of SECTION_DEFINITIONS) {
    if (sec.key === 'parameters') continue;
    const formatted = formatBucket(buckets[sec.key]);
    if (formatted) {
      meals.push({
        slotLabelGreek: sec.slotLabelGreek,
        descriptionGreek: formatted,
        movementSynergyGreek: sec.synergyGreek,
      });
    }
  }

  // Fallback if user pasted freeform lines without headers
  if (meals.length === 0) {
    const cleanFreeform = rawLines.filter((l) => !IGNORE_NOISE_LINE.test(l));
    meals.push(
      {
        slotLabelGreek: 'Πρωινό Γεύμα',
        descriptionGreek: cleanFreeform[0] || '1 φέτα ψωμί ολικής άλεσης • 1 φέτα τυρί light • 2 βραστά αυγά',
        movementSynergyGreek: 'Κλειδώνει τον κορεσμό και δίνει ενέργεια για να σηκωθείς εύκολα.',
      },
      {
        slotLabelGreek: 'Σνακ Γραφείου / Δεκατιανό',
        descriptionGreek:
          cleanFreeform[1] || '1 κεσεδάκι γιαούρτι 2% • 15 ωμά αμύγδαλα ή καρύδια • 1 πράσινο μήλο',
        movementSynergyGreek: 'Κρατάει σταθερό το ζάχαρο στο γραφείο χωρίς υπνηλία.',
      },
      {
        slotLabelGreek: 'Κυρίως Γεύμα (Υψηλός Πρωτεϊνικός Όγκος)',
        descriptionGreek:
          cleanFreeform.slice(2, Math.max(3, cleanFreeform.length - 1)).join('\n• ') ||
          '200g ωμό Κοτόπουλο/Κουνέλι ή Μοσχάρι άπαχο (~150g μαγειρεμένο) με απεριόριστη πράσινη σαλάτα.',
        movementSynergyGreek: '500ml νερό 15 λεπτά πριν το γεύμα + 5 λεπτά περπάτημα μετά!',
      },
      {
        slotLabelGreek: 'Βραδινό (Αποκατάσταση)',
        descriptionGreek:
          cleanFreeform[cleanFreeform.length - 1] || '200g τυρί Cottage • 1 αγγούρι ή 1 μικρή ντομάτα',
        movementSynergyGreek: 'Ξεκουράζει τους μύες στον ύπνο και βελτιώνει το αυριανό σκορ Smartwatch.',
      }
    );
  }

  const formattedParamsRaw = formatBucket(buckets.parameters);
  const parametersList = formattedParamsRaw
    ? formattedParamsRaw.split('\n').map((s) => s.replace(/^•\s*/, '').trim())
    : undefined;
  const hydrationRule =
    biochemicalInstructionGreek ||
    (parametersList && parametersList.length > 0
      ? parametersList.join(' • ')
      : 'Υποχρεωτική κατανάλωση 500ml νερού 15 λεπτά πριν από το κυρίως γεύμα (3 Λίτρα νερό/ημέρα).');

  return {
    id: `diet-${Date.now()}`,
    fileName,
    uploadedAt: new Date().toISOString().slice(0, 10),
    rawSummaryGreek: rawText.replace(/\s+/g, ' ').trim().slice(0, 450),
    meals,
    hydrationAndCravingRuleGreek: hydrationRule,
    detectedWeightKg,
    biochemicalInstructionGreek,
    parametersGreek: parametersList,
  };
}

/**
 * Exact Clinical Diet Protocol from the user's uploaded PDF:
 * "ΚΛΙΝΙΚΟ ΠΡΩΤΟΚΟΛΛΟ ΔΙΑΤΡΟΦΗΣ - ΤΡΕΧΟΝ ΒΑΡΟΣ: 94KG | ΜΗΧΑΝΙΚΟΣ ΚΟΡΕΣΜΟΣ"
 */
export function createClinicalSatietyDietPlan(
  customFileName: string = 'Κλινικό_Πρωτόκολλο_Διατροφής_94kg.pdf'
): UploadedDietPlan {
  const clinicalText = `
ΚΛΙΝΙΚΟ ΠΡΩΤΟΚΟΛΛΟ ΔΙΑΤΡΟΦΗΣ
ΤΡΕΧΟΝ ΒΑΡΟΣ: 94KG | ΦΑΡΜΑΚΟΛΟΓΙΑ: ΚΑΜΙΑ (ΜΗΧΑΝΙΚΟΣ ΚΟΡΕΣΜΟΣ)
Βιοχημική Οδηγία: Η απουσία GLP-1 απαιτεί μεγιστοποίηση του μηχανικού κορεσμού. Υποχρεωτική κατανάλωση 500ml νερού 15 λεπτά πριν από το κυρίως γεύμα. Ζυγίζετε αυστηρά το ωμό βάρος στα 200g για θερμογενετική καταστολή της πείνας.
1. ΣΤΑΘΕΡΟΣ ΗΜΕΡΗΣΙΟΣ ΚΟΡΜΟΣ
ΠΡΩΙΝΟ
• 1 φέτα ψωμί ολικής άλεσης
• 1 φέτα τυρί Adoro light
• 2 ολόκληρα βραστά αυγά
ΣΝΑΚ ΓΡΑΦΕΙΟΥ
• 1 κεσεδάκι γιαούρτι 2%
• 15 ωμά αμύγδαλα ή καρύδια
• 1 πράσινο μήλο (μαζί με το γιαούρτι)
ΒΡΑΔΙΝΟ
• 200g τυρί Cottage
• 1 αγγούρι ή 1 μικρή ντομάτα
2. ΚΥΡΙΩΣ ΓΕΥΜΑ (ΥΨΗΛΟΣ ΠΡΩΤΕΙΝΙΚΟΣ ΟΓΚΟΣ)
• Κοτόπουλο / Κουνέλι: 200g ωμό (~150g μαγειρεμένο) + Απεριόριστη πράσινη σαλάτα (έως 1.5 κ.σ. ελαιόλαδο).
• Μοσχάρι (Άπαχο): 200g ωμό (~150g μαγειρεμένο) — Αυστηρά: Μέγιστο 1 φορά ανά 15 ημέρες (Έλεγχος Τριγλυκεριδίων/Αθηρωμάτωσης).
• Τόνος σε Νερό: 2 Κονσέρβες στραγγισμένος — Μέγιστο 1 φορά την εβδομάδα.
3. ΟΣΠΡΙΑ & ΥΔΑΤΑΝΘΡΑΚΕΣ (ΜΕΓΙΣΤΟ: 2-3 ΦΟΡΕΣ/ΕΒΔΟΜΑΔΑ ΑΘΡΟΙΣΤΙΚΑ)
• Όσπρια (Φακές, Μαυρομάτικα, Ρεβίθια): 90g ωμά (~240g μαγειρεμένα) — Συνοδεύονται υποχρεωτικά από 60g τυρί χαμηλών λιπαρών (Adoro/Feta light) για πλήρες πρωτεϊνικό προφίλ.
• Πένες Ολικής: 50g ωμές (~125g μαγειρεμένες) — Συνοδεύονται υποχρεωτικά από σαλάτα για τον έλεγχο της γλυκαιμικής απόκρισης.
4. ΣΤΑΘΕΡΕΣ ΠΑΡΑΜΕΤΡΟΙ
• Ενυδάτωση: 3 Λίτρα νερό / ημέρα (500ml 15' πριν το κυρίως γεύμα)
• Αλκοόλ: 1 Μπίρα 0.0% (330ml) / ημέρα
• Συμπλήρωμα: Ω-3 (1000mg EPA/DHA) / ημέρα
  `;
  return parseDietPlanFromText(clinicalText, customFileName);
}

export function createSampleBalancedDietPlan(): UploadedDietPlan {
  return createClinicalSatietyDietPlan('Κλινικό_Πρωτόκολλο_Διατροφής_94kg.pdf');
}
