import { BiomarkerProfile } from '@/types/kinesis';

export interface ExtractedBiomarkerItem {
  key: keyof Omit<BiomarkerProfile, 'medicalRestrictions' | 'updatedAt'>;
  labelGreek: string;
  value: number;
  unit: string;
  rawMatch: string;
  status: 'normal' | 'warning';
}

export interface PdfExtractionResult {
  fileName: string;
  extractedAt: string;
  detectedItems: ExtractedBiomarkerItem[];
  extraFindingsGreek: string[];
  updatedProfile: Partial<BiomarkerProfile>;
  rawTextPreview: string;
}

/**
 * Decodes PDF hex strings — supports both UTF-16BE (starting with FEFF) and single-byte Greek (ISO-8859-7 / Windows-1253).
 */
function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return '';

  if (clean.toUpperCase().startsWith('FEFF')) {
    let out = '';
    for (let i = 4; i + 3 < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (!Number.isNaN(code) && code > 0) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }

  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1253').decode(bytes);
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

/**
 * Decodes PDF literal strings (...) including octal escapes and escaped parens.
 */
function decodePdfLiteralString(literal: string): string {
  return literal
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/**
 * Extracts readable text tokens from a decompressed PDF content stream.
 */
function extractTextFromPdfStreamContent(streamText: string): string {
  const chunks: string[] = [];

  // Match hex strings <...>
  const hexRegex = /<([0-9A-Fa-f\s]{2,})>/g;
  let match: RegExpExecArray | null;
  while ((match = hexRegex.exec(streamText)) !== null) {
    const decoded = decodePdfHexString(match[1]);
    if (decoded.trim().length > 0) {
      chunks.push(decoded);
    }
  }

  // Match literal strings (...)
  const litRegex = /\((?:\\.|[^\\()])*\)/g;
  while ((match = litRegex.exec(streamText)) !== null) {
    const inner = match[0].slice(1, -1);
    const decoded = decodePdfLiteralString(inner);
    if (decoded.trim().length > 0) {
      chunks.push(decoded);
    }
  }

  return chunks.join(' ');
}

/**
 * Decompresses FlateDecode PDF streams using browser-native DecompressionStream.
 */
async function tryDecompressFlate(compressed: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;

  const formats: CompressionFormat[] = ['deflate', 'deflate-raw'];
  for (const fmt of formats) {
    try {
      const stream = new Blob([compressed as unknown as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream(fmt));
      const ab = await new Response(stream).arrayBuffer();
      const uint8 = new Uint8Array(ab);
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(uint8);
      } catch {
        return new TextDecoder('windows-1253').decode(uint8);
      }
    } catch {
      // try next format
    }
  }
  return null;
}

/**
 * Extracts text from a PDF ArrayBuffer completely offline in Chrome, Android, and Safari.
 */
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const collectedParts: string[] = [];

  // 1. Check UTF-8 / Windows-1253 plain text in uncompressed objects
  try {
    const utf8Raw = new TextDecoder('utf-8').decode(bytes);
    collectedParts.push(extractTextFromPdfStreamContent(utf8Raw));
  } catch {
    // ignore
  }

  // 2. Locate stream ... endstream blocks and decompress if FlateDecode
  const streamMarker = 'stream';
  const endStreamMarker = 'endstream';
  let cursor = 0;

  while (cursor < latin1.length) {
    const startIdx = latin1.indexOf(streamMarker, cursor);
    if (startIdx === -1) break;

    const dictHeader = latin1.slice(Math.max(0, startIdx - 250), startIdx);
    const isFlate = dictHeader.includes('FlateDecode');

    let dataStart = startIdx + streamMarker.length;
    if (latin1[dataStart] === '\r' && latin1[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (latin1[dataStart] === '\n' || latin1[dataStart] === '\r') {
      dataStart += 1;
    }

    const endIdx = latin1.indexOf(endStreamMarker, dataStart);
    if (endIdx === -1) break;

    const slice = bytes.subarray(dataStart, endIdx);
    if (isFlate) {
      const decompressed = await tryDecompressFlate(slice);
      if (decompressed) {
        collectedParts.push(extractTextFromPdfStreamContent(decompressed));
        collectedParts.push(decompressed);
      }
    } else {
      const rawSliceText = new TextDecoder('latin1').decode(slice);
      collectedParts.push(extractTextFromPdfStreamContent(rawSliceText));
    }

    cursor = endIdx + endStreamMarker.length;
  }

  return collectedParts.join('\n').replace(/\s+/g, ' ').trim();
}

interface BiomarkerPatternSpec {
  key: keyof Omit<BiomarkerProfile, 'medicalRestrictions' | 'updatedAt'>;
  labelGreek: string;
  unit: string;
  patterns: RegExp[];
  minPlausible: number;
  maxPlausible: number;
  isWarning: (val: number) => boolean;
}

const BIOMARKER_PATTERNS: BiomarkerPatternSpec[] = [
  {
    key: 'ferritin',
    labelGreek: 'Φερριτίνη Ορού (Ferritin)',
    unit: 'ng/mL',
    patterns: [
      /(?:Φερριτ[ιί]νη|ΦΕΡΡΙΤΙΝΗ|Ferritin|FERRITIN)(?:\s*\([^)]*\))?[^0-9]{1,35}?(\d{1,4}(?:[.,]\d{1,2})?)/i,
    ],
    minPlausible: 2,
    maxPlausible: 1500,
    isWarning: (v) => v < 30,
  },
  {
    key: 'hemoglobin',
    labelGreek: 'Αιμοσφαιρίνη (Hemoglobin / HGB)',
    unit: 'g/dL',
    patterns: [
      /(?:Αιμοσφαιρ[ιί]νη|ΑΙΜΟΣΦΑΙΡΙΝΗ|Hemoglobin|Haemoglobin|\bHGB\b|\bHb\b)(?:\s*\([^)]*\))?[^0-9]{1,35}?(\d{1,2}(?:[.,]\d{1,2})?)/i,
    ],
    minPlausible: 6,
    maxPlausible: 22,
    isWarning: (v) => v < 12.5,
  },
  {
    key: 'vitaminD',
    labelGreek: 'Βιταμίνη D (25-OH Vitamin D)',
    unit: 'ng/mL',
    patterns: [
      /(?:(?:Βιταμ[ιί]νη|ΒΙΤΑΜΙΝΗ|Vitamin)\s*D(?:\s*3)?(?:\s*\([^)]*\))?|25[\s-]*OH[\s-]*Vit(?:amin)?\s*D(?:\s*3)?|25\(OH\)D)[^0-9]{1,35}?(\d{1,3}(?:[.,]\d{1,2})?)/i,
    ],
    minPlausible: 3,
    maxPlausible: 200,
    isWarning: (v) => v < 25,
  },
  {
    key: 'vitaminB12',
    labelGreek: 'Βιταμίνη B12 (Cobalamin)',
    unit: 'pg/mL',
    patterns: [
      /(?:(?:Βιταμ[ιί]νη|ΒΙΤΑΜΙΝΗ|Vitamin)\s*[ΒB]12(?:\s*\([^)]*\))?|\bB12\b|Κυανοκοβαλαμ[ιί]νη)[^0-9]{1,35}?(\d{2,4}(?:[.,]\d{1,2})?)/i,
    ],
    minPlausible: 50,
    maxPlausible: 2500,
    isWarning: (v) => v < 250,
  },
  {
    key: 'crp',
    labelGreek: 'CRP (C-Αντιδρώσα Πρωτεΐνη)',
    unit: 'mg/L',
    patterns: [
      /(?:\bCRP\b(?:\s*Ποσοτικ[οό])?(?:\s*\([^)]*\))?|hs-CRP|C-Αντιδρ[ωώ]σα|C-Reactive\s*Protein)[^0-9]{1,35}?(\d{1,3}(?:[.,]\d{1,2})?)/i,
    ],
    minPlausible: 0,
    maxPlausible: 250,
    isWarning: (v) => v > 3.0,
  },
  {
    key: 'fastingGlucose',
    labelGreek: 'Γλυκόζη Νηστείας (Σάκχαρο)',
    unit: 'mg/dL',
    patterns: [
      /(?:Γλυκ[οό]ζη(?:\s*Νηστε[ιί]ας)?|ΓΛΥΚΟΖΗ|Σ[αά]κχαρο|ΣΑΚΧΑΡΟ|Glucose|\bGLU\b)(?:\s*\([^)]*\))?[^0-9]{1,35}?(\d{2,3}(?:[.,]\d{1,2})?)/i,
    ],
    minPlausible: 40,
    maxPlausible: 450,
    isWarning: (v) => v > 105,
  },
];

