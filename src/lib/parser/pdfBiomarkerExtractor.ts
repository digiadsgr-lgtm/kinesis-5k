import { BiomarkerProfile } from '@/types/kinesis';

export interface ExtractedBiomarkerItem {
  key: keyof Omit<BiomarkerProfile, 'medicalRestrictions' | 'updatedAt'>;
  labelGreek: string;
  value: number;
  unit: string;
  rawMatch: string;
  status: 'normal' | 'warning';
  sourceFileName?: string;
}

export interface PdfExtractionResult {
  id: string;
  fileName: string;
  extractedAt: string;
  detectedItems: ExtractedBiomarkerItem[];
  extraFindingsGreek: string[];
  updatedProfile: Partial<BiomarkerProfile>;
  rawTextPreview: string;
}

export interface MultiPdfExtractionSummary {
  resultsPerFile: PdfExtractionResult[];
  mergedProfile: Partial<BiomarkerProfile>;
  allDetectedItems: ExtractedBiomarkerItem[];
  allExtraFindingsGreek: string[];
}

/**
 * Parses PDF /ToUnicode CMap streams (beginbfchar / beginbfrange) so subsetted Greek fonts
 * produced by Chrome, Word, Canva, or macOS Quartz decode into proper Unicode Greek text.
 */
function parseToUnicodeCMap(streamText: string, glyphMap: Map<number, string>): void {
  if (!streamText.includes('beginbfchar') && !streamText.includes('beginbfrange')) {
    return;
  }

  // 1. Parse beginbfchar ... endbfchar
  const bfCharBlocks = streamText.match(/beginbfchar[\s\S]*?endbfchar/g) || [];
  for (const block of bfCharBlocks) {
    const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = pairRegex.exec(block)) !== null) {
      const srcCode = parseInt(m[1], 16);
      const dstHex = m[2];
      let dstStr = '';
      for (let i = 0; i + 3 < dstHex.length; i += 4) {
        const cp = parseInt(dstHex.slice(i, i + 4), 16);
        if (!Number.isNaN(cp) && cp > 0) dstStr += String.fromCodePoint(cp);
      }
      if (!dstStr && dstHex.length === 2) {
        dstStr = String.fromCharCode(parseInt(dstHex, 16));
      }
      if (!Number.isNaN(srcCode) && dstStr) {
        glyphMap.set(srcCode, dstStr);
      }
    }
  }

  // 2. Parse beginbfrange ... endbfrange
  const bfRangeBlocks = streamText.match(/beginbfrange[\s\S]*?endbfrange/g) || [];
  for (const block of bfRangeBlocks) {
    const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = rangeRegex.exec(block)) !== null) {
      const startCode = parseInt(m[1], 16);
      const endCode = parseInt(m[2], 16);
      const targetStart = parseInt(m[3], 16);
      if (
        !Number.isNaN(startCode) &&
        !Number.isNaN(endCode) &&
        !Number.isNaN(targetStart) &&
        endCode >= startCode &&
        endCode - startCode <= 1024
      ) {
        for (let c = startCode; c <= endCode; c++) {
          glyphMap.set(c, String.fromCodePoint(targetStart + (c - startCode)));
        }
      }
    }
  }
}

/**
 * Decodes PDF hex strings — supports UTF-16BE (with FEFF BOM), ToUnicode CMap glyph IDs,
 * UTF-16BE without BOM, UTF-8, and single-byte Greek (ISO-8859-7 / Windows-1253).
 */
