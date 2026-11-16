import ExcelJS from 'exceljs';
import type {
  BackupPayload,
  ColumnAlign,
  SheetCell,
  SheetCellStyle,
  SheetImage,
  SheetMergeRange,
  SheetTemplate,
  VendorProfile,
  VerticalAlign,
} from '../types';
import { exportSheetToExcel } from './exporters';
import { sanitizeFilename } from './formatters';
import { cellKey, ensureSheetTemplate } from './sheetTemplate';

interface ExportedVendorTemplateBundle {
  type: 'catatkerja-vendor-template';
  version: 1;
  exportedAt: string;
  profiles: VendorProfile[];
}

function triggerJsonDownload(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportVendorTemplateToJson(profile: VendorProfile): void {
  const normalized: VendorProfile = {
    ...structuredClone(profile),
    sheetTemplate: ensureSheetTemplate(profile),
  };
  const bundle: ExportedVendorTemplateBundle = {
    type: 'catatkerja-vendor-template',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: [normalized],
  };
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerJsonDownload(
    bundle,
    `template-${sanitizeFilename(profile.vendorName)}-${dateTag}.json`
  );
}

export function exportAllVendorTemplatesToJson(profiles: VendorProfile[]): void {
  const normalized = profiles.map((p) => ({
    ...structuredClone(p),
    sheetTemplate: ensureSheetTemplate(p),
  }));
  const bundle: ExportedVendorTemplateBundle = {
    type: 'catatkerja-vendor-template',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: normalized,
  };
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerJsonDownload(bundle, `semua-template-vendor-${dateTag}.json`);
}

export async function exportVendorTemplateToExcel(profile: VendorProfile): Promise<void> {
  const sheet = ensureSheetTemplate(profile);
  await exportSheetToExcel(
    sheet,
    `template-${profile.vendorName}`,
    profile.vendorName || 'Template Vendor',
    profile.paperOrientation,
    'Timesheetly'
  );
}

function makeUniqueVendorName(baseName: string, takenNames: Set<string>): string {
  const cleanBase = baseName.trim() || 'Template Vendor Impor';
  if (!takenNames.has(cleanBase.toLowerCase())) {
    takenNames.add(cleanBase.toLowerCase());
    return cleanBase;
  }
  let counter = 2;
  let candidate = `${cleanBase} (Impor)`;
  while (takenNames.has(candidate.toLowerCase())) {
    candidate = `${cleanBase} (Impor ${counter})`;
    counter++;
  }
  takenNames.add(candidate.toLowerCase());
  return candidate;
}

function normalizeImportedProfile(
  raw: Partial<VendorProfile>,
  index: number,
  takenNames: Set<string>
): VendorProfile {
  const nowIso = new Date().toISOString();
  const baseProfile: VendorProfile = {
    id: `vendor-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    vendorName: makeUniqueVendorName(
      typeof raw.vendorName === 'string' && raw.vendorName.trim()
        ? raw.vendorName
        : `Template Vendor ${index + 1}`,
      takenNames
    ),
    reportTitle:
      typeof raw.reportTitle === 'string' && raw.reportTitle.trim()
        ? raw.reportTitle
        : 'LAPORAN AKTIVITAS HARIAN',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    logoDataUrl: typeof raw.logoDataUrl === 'string' ? raw.logoDataUrl : '',
    logoPosition:
      raw.logoPosition === 'center' || raw.logoPosition === 'right'
        ? raw.logoPosition
        : 'left',
    headerBgColor:
      typeof raw.headerBgColor === 'string' && raw.headerBgColor
        ? raw.headerBgColor
        : '#1E3A8A',
    headerTextColor:
      typeof raw.headerTextColor === 'string' && raw.headerTextColor
        ? raw.headerTextColor
        : '#FFFFFF',
    paperOrientation: raw.paperOrientation === 'portrait' ? 'portrait' : 'landscape',
    showSummaryRow: Boolean(raw.showSummaryRow),
    footerNotes: typeof raw.footerNotes === 'string' ? raw.footerNotes : '',
    preparedByLabel:
      typeof raw.preparedByLabel === 'string' && raw.preparedByLabel
        ? raw.preparedByLabel
        : 'Disusun Oleh',
    approvedByLabel:
      typeof raw.approvedByLabel === 'string' && raw.approvedByLabel
        ? raw.approvedByLabel
        : 'Disetujui Oleh',
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    sheetTemplate: raw.sheetTemplate,
    updatedAt: nowIso,
  };

  const materializedSheet = ensureSheetTemplate(baseProfile);
  return {
    ...baseProfile,
    sheetTemplate: {
      colWidths:
        Array.isArray(materializedSheet.colWidths) && materializedSheet.colWidths.length > 0
          ? materializedSheet.colWidths.map((w) => Math.max(20, Math.min(1200, Number(w) || 100)))
          : [100, 120, 120, 220],
      rowHeights:
        Array.isArray(materializedSheet.rowHeights) && materializedSheet.rowHeights.length > 0
          ? materializedSheet.rowHeights.map((h) => Math.max(16, Math.min(400, Number(h) || 24)))
          : [28, 28, 28, 28],
      cells:
        materializedSheet.cells && typeof materializedSheet.cells === 'object'
          ? materializedSheet.cells
          : {},
      merges: Array.isArray(materializedSheet.merges) ? materializedSheet.merges : [],
      images: Array.isArray(materializedSheet.images) ? materializedSheet.images : [],
      dataRowIndex: materializedSheet.dataRowIndex ?? null,
      dataRowIndices: Array.isArray(materializedSheet.dataRowIndices)
        ? materializedSheet.dataRowIndices
        : materializedSheet.dataRowIndex !== null && materializedSheet.dataRowIndex !== undefined
        ? [materializedSheet.dataRowIndex]
        : [],
    },
  };
}

function isVendorProfileLike(obj: unknown): obj is Partial<VendorProfile> {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  return (
    typeof rec.vendorName === 'string' ||
    Boolean(rec.sheetTemplate && typeof rec.sheetTemplate === 'object') ||
    Array.isArray(rec.columns)
  );
}

function argbToHex(argb: string | undefined): string | undefined {
  if (!argb) return undefined;
  const clean = argb.replace('#', '').trim();
  if (/^[0-9a-fA-F]{8}$/.test(clean)) {
    const alpha = clean.slice(0, 2).toUpperCase();
    if (alpha === '00') return undefined;
    return `#${clean.slice(2).toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toUpperCase()}`;
  }
  return undefined;
}

function excelLettersToZeroIndex(letters: string): number {
  let result = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1;
}

function parseExcelRange(rangeRef: string): SheetMergeRange | null {
  const match = rangeRef
    .trim()
    .match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const startCol = excelLettersToZeroIndex(match[1]);
  const startRow = Number(match[2]) - 1;
  const endCol = excelLettersToZeroIndex(match[3]);
  const endRow = Number(match[4]) - 1;
  if (
    startCol < 0 ||
    startRow < 0 ||
    endCol < startCol ||
    endRow < startRow
  ) {
    return null;
  }
  return { startRow, startCol, endRow, endCol };
}

function extractExcelCellText(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((part) => part.text ?? '').join('');
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text;
    }
    if ('formula' in val && typeof val.formula === 'string' && val.formula.trim()) {
      return `=${val.formula}`;
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result);
    }
  }
  return cell.text || '';
}

function bufferToBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function excelCoordToPx(sizes: number[], coord: number, fallbackSize: number): number {
  const whole = Math.max(0, Math.floor(coord));
  const frac = Math.max(0, coord - whole);
  let px = 0;
  for (let i = 0; i < whole; i++) {
    px += sizes[i] ?? fallbackSize;
  }
  px += frac * (sizes[whole] ?? fallbackSize);
  return Math.round(px);
}

const DEFAULT_OFFICE_THEME_PALETTE = [
  '#FFFFFF', // 0: lt1
  '#000000', // 1: dk1
  '#E7E6E6', // 2: lt2
  '#44546A', // 3: dk2
  '#4472C4', // 4: accent1
  '#ED7D31', // 5: accent2
  '#A5A5A5', // 6: accent3
  '#FFC000', // 7: accent4
  '#5B9BD5', // 8: accent5
  '#70AD47', // 9: accent6
];

const EXCEL_INDEXED_COLORS: Record<number, string> = {
  0: '#000000',
  1: '#FFFFFF',
  2: '#FF0000',
  3: '#00FF00',
  4: '#0000FF',
  5: '#FFFF00',
  6: '#FF00FF',
  7: '#00FFFF',
  8: '#000000',
  9: '#FFFFFF',
  10: '#FF0000',
  11: '#00FF00',
  12: '#0000FF',
  13: '#FFFF00',
  14: '#FF00FF',
  15: '#00FFFF',
  16: '#800000',
  17: '#008000',
  18: '#000080',
  19: '#808000',
  20: '#800080',
  21: '#008080',
  22: '#C0C0C0',
  23: '#808080',
  24: '#9999FF',
  25: '#993366',
  26: '#FFFFCC',
  27: '#CCFFFF',
  28: '#660066',
  29: '#FF8080',
  30: '#0066CC',
  31: '#CCCCFF',
  32: '#000080',
  33: '#FF00FF',
  34: '#FFFF00',
  35: '#00FFFF',
  36: '#800080',
  37: '#800000',
  38: '#008080',
  39: '#0000FF',
  40: '#00CCFF',
  41: '#CCFFFF',
  42: '#CCFFCC',
  43: '#FFFF99',
  44: '#99CCFF',
  45: '#FF99CC',
  46: '#CC99FF',
  47: '#FFCC99',
  48: '#3366FF',
  49: '#33CCCC',
  50: '#99CC00',
  51: '#FFCC00',
  52: '#FF9900',
  53: '#FF6600',
  54: '#666699',
  55: '#969696',
  56: '#003366',
  57: '#339966',
  58: '#003300',
  59: '#333300',
  60: '#993300',
  61: '#993366',
  62: '#333399',
  63: '#333333',
};