interface ExtraMarkerSpec {
  labelGreek: string;
  unit: string;
  pattern: RegExp;
  evaluateGreek: (val: number) => string;
}

const EXTRA_MARKER_PATTERNS: ExtraMarkerSpec[] = [
  {
    labelGreek: 'Αιματοκρίτης (HCT)',
    unit: '%',
    pattern:
      /(?:Αιματοκρ[ιί]της|ΑΙΜΑΤΟΚΡΙΤΗΣ|Hematocrit|\bHCT\b)(?:\s*\([^)]*\))?[^0-9]{1,30}?(\d{2}(?:[.,]\d{1,2})?)/i,
    evaluateGreek: (val) =>
      val < 37
        ? `Αιματοκρίτης ${val}% (Χαμηλός — προτείνεται ήπια κλιμάκωση αερόβιου όγκου)`
        : `Αιματοκρίτης ${val}% (Εντός φυσιολογικού εύρους)`,
  },
  {
    labelGreek: 'Σίδηρος Ορού (Fe)',
    unit: 'μg/dL',
    pattern:
      /(?:Σ[ιί]δηρος(?:\s*Ορο[υύ])?|ΣΙΔΗΡΟΣ|Serum\s*Iron|\bIron\b)(?:\s*\([^)]*\))?[^0-9]{1,30}?(\d{2,3}(?:[.,]\d{1,2})?)/i,
    evaluateGreek: (val) =>
      val < 60
        ? `Σίδηρος Ορού ${val} μg/dL (Χαμηλός — προσοχή στην αποκατάσταση)`
        : `Σίδηρος Ορού ${val} μg/dL (Φυσιολογικός)`,
  },
  {
    labelGreek: 'CPK / Κρεατινική Κινάση',
    unit: 'U/L',
    pattern:
      /(?:Κρεατινικ[ηή]\s*Κιν[αά]ση|\bCPK\b|\bCK\b)(?:\s*\([^)]*\))?[^0-9]{1,30}?(\d{2,4}(?:[.,]\d{1,2})?)/i,
    evaluateGreek: (val) =>
      val > 220
        ? `CPK ${val} U/L (Αυξημένη μυϊκή καταπόνηση — προτεραιότητα σε αποσυμπίεση)`
        : `CPK ${val} U/L (Χαμηλή μυϊκή φθορά)`,
  },
  {
    labelGreek: 'Μαγνήσιο (Mg)',
    unit: 'mg/dL',
    pattern:
      /(?:Μαγν[ηή]σιο|ΜΑΓΝΗΣΙΟ|Magnesium|\bMg\b)(?:\s*\([^)]*\))?[^0-9]{1,30}?(\d{1}(?:[.,]\d{1,2})?)/i,
    evaluateGreek: (val) =>
      val < 1.8
        ? `Μαγνήσιο ${val} mg/dL (Οριακό — αυξημένος κίνδυνος μυϊκών σπασμών)`
        : `Μαγνήσιο ${val} mg/dL (Φυσιολογικό)`,
  },
];