function decodePdfHexString(hex: string, glyphMap?: Map<number, string>): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return '';

  // 1. Explicit UTF-16BE BOM (FEFF)
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

  // 2. When the PDF has /ToUnicode CMap tables (e.g. WeasyPrint, Chrome, Word, Quartz CIDFonts),
  // ALWAYS check 2-byte and 1-byte CMap lookup BEFORE raw UTF-16BE!
  if (glyphMap && glyphMap.size > 0) {
    if (clean.length % 4 === 0) {
      let cmapOut = '';
      let mappedCount = 0;
      const totalChars = clean.length / 4;
      for (let i = 0; i + 3 < clean.length; i += 4) {
        const gid = parseInt(clean.slice(i, i + 4), 16);
        const mapped = glyphMap.get(gid);
        if (mapped !== undefined) {
          cmapOut += mapped;
          mappedCount++;
        }
      }
      if (mappedCount > 0 && mappedCount / totalChars >= 0.4) {
        return cmapOut;
      }
    }

    if (clean.length % 2 === 0) {
      let cmapOut1 = '';
      let mappedCount1 = 0;
      const total1 = clean.length / 2;
      for (let i = 0; i + 1 < clean.length; i += 2) {
        const gid = parseInt(clean.slice(i, i + 2), 16);
        const mapped = glyphMap.get(gid);
        if (mapped !== undefined) {
          cmapOut1 += mapped;
          mappedCount1++;
        }
      }
      if (mappedCount1 > 0 && mappedCount1 / total1 >= 0.5) {
        return cmapOut1;
      }
    }
  }

  // 3. Check if 2-byte UTF-16BE (without BOM) containing Greek (0370-03FF) or ASCII (0020-007E)
  if (clean.length % 4 === 0) {
    let utf16Candidate = '';
    let validUtf16Count = 0;
    const totalChars = clean.length / 4;
    for (let i = 0; i + 3 < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (
        (code >= 0x0020 && code <= 0x007e) ||
        (code >= 0x0370 && code <= 0x03ff) ||
        (code >= 0x1f00 && code <= 0x1fff) ||
        (code >= 0x2000 && code <= 0x206f)
      ) {
        validUtf16Count++;
      }
      if (code > 0) utf16Candidate += String.fromCharCode(code);
    }
    if (totalChars > 0 && validUtf16Count / totalChars >= 0.7) {
      return utf16Candidate;
    }
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
 * Extracts readable text tokens from a decompressed PDF content stream while preserving
 * horizontal line grouping (Tm coordinates) and joining kerning chunks inside [...] TJ arrays.
 */
function extractTextFromPdfStreamContent(
  streamText: string,
  glyphMap?: Map<number, string>
): string {
  if (streamText.includes('beginbfchar') || streamText.includes('beginbfrange')) {
    return '';
  }

  const lines: string[] = [];
  let curX: number | null = null;
  let curY: number | null = null;
  let lastX: number | null = null;
  let lastY: number | null = null;

  const appendTextRun = (rawDecoded: string, forceNewLine: boolean) => {
    const trimmed = rawDecoded.replace(/^[•\s]+|[•\s]+$/g, '');
    if (!trimmed) return;

    const sameHorizontalLine =
      !forceNewLine &&
      lines.length > 0 &&
      curY !== null &&
      lastY !== null &&
      curX !== null &&
      lastX !== null &&
      Math.abs(curY - lastY) <= 9 &&
      curX > lastX + 4;

    if (sameHorizontalLine) {
      lines[lines.length - 1] += ' ' + trimmed;
    } else {
      lines.push(trimmed);
    }

    lastX = curX;
    lastY = curY;
  };

  const tokenRegex =
    /([\d.-]+)\s+([\d.-]+)\s+Tm|([\d.-]+)\s+([\d.-]+)\s+T[dD]|\bT\*\b|\[([\s\S]*?)\]\s*TJ|<([0-9A-Fa-f\s]{2,})>\s*Tj|\(((?:\\.|[^\\()])*)\)\s*Tj/g;

  let match: RegExpExecArray | null;
  let forceBreakNext = false;

  while ((match = tokenRegex.exec(streamText)) !== null) {
    if (match[1] !== undefined && match[2] !== undefined) {
      // x y Tm
      curX = parseFloat(match[1]);
      curY = parseFloat(match[2]);
      forceBreakNext = false;
    } else if (match[3] !== undefined && match[4] !== undefined) {
      // tx ty Td / TD
      const ty = parseFloat(match[4]);
      if (Math.abs(ty) > 1) {
        forceBreakNext = true;
        curY = curY !== null ? curY - ty : null;
      }
    } else if (match[0] === 'T*') {
      forceBreakNext = true;
    } else if (match[5] !== undefined) {
      // [...] TJ array: concatenate all kerning chunks inside the array without spaces
      const arrayBody = match[5];
      const innerRe = /<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\()])*)\)/g;
      let innerMatch: RegExpExecArray | null;
      let joinedRun = '';
      while ((innerMatch = innerRe.exec(arrayBody)) !== null) {
        if (innerMatch[1] !== undefined) {
          joinedRun += decodePdfHexString(innerMatch[1], glyphMap);
        } else if (innerMatch[2] !== undefined) {
          joinedRun += decodePdfLiteralString(innerMatch[2]);
        }
      }
      appendTextRun(joinedRun, forceBreakNext);
      forceBreakNext = false;
    } else if (match[6] !== undefined) {
      // <...> Tj
      const decoded = decodePdfHexString(match[6], glyphMap);
      appendTextRun(decoded, forceBreakNext);
      forceBreakNext = false;
    } else if (match[7] !== undefined) {
      // (...) Tj
      const decoded = decodePdfLiteralString(match[7]);
      appendTextRun(decoded, forceBreakNext);
      forceBreakNext = false;
    }
  }

  return lines.join('\n');
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
 * Properly skips embedded binary font/image streams (/Subtype /OpenType, /Image, /XRef, /ObjStm)
 * and two-pass resolves /ToUnicode CMap tables before decoding page content streams.
 */
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const decompressedStreams: string[] = [];
  const glyphMap = new Map<number, string>();

  // 1. Locate << ... >> stream ... endstream blocks
  const streamBlockRegex = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamBlockRegex.exec(latin1)) !== null) {
    const dict = match[1];
    const dataStart = streamBlockRegex.lastIndex;
    const endIdx = latin1.indexOf('endstream', dataStart);
    if (endIdx === -1) break;

    streamBlockRegex.lastIndex = endIdx + 9;

    // Skip binary font programs, images, cross-reference tables, and object streams
    if (
      /\/Subtype\s*\/(?:OpenType|TrueType|Type1|Type1C|CIDFontType0C|Image)|\/Type\s*\/(?:XRef|ObjStm|Metadata)/i.test(
        dict
      )
    ) {
      continue;
    }

    // Trim trailing CR/LF before endstream if present
    let sliceEnd = endIdx;
    if (sliceEnd > dataStart && latin1[sliceEnd - 1] === '\n') sliceEnd--;
    if (sliceEnd > dataStart && latin1[sliceEnd - 1] === '\r') sliceEnd--;

    const slice = bytes.subarray(dataStart, sliceEnd);
    const isFlate = dict.includes('FlateDecode');

    if (isFlate) {
      const decompressed = await tryDecompressFlate(slice);
      if (decompressed) {
        parseToUnicodeCMap(decompressed, glyphMap);
        decompressedStreams.push(decompressed);
      }
    } else {
      let rawSliceText = '';
      try {
        rawSliceText = new TextDecoder('utf-8', { fatal: true }).decode(slice);
      } catch {
        rawSliceText = new TextDecoder('latin1').decode(slice);
      }
      parseToUnicodeCMap(rawSliceText, glyphMap);
      decompressedStreams.push(rawSliceText);
    }
  }

  // 2. Pass 2: Extract text from all content streams using the populated glyphMap
  const collectedParts: string[] = [];
  for (const streamContent of decompressedStreams) {
    if (streamContent.includes('beginbfchar') || streamContent.includes('beginbfrange')) {
      continue;
    }
    const extracted = extractTextFromPdfStreamContent(streamContent, glyphMap);
    if (extracted.trim().length > 0) {
      collectedParts.push(extracted);
    }
  }

  // 3. Fallback only if no PDF streams were found (e.g. plain text file renamed to .pdf)
  if (collectedParts.length === 0 && decompressedStreams.length === 0) {
    try {
      const utf8Raw = new TextDecoder('utf-8').decode(bytes);
      const extractedRaw = extractTextFromPdfStreamContent(utf8Raw, glyphMap);
      if (extractedRaw.trim().length > 0) {
        collectedParts.push(extractedRaw);
      }
    } catch {
      // ignore
    }
  }

  return collectedParts
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
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
            sourceFileName: fileName,
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
    id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
 * Batch processes multiple PDF or text files and merges all detected biomarkers across files.
 */