function extractWorkbookThemePalette(workbook: ExcelJS.Workbook): string[] {
  const palette = [...DEFAULT_OFFICE_THEME_PALETTE];
  try {
    const rawThemes = (workbook as unknown as { _themes?: Record<string, string> })._themes;
    const xml = rawThemes?.theme1;
    if (typeof xml !== 'string' || !xml) return palette;

    const slotTags = [
      'lt1',
      'dk1',
      'lt2',
      'dk2',
      'accent1',
      'accent2',
      'accent3',
      'accent4',
      'accent5',
      'accent6',
    ];
    slotTags.forEach((tag, idx) => {
      const blockMatch = xml.match(
        new RegExp(`<a:${tag}[^>]*>([\\s\\S]*?)<\\/a:${tag}>`, 'i')
      );
      if (!blockMatch) return;
      const srgb = blockMatch[1].match(/srgbClr[^>]*val="([0-9A-Fa-f]{6})"/i);
      if (srgb) {
        palette[idx] = `#${srgb[1].toUpperCase()}`;
        return;
      }
      const sysClr = blockMatch[1].match(/sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/i);
      if (sysClr) {
        palette[idx] = `#${sysClr[1].toUpperCase()}`;
      }
    });
  } catch {
    // Keep default palette
  }
  return palette;
}