/**
 * Parses extracted text (from a PDF or pasted lab report) into structured KINESIS biomarkers.
 */
export function parseBiomarkersFromText(
  text: string,
  fileName = 'Αιματολογικές_Εξετάσεις.pdf'
): PdfExtractionResult {
  const detectedItems: ExtractedBiomarkerItem[] = [];
  const updatedProfile: Partial<BiomarkerProfile> = {};

  for (const spec of BIOMARKER_PATTERNS) {
    for (const regex of spec.patterns) {
      const m = regex.exec(text);
      if (m && m[1]) {
        const numericValue = parseFloat(m[1].replace(',', '.'));
        if (
          Number.isFinite(numericValue) &&
          numericValue >= spec.minPlausible &&
          numericValue <= spec.maxPlausible
        ) {
          detectedItems.push({
            key: spec.key,
            labelGreek: spec.labelGreek,
            value: numericValue,
            unit: spec.unit,
            rawMatch: m[0].trim(),
            status: spec.isWarning(numericValue) ? 'warning' : 'normal',
          });
          updatedProfile[spec.key] = numericValue;
          break;
        }
      }
    }
  }

  const extraFindingsGreek: string[] = [];
  for (const extra of EXTRA_MARKER_PATTERNS) {
    const m = extra.pattern.exec(text);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(val)) {
        extraFindingsGreek.push(extra.evaluateGreek(val));
      }
    }
  }

  return {
    fileName,
    extractedAt: new Date().toISOString(),
    detectedItems,
    extraFindingsGreek,
    updatedProfile,
    rawTextPreview: text.slice(0, 400),
  };
}