export async function extractBiomarkersFromMultipleFiles(
  files: File[]
): Promise<MultiPdfExtractionSummary> {
  const resultsPerFile: PdfExtractionResult[] = [];
  const mergedProfile: Partial<BiomarkerProfile> = {};
  const itemByKey = new Map<string, ExtractedBiomarkerItem>();
  const extraSet = new Set<string>();

  for (const file of files) {
    const res = await extractBiomarkersFromFile(file);
    resultsPerFile.push(res);

    Object.assign(mergedProfile, res.updatedProfile);
    for (const item of res.detectedItems) {
      itemByKey.set(item.key, item);
    }
    for (const extra of res.extraFindingsGreek) {
      extraSet.add(`${extra} (${file.name})`);
    }
  }

  return {
    resultsPerFile,
    mergedProfile,
    allDetectedItems: Array.from(itemByKey.values()),
    allExtraFindingsGreek: Array.from(extraSet),
  };
}

/**
 * Generates a real, standards-compliant PDF binary containing a Greek microbiological report
 * so users can test the PDF upload/extraction pipeline with 1 click.
 */
export function createSampleGreekLabPdfBlob(
  variant: 'full' | 'hematology' | 'biochemistry' = 'full'
): Blob {
  let reportLines: string[];

  if (variant === 'hematology') {
    reportLines = [
      'DIAGNOSTIC LAB ATHENS - ΓΕΝΙΚΗ ΑΙΜΑΤΟΣ & ΣΙΔΗΡΟΣ',
      '------------------------------------------------------------',
      'Αιμοσφαιρίνη (Hemoglobin HGB) : 13.4 g/dL   (Φυσ. Τιμές: 13.5 - 17.5)',
      'Αιματοκρίτης (HCT)            : 40.2 %      (Φυσ. Τιμές: 40.0 - 50.0)',
      'Φερριτίνη Ορού (Ferritin)     : 21.5 ng/mL  (Φυσ. Τιμές: 30.0 - 300.0)',
      'Σίδηρος Ορού (Serum Iron)     : 58 μg/dL    (Φυσ. Τιμές: 65 - 175)',
    ];
  } else if (variant === 'biochemistry') {
    reportLines = [
      'DIAGNOSTIC LAB ATHENS - ΒΙΟΧΗΜΙΚΟΣ & ΒΙΤΑΜΙΝΕΣ',
      '------------------------------------------------------------',
      'Βιταμίνη D (25-OH Vitamin D)  : 22.8 ng/mL  (Επάρκεια: 30 - 100)',
      'Βιταμίνη B12 (Vitamin B12)    : 340 pg/mL   (Φυσ. Τιμές: 200 - 900)',
      'CRP Ποσοτικό (hs-CRP)         : 1.4 mg/L    (Φυσ. Τιμές: < 3.0)',
      'Γλυκόζη Νηστείας (Glucose)    : 94 mg/dL    (Φυσ. Τιμές: 70 - 100)',
      'Κρεατινική Κινάση (CPK)       : 245 U/L     (Φυσ. Τιμές: 30 - 190)',
    ];
  } else {
    reportLines = [
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
  }

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