function applyTintToHex(hex: string, tint: number): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(clean) || !Number.isFinite(tint) || tint === 0) {
    return hex;
  }

  let r = parseInt(clean.slice(0, 2), 16) / 255;
  let g = parseInt(clean.slice(2, 4), 16) / 255;
  let b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }

  if (tint < 0) {
    l = l * (1 + tint);
  } else {
    l = l * (1 - tint) + tint;
  }
  l = Math.max(0, Math.min(1, l));

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function resolveExcelColor(
  colorObj: Partial<ExcelJS.Color> | undefined,
  themePalette: string[]
): string | undefined {
  if (!colorObj) return undefined;
  const fromArgb = argbToHex(colorObj.argb);
  if (fromArgb) {
    if (typeof (colorObj as { tint?: number }).tint === 'number' && (colorObj as { tint?: number }).tint !== 0) {
      return applyTintToHex(fromArgb, (colorObj as { tint: number }).tint);
    }
    return fromArgb;
  }
  const themeIdx = (colorObj as { theme?: number }).theme;
  if (typeof themeIdx === 'number' && themeIdx >= 0 && themeIdx < themePalette.length) {
    const baseHex = themePalette[themeIdx];
    const tint = (colorObj as { tint?: number }).tint;
    return typeof tint === 'number' && tint !== 0 ? applyTintToHex(baseHex, tint) : baseHex;
  }
  const indexed = (colorObj as { indexed?: number }).indexed;
  if (typeof indexed === 'number' && indexed in EXCEL_INDEXED_COLORS) {
    return EXCEL_INDEXED_COLORS[indexed];
  }
  return undefined;
}

function borderStyleToWidth(bStyle: string | undefined): number {
  if (bStyle === 'thick') return 3;
  if (bStyle === 'medium' || bStyle === 'double') return 2;
  if (bStyle === 'hair' || bStyle === 'dotted') return 0.75;
  return 1;
}

function collectWorksheetMerges(ws: ExcelJS.Worksheet): SheetMergeRange[] {
  const seen = new Set<string>();
  const result: SheetMergeRange[] = [];

  const addMerge = (m: SheetMergeRange | null) => {
    if (!m) return;
    const k = `${m.startRow},${m.startCol},${m.endRow},${m.endCol}`;
    if (seen.has(k)) return;
    seen.add(k);
    result.push(m);
  };

  for (const mStr of ws.model?.merges ?? []) {
    addMerge(parseExcelRange(mStr));
  }

  const internalMerges = (ws as unknown as {
    _merges?: Record<
      string,
      { model?: { top?: number; left?: number; bottom?: number; right?: number } }
    >;
  })._merges;
  if (internalMerges && typeof internalMerges === 'object') {
    for (const [refKey, mergeObj] of Object.entries(internalMerges)) {
      if (mergeObj?.model) {
        const { top, left, bottom, right } = mergeObj.model;
        if (
          typeof top === 'number' &&
          typeof left === 'number' &&
          typeof bottom === 'number' &&
          typeof right === 'number' &&
          top >= 1 &&
          left >= 1 &&
          bottom >= top &&
          right >= left
        ) {
          addMerge({
            startRow: top - 1,
            startCol: left - 1,
            endRow: bottom - 1,
            endCol: right - 1,
          });
          continue;
        }
      }
      addMerge(parseExcelRange(refKey));
    }
  }

  return result;
}

function extractSideBorderSpec(
  edge: Partial<ExcelJS.Border> | undefined,
  themePalette: string[]
): { width: number; color: string } | null {
  if (!edge || !edge.style) return null;
  const width = borderStyleToWidth(edge.style);
  const color = resolveExcelColor(edge.color, themePalette) || '#94A3B8';
  return { width, color };
}