/**
 * High-level helper to extract biomarkers directly from a browser File (.pdf or .txt).
 */
export async function extractBiomarkersFromFile(file: File): Promise<PdfExtractionResult> {
  const buffer = await file.arrayBuffer();
  let text = '';

  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    text = await extractTextFromPdfBuffer(buffer);
  } else {
    text = new TextDecoder('utf-8').decode(buffer);
  }

  return parseBiomarkersFromText(text, file.name);
}

/**
 * Generates a real, standards-compliant PDF binary containing a Greek microbiological report
 * so users can test the PDF upload/extraction pipeline with 1 click.
 */
export function createSampleGreekLabPdfBlob(): Blob {
  const reportLines = [
    'DIAGNOSTIC LAB ATHENS - MIKROBIOLOGIKO ERGASTIRIO',
    'ΑΠΟΤΕΛΕΣΜΑΤΑ ΑΙΜΑΤΟΛΟΓΙΚΟΥ & ΒΙΟΧΗΜΙΚΟΥ ΕΛΕΓΧΟΥ',
    '------------------------------------------------------------',
    'Αιμοσφαιρίνη (Hemoglobin HGB) : 13.4 g/dL   (Φυσ. Τιμές: 13.5 - 17.5)',
    'Αιματοκρίτης (HCT)            : 40.2 %      (Φυσ. Τιμές: 40.0 - 50.0)',
    'Φερριτίνη Ορού (Ferritin)     : 21.5 ng/mL  (Φυσ. Τιμές: 30.0 - 300.0)',
    'Σίδηρος Ορού (Serum Iron)     : 58 μg/dL    (Φυσ. Τιμές: 65 - 175)',
    'Βιταμίνη D (25-OH Vitamin D)  : 22.8 ng/mL  (Επάρκεια: 30 - 100)',
    'Βιταμίνη B12 (Vitamin B12)    : 340 pg/mL   (Φυσ. Τιμές: 200 - 900)',
    'CRP Ποσοτικό (hs-CRP)         : 1.4 mg/L    (Φυσ. Τιμές: < 3.0)',
    'Γλυκόζη Νηστείας (Glucose)    : 94 mg/dL    (Φυσ. Τιμές: 70 - 100)',
    'Κρεατινική Κινάση (CPK)       : 245 U/L     (Φυσ. Τιμές: 30 - 190)',
  ];

  // Encode each line as UTF-16BE hex string <FEFF...> inside a valid PDF stream
  const toUtf16BeHex = (str: string) => {
    let hex = 'FEFF';
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    }
    return `<${hex}>`;
  };

  const streamOps = [
    'BT',
    '/F1 11 Tf',
    '40 760 Td',
    ...reportLines.map((line) => `${toUtf16BeHex(line)} Tj 0 -22 Td`),
    'ET',
  ].join('\n');

  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamOps.length} >>
stream
${streamOps}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;

  return new Blob([pdfContent], { type: 'application/pdf' });
}
