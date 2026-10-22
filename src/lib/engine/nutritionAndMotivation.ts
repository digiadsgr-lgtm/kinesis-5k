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
  return parseDietPlanFromText(text, file.name);
}

export function parseDietPlanFromText(
  rawText: string,
  fileName: string = 'Προσωπική_Διατροφή.txt'
): UploadedDietPlan {
  const clean = rawText.replace(/\r/g, '\n').trim();
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const extractSection = (keywords: RegExp, fallback: string): string => {
    for (let i = 0; i < lines.length; i++) {
      if (keywords.test(lines[i])) {
        const inlinePart = lines[i].replace(keywords, '').replace(/^[:\-–•\s]+/, '').trim();
        if (inlinePart.length > 5) return inlinePart;
        if (i + 1 < lines.length) return lines[i + 1];
      }
    }
    return fallback;
  };

  const breakfast = extractSection(
    /^(?:πρωιν[οό]|breakfast|1ο\s*γε[υύ]μα)/i,
    lines[0] || 'Πρωτεΐνη (αυγά ή γιαούρτι με βρώμη) για σταθερή ενέργεια χωρίς λιγούρες.'
  );
  const snack1 = extractSection(
    /^(?:δεκατιαν[οό]|σνακ|snack|ενδι[αά]μεσο)/i,
    lines[1] || '1 φρούτο εποχής με 10 αμύγδαλα ή καρύδια.'
  );
  const lunch = extractSection(
    /^(?:μεσημεριαν[οό]|lunch|κ[υύ]ριο\s*γε[υύ]μα)/i,
    lines[2] || 'Άπαχη πρωτεΐνη (κοτόπουλο, ψάρι ή όσπρια) με μεγάλη σαλάτα και ελαιόλαδο.'
  );
  const preWorkout = extractSection(
    /^(?:απογευματιν[οό]|πριν\s*την\s*προπ[οό]νηση|pre-?workout)/i,
    lines[3] || '1 μπανάνα ή γιαούρτι 45 λεπτά πριν την κίνηση για ξεκούραστα πόδια.'
  );
  const dinner = extractSection(
    /^(?:βραδιν[οό]|dinner|δ[εέ]ιπνο)/i,
    lines[4] || 'Ελαφρύ γεύμα με πρωτεΐνη και λαχανικά (π.χ. ομελέτα ή σαλάτα με τόνο/κοτόπουλο).'
  );

  const meals: ParsedMealSlot[] = [
    {
      slotLabelGreek: 'Πρωινό Γεύμα',
      descriptionGreek: breakfast,
      movementSynergyGreek: 'Κλειδώνει τον κορεσμό και δίνει ενέργεια για να σηκωθείς εύκολα.',
    },
    {
      slotLabelGreek: 'Δεκατιανό / Ενδιάμεσο',
      descriptionGreek: snack1,
      movementSynergyGreek: 'Κρατάει σταθερό το ζάχαρο στο γραφείο χωρίς υπνηλία.',
    },
    {
      slotLabelGreek: 'Μεσημεριανό Γεύμα',
      descriptionGreek: lunch,
      movementSynergyGreek: 'Συνδύασέ το με 5 λεπτά χαλαρό περπάτημα μετά το φαγητό!',
    },
    {
      slotLabelGreek: 'Απογευματινό (Καύσιμο Κίνησης)',
      descriptionGreek: preWorkout,
      movementSynergyGreek: 'Δίνει άμεση ενέργεια για την άσκηση της ημέρας και κόβει τη βραδινή πείνα.',
    },
    {
      slotLabelGreek: 'Βραδινό (Αποκατάσταση)',
      descriptionGreek: dinner,
      movementSynergyGreek: 'Ξεκουράζει τους μύες στον ύπνο και βελτιώνει το αυριανό σκορ Smartwatch.',
    },
  ];

  return {
    id: `diet-${Date.now()}`,
    fileName,
    uploadedAt: new Date().toISOString().slice(0, 10),
    rawSummaryGreek: clean.slice(0, 400),
    meals,
    hydrationAndCravingRuleGreek:
      'Πιες 1 ποτήρι νερό πριν από κάθε γεύμα. Αν νιώσεις λιγούρα στον καναπέ το βράδυ, κάνε πρώτα 2 λεπτά ήπιας κίνησης.',
  };
}

export function createSampleBalancedDietPlan(): UploadedDietPlan {
  const sampleText = `
Πρωινό: Στραγγιστό γιαούρτι 2% με 3 κουταλιές βρώμη, λίγη κανέλα και 1 κουταλάκι μέλι (ή 2 αυγά με 1 φέτα προζυμένιο ψωμί).
Δεκατιανό: 1 μήλο ή αχλάδι + 10 ωμά αμύγδαλα + 1 ποτήρι νερό.
Μεσημεριανό: Ψητό κοτόπουλο ή ψάρι ή φακές με ρύζι, μεγάλη πράσινη σαλάτα με 1 κουταλιά ελαιόλαδο και λεμόνι.
Απογευματινό: 1 μικρή μπανάνα ή 2 κράκερ σίκαλης με cottage cheese (ιδανικό 30-45 λεπτά πριν την κίνηση).
Βραδινό: Ομελέτα με 2 αυγά, μανιτάρια και πιπεριές ή τονοσαλάτα, ώστε να ξυπνήσεις ανάλαφρος με τέλειο ύπνο στο Smartwatch.
  `;
  return parseDietPlanFromText(sampleText, 'Πλάνο_Αθλητικής_Μηχανής_Χωρίς_Πείνα.txt');
}