function extractFillBgColor(
  cell: ExcelJS.Cell,
  themePalette: string[]
): string | undefined {
  const fill = cell.fill as
    | (ExcelJS.FillPattern & { fgColor?: Partial<ExcelJS.Color>; bgColor?: Partial<ExcelJS.Color> })
    | undefined;
  if (!fill || fill.type !== 'pattern') return undefined;
  if (fill.pattern === 'none') return undefined;
  const fgHex = resolveExcelColor(fill.fgColor, themePalette);
  if (fgHex && fgHex !== '#FFFFFF') return fgHex;
  const bgHex = resolveExcelColor(fill.bgColor, themePalette);
  if (bgHex && bgHex !== '#FFFFFF') return bgHex;
  return undefined;
}

async function importFromExcelFile(
  file: File,
  takenNames: Set<string>
): Promise<VendorProfile> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    throw new Error('File Excel tidak memiliki worksheet.');
  }

  const themePalette = extractWorkbookThemePalette(workbook);
  const parsedMerges = collectWorksheetMerges(ws);

  let maxRow = Math.max(ws.actualRowCount || 0, 1);
  let maxCol = Math.max(ws.actualColumnCount || 0, 1);
  for (const m of parsedMerges) {
    if (m.endRow + 1 > maxRow) maxRow = m.endRow + 1;
    if (m.endCol + 1 > maxCol) maxCol = m.endCol + 1;
  }

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > 200) return;
    let rowHasContentOrStyle = Boolean(row.height);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > 50) return;
      const hasBorder = Boolean(
        cell.border &&
          (cell.border.top?.style ||
            cell.border.bottom?.style ||
            cell.border.left?.style ||
            cell.border.right?.style)
      );
      const hasFill = Boolean(extractFillBgColor(cell, themePalette));
      const hasText = extractExcelCellText(cell).length > 0;
      if (hasBorder || hasFill || hasText) {
        rowHasContentOrStyle = true;
        if (colNumber > maxCol) maxCol = colNumber;
      }
    });
    if (rowHasContentOrStyle && rowNumber > maxRow) {
      maxRow = rowNumber;
    }
  });

  const wsImages = ws.getImages();
  for (const imgRef of wsImages) {
    const brRow = imgRef.range?.br?.nativeRow ?? imgRef.range?.br?.row ?? 0;
    const brCol = imgRef.range?.br?.nativeCol ?? imgRef.range?.br?.col ?? 0;
    if (Math.ceil(brRow) + 1 > maxRow) maxRow = Math.ceil(brRow) + 1;
    if (Math.ceil(brCol) + 1 > maxCol) maxCol = Math.ceil(brCol) + 1;
  }

  const rowCount = Math.max(6, Math.min(200, maxRow));
  const colCount = Math.max(4, Math.min(50, maxCol));

  const defaultColChars =
    typeof ws.properties?.defaultColWidth === 'number' && ws.properties.defaultColWidth > 0
      ? ws.properties.defaultColWidth
      : 8.43;

  const colWidths: number[] = Array.from({ length: colCount }, (_, c) => {
    const col = ws.getColumn(c + 1);
    const chars =
      typeof col.width === 'number' && col.width > 0 ? col.width : defaultColChars;
    return Math.max(20, Math.min(1200, Math.round(chars * 7.5 + 5)));
  });

  const mergeByCoord = new Map<string, SheetMergeRange>();
  for (const m of parsedMerges) {
    if (m.endRow >= rowCount || m.endCol >= colCount) continue;
    for (let mr = m.startRow; mr <= m.endRow; mr++) {
      for (let mc = m.startCol; mc <= m.endCol; mc++) {
        mergeByCoord.set(cellKey(mr, mc), m);
      }
    }
  }

  const defaultRowPts =
    typeof ws.properties?.defaultRowHeight === 'number' && ws.properties.defaultRowHeight > 0
      ? ws.properties.defaultRowHeight
      : 15;
  const defaultRowPx = Math.max(18, Math.round(defaultRowPts * 1.333));

  const rowHeights: number[] = Array.from({ length: rowCount }, (_, r) => {
    const row = ws.getRow(r + 1);
    const pts = row.height;
    if (typeof pts === 'number' && pts > 0) {
      return Math.max(16, Math.min(400, Math.round(pts * 1.333)));
    }
    // Estimate auto-height for cells with text when row.height is unset in Excel
    let estimatedPx = defaultRowPx;
    for (let c = 0; c < colCount; c++) {
      const m = mergeByCoord.get(cellKey(r, c));
      if (m && (m.startRow !== r || m.startCol !== c)) continue;
      if (m && m.endRow > m.startRow) continue;
      const cell = row.getCell(c + 1);
      const txt = extractExcelCellText(cell);
      if (!txt) continue;
      const spanCols = m ? m.endCol - m.startCol + 1 : 1;
      let cellPx = 0;
      for (let sc = c; sc < c + spanCols; sc++) {
        cellPx += colWidths[sc] ?? 70;
      }
      const fontSizePx =
        typeof cell.font?.size === 'number' && cell.font.size > 0
          ? Math.round(cell.font.size / 0.9)
          : 11;
      const avgCharPx = Math.max(5.5, fontSizePx * 0.58);
      const charsPerLine = Math.max(4, Math.floor((cellPx - 12) / avgCharPx));
      const lines = txt.split('\n').reduce((sum, part) => {
        return sum + Math.max(1, Math.ceil(part.length / charsPerLine));
      }, 0);
      const needed = lines * Math.ceil(fontSizePx * 1.38) + 8;
      if (needed > estimatedPx) estimatedPx = needed;
    }
    return Math.max(18, Math.min(400, estimatedPx));
  });

  const cells: Record<string, SheetCell> = {};
  const detectedLoopRows = new Set<number>();
  const activityTokenRegex =
    /\{\{(?:no|tanggal|hari|jam|jam_mulai|jam_selesai|durasi|activity|remark|project_name|project_code|aplikasi_berdampak|proyek|kategori|status|pic|status_hadir|hadir_p)\}\}|\{\{[^{}:]+:[\s\S]+\}\}/i;

  for (let r = 0; r < rowCount; r++) {
    const excelRow = ws.getRow(r + 1);
    for (let c = 0; c < colCount; c++) {
      const coveringMerge = mergeByCoord.get(cellKey(r, c));
      // Skip slave cells inside merged ranges so master value/style is never duplicated into hidden coordinates
      if (
        coveringMerge &&
        (coveringMerge.startRow !== r || coveringMerge.startCol !== c)
      ) {
        continue;
      }

      const cell = excelRow.getCell(c + 1);
      const textVal = extractExcelCellText(cell);
      if (activityTokenRegex.test(textVal)) {
        detectedLoopRows.add(r);
      }

      const style: SheetCellStyle = {};
      let hasStyle = false;

      if (cell.font) {
        if (cell.font.bold) {
          style.bold = true;
          hasStyle = true;
        }
        if (cell.font.italic) {
          style.italic = true;
          hasStyle = true;
        }
        if (typeof cell.font.size === 'number' && cell.font.size > 0) {
          style.fontSize = Math.max(8, Math.min(36, Math.round(cell.font.size / 0.9)));
          hasStyle = true;
        }
        const txtColor = resolveExcelColor(cell.font.color, themePalette);
        if (txtColor) {
          style.textColor = txtColor;
          hasStyle = true;
        }
      }

      let bgHex = extractFillBgColor(cell, themePalette);
      if (!bgHex && coveringMerge) {
        for (let mr = coveringMerge.startRow; mr <= coveringMerge.endRow && !bgHex; mr++) {
          const mRow = ws.getRow(mr + 1);
          for (let mc = coveringMerge.startCol; mc <= coveringMerge.endCol && !bgHex; mc++) {
            bgHex = extractFillBgColor(mRow.getCell(mc + 1), themePalette);
          }
        }
      }
      if (bgHex) {
        style.bgColor = bgHex;
        hasStyle = true;
      }

      const hAlign = cell.alignment?.horizontal as string | undefined;
      if (hAlign === 'left' || hAlign === 'center' || hAlign === 'right') {
        style.align = hAlign as ColumnAlign;
        hasStyle = true;
      } else if (hAlign === 'centerContinuous') {
        style.align = 'center';
        hasStyle = true;
      }

      const vAlign = cell.alignment?.vertical as string | undefined;
      if (vAlign === 'top' || vAlign === 'middle' || vAlign === 'bottom') {
        style.verticalAlign = vAlign as VerticalAlign;
        hasStyle = true;
      } else if (vAlign === 'center') {
        style.verticalAlign = 'middle';
        hasStyle = true;
      }

      // Resolve borders accurately (checking perimeter cells for merged ranges!)
      let topB: { width: number; color: string } | null = null;
      let rightB: { width: number; color: string } | null = null;
      let bottomB: { width: number; color: string } | null = null;
      let leftB: { width: number; color: string } | null = null;

      if (coveringMerge) {
        const topRow = ws.getRow(coveringMerge.startRow + 1);
        for (let mc = coveringMerge.startCol; mc <= coveringMerge.endCol && !topB; mc++) {
          topB = extractSideBorderSpec(topRow.getCell(mc + 1).border?.top, themePalette);
        }
        const botRow = ws.getRow(coveringMerge.endRow + 1);
        for (let mc = coveringMerge.startCol; mc <= coveringMerge.endCol && !bottomB; mc++) {
          bottomB = extractSideBorderSpec(botRow.getCell(mc + 1).border?.bottom, themePalette);
        }
        for (let mr = coveringMerge.startRow; mr <= coveringMerge.endRow && !leftB; mr++) {
          leftB = extractSideBorderSpec(
            ws.getRow(mr + 1).getCell(coveringMerge.startCol + 1).border?.left,
            themePalette
          );
        }
        for (let mr = coveringMerge.startRow; mr <= coveringMerge.endRow && !rightB; mr++) {
          rightB = extractSideBorderSpec(
            ws.getRow(mr + 1).getCell(coveringMerge.endCol + 1).border?.right,
            themePalette
          );
        }
      } else {
        topB = extractSideBorderSpec(cell.border?.top, themePalette);
        rightB = extractSideBorderSpec(cell.border?.right, themePalette);
        bottomB = extractSideBorderSpec(cell.border?.bottom, themePalette);
        leftB = extractSideBorderSpec(cell.border?.left, themePalette);
      }

      const activeSides = [topB, rightB, bottomB, leftB].filter(
        (s): s is { width: number; color: string } => s !== null
      );

      if (activeSides.length > 0) {
        style.border = true;
        style.borderWidth = activeSides[0].width;
        style.borderColor = activeSides[0].color;

        const allSame =
          activeSides.length === 4 &&
          activeSides.every(
            (s) => s.width === activeSides[0].width && s.color === activeSides[0].color
          );
        if (!allSame) {
          style.borderSides = {
            ...(topB ? { top: topB } : {}),
            ...(rightB ? { right: rightB } : {}),
            ...(bottomB ? { bottom: bottomB } : {}),
            ...(leftB ? { left: leftB } : {}),
          };
        }
        hasStyle = true;
      }

      if (textVal || hasStyle) {
        cells[cellKey(r, c)] = {
          value: textVal,
          ...(hasStyle ? { style } : {}),
        };
      }
    }
  }

  const images: SheetImage[] = [];
  for (let i = 0; i < wsImages.length; i++) {
    const imgRef = wsImages[i];
    const imgData = workbook.getImage(Number(imgRef.imageId));
    if (!imgData || !imgData.buffer) continue;

    const ext = (imgData.extension || 'png').toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'gif'
        ? 'image/gif'
        : 'image/png';
    const base64 = bufferToBase64(imgData.buffer);
    const dataUrl = `data:${mime};base64,${base64}`;

    const tlCol = imgRef.range?.tl?.nativeCol ?? imgRef.range?.tl?.col ?? 0;
    const tlRow = imgRef.range?.tl?.nativeRow ?? imgRef.range?.tl?.row ?? 0;
    const xPx = excelCoordToPx(colWidths, tlCol, 70);
    const yPx = excelCoordToPx(rowHeights, tlRow, 20);

    const extSize = (imgRef.range as unknown as { ext?: { width?: number; height?: number } })?.ext;
    let widthPx = extSize?.width ? Math.round(extSize.width) : 0;
    let heightPx = extSize?.height ? Math.round(extSize.height) : 0;

    if (!widthPx || !heightPx) {
      const brCol = imgRef.range?.br?.nativeCol ?? imgRef.range?.br?.col ?? tlCol + 1;
      const brRow = imgRef.range?.br?.nativeRow ?? imgRef.range?.br?.row ?? tlRow + 2;
      const endX = excelCoordToPx(colWidths, brCol, 70);
      const endY = excelCoordToPx(rowHeights, brRow, 20);
      widthPx = Math.max(36, endX - xPx);
      heightPx = Math.max(36, endY - yPx);
    }

    images.push({
      id: `img-imp-${Date.now()}-${i}`,
      dataUrl,
      xPx,
      yPx,
      widthPx: Math.max(24, Math.min(960, widthPx)),
      heightPx: Math.max(24, Math.min(480, heightPx)),
      label: `Logo ${i + 1}`,
    });
  }

  const merges = parsedMerges.filter(
    (m) => m.endRow < rowCount && m.endCol < colCount
  );
  const loopIndices = Array.from(detectedLoopRows).sort((a, b) => a - b);

  const sheetTemplate: SheetTemplate = {
    colWidths,
    rowHeights,
    cells,
    merges,
    images,
    dataRowIndex: loopIndices[0] ?? null,
    dataRowIndices: loopIndices,
  };

  const baseName = file.name
    .replace(/\.xlsx?$/i, '')
    .replace(/^template[-_\s]*/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const orientation =
    ws.pageSetup?.orientation === 'portrait' ? 'portrait' : 'landscape';

  return normalizeImportedProfile(
    {
      vendorName: baseName || ws.name || 'Template Excel Impor',
      reportTitle: 'LAPORAN AKTIVITAS HARIAN',
      paperOrientation: orientation,
      logoDataUrl: images[0]?.dataUrl ?? '',
      sheetTemplate,
    },
    0,
    takenNames
  );
}

export async function importVendorTemplatesFromFile(
  file: File,
  existingProfiles: VendorProfile[]
): Promise<VendorProfile[]> {
  const takenNames = new Set(
    existingProfiles.map((p) => p.vendorName.trim().toLowerCase())
  );
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const profile = await importFromExcelFile(file, takenNames);
    return [profile];
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Berkas JSON tidak valid atau rusak.');
  }

  const rawList: Partial<VendorProfile>[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isVendorProfileLike(item)) rawList.push(item);
    }
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.profiles)) {
      for (const item of obj.profiles) {
        if (isVendorProfileLike(item)) rawList.push(item);
      }
    } else if (Array.isArray((obj as unknown as BackupPayload).vendorProfiles)) {
      for (const item of (obj as unknown as BackupPayload).vendorProfiles) {
        if (isVendorProfileLike(item)) rawList.push(item);
      }
    } else if (obj.profile && isVendorProfileLike(obj.profile)) {
      rawList.push(obj.profile);
    } else if (isVendorProfileLike(obj)) {
      rawList.push(obj);
    }
  }

  if (rawList.length === 0) {
    throw new Error(
      'Berkas tidak berisi data template vendor yang dikenali. Gunakan file .json template Timesheetly atau file .xlsx.'
    );
  }

  return rawList.map((raw, idx) => normalizeImportedProfile(raw, idx, takenNames));
}
