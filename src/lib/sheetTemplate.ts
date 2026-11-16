import type {
  ActivityEntry,
  ColumnConfig,
  DateDisplayFormat,
  SheetCell,
  SheetCellStyle,
  SheetImage,
  SheetMergeRange,
  SheetTemplate,
  TimeDisplayFormat,
  VendorProfile,
} from '../types';
import {
  formatDateByPattern,
  formatDurationDecimalHours,
  formatStatusLabel,
  formatTimeByPattern,
  formatTimeRangeByPattern,
  getIndonesianDayName,
  lookupCustomValue,
} from './formatters';
import {
  isFormulaValue,
  remapFormulaForLoopExpansion,
} from './sheetFormulas';

export interface SheetRenderMeta {
  periodLabel: string;
  preparedByName: string;
  approvedByName: string;
  totalRows: number;
  totalMinutes: number;
  dateFormat?: DateDisplayFormat;
  timeFormat?: TimeDisplayFormat;
}

export interface DynamicTagOption {
  token: string;
  label: string;
  group: 'activity' | 'document';
}

export const ACTIVITY_DATA_TAGS: DynamicTagOption[] = [
  { token: '{{no}}', label: 'No.', group: 'activity' },
  { token: '{{tanggal}}', label: 'Tanggal', group: 'activity' },
  { token: '{{hari}}', label: 'Hari', group: 'activity' },
  { token: '{{jam}}', label: 'Jam', group: 'activity' },
  { token: '{{jam_mulai}}', label: 'Jam Mulai', group: 'activity' },
  { token: '{{jam_selesai}}', label: 'Jam Selesai', group: 'activity' },
  { token: '{{durasi}}', label: 'Durasi', group: 'activity' },
  { token: '{{activity}}', label: 'Activity', group: 'activity' },
  { token: '{{remark}}', label: 'Remark', group: 'activity' },
  { token: '{{project_name}}', label: 'Project Name', group: 'activity' },
  { token: '{{project_code}}', label: 'Project Code', group: 'activity' },
  { token: '{{aplikasi_berdampak}}', label: 'Aplikasi Berdampak', group: 'activity' },
  { token: '{{pic}}', label: 'Akun / PIC', group: 'activity' },
  { token: '{{jika_ada_activity:P}}', label: 'Hadir (P)', group: 'activity' },
];

export const CONDITIONAL_KEY_OPTIONS: { key: string; label: string }[] = [
  { key: 'jika_ada_activity', label: 'Jika ada Activity' },
  { key: 'jika_ada_jam', label: 'Jika ada Jam Kerja' },
  { key: 'jika_ada_jam_mulai', label: 'Jika ada Jam Mulai' },
  { key: 'jika_ada_jam_selesai', label: 'Jika ada Jam Selesai' },
  { key: 'jika_ada_durasi', label: 'Jika ada Durasi' },
  { key: 'jika_ada_remark', label: 'Jika ada Remark' },
  { key: 'jika_ada_project_name', label: 'Jika ada Project Name' },
  { key: 'jika_ada_project_code', label: 'Jika ada Project Code' },
  { key: 'jika_ada_aplikasi_berdampak', label: 'Jika ada Aplikasi Berdampak' },
  { key: 'jika_ada_pic', label: 'Jika ada Akun / PIC' },
  { key: 'jika_libur', label: 'Jika Hari Libur' },
  { key: 'jika_bukan_libur', label: 'Jika Bukan Hari Libur' },
  { key: 'jika_tidak_ada_activity', label: 'Jika Tidak Ada Activity' },
];

export const DOCUMENT_META_TAGS: DynamicTagOption[] = [
  { token: '{{vendor}}', label: 'Nama Vendor', group: 'document' },
  { token: '{{periode}}', label: 'Periode', group: 'document' },
  { token: '{{tanggal_cetak}}', label: 'Tanggal Cetak', group: 'document' },
  { token: '{{penyusun}}', label: 'Nama Penyusun', group: 'document' },
  { token: '{{penyetuju}}', label: 'Nama Penyetuju', group: 'document' },
  { token: '{{total_baris}}', label: 'Total Baris', group: 'document' },
  { token: '{{total_jam}}', label: 'Total Jam', group: 'document' },
];

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function colIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function columnConfigToToken(col: ColumnConfig): string {
  switch (col.sourceType) {
    case 'auto_index':
      return '{{no}}';
    case 'static_text':
      return col.staticValue ?? '';
    case 'custom':
      return `{{custom:${col.sourceKey}}}`;
    case 'field': {
      switch (col.sourceKey) {
        case 'date':
          return '{{tanggal}}';
        case 'day':
          return '{{hari}}';
        case 'timeRange':
          return '{{jam}}';
        case 'startTime':
          return '{{jam_mulai}}';
        case 'endTime':
          return '{{jam_selesai}}';
        case 'duration':
          return '{{durasi}}';
        case 'project':
          return '{{project_name}}';
        case 'category':
          return '{{project_code}}';
        case 'activity':
          return '{{activity}}';
        case 'remark':
          return '{{remark}}';
        case 'status':
          return '{{aplikasi_berdampak}}';
        case 'pic':
          return '{{pic}}';
        default:
          return '';
      }
    }
  }
}

export function profileToDefaultSheetTemplate(profile: VendorProfile): SheetTemplate {
  const visibleCols = profile.columns.filter((c) => c.visible);
  const colsToUse = visibleCols.length > 0 ? visibleCols : profile.columns;
  const colCount = Math.max(5, colsToUse.length);

  const colWidths: number[] = Array.from({ length: colCount }, (_, idx) => {
    const col = colsToUse[idx];
    if (!col) return 120;
    return Math.max(60, Math.min(360, Math.round((col.width || 16) * 8.5)));
  });

  // Rows:
  // 0: Title
  // 1: Vendor + Subtitle
  // 2: Periode
  // 3: Spacer
  // 4: Table Header
  // 5: Data Loop Row (dataRowIndex = 5)
  // 6: Summary (if showSummaryRow)
  // 7: Spacer
  // 8: Footer / Signatures label
  // 9..10: Signature space
  // 11: Signature names
  const rowHeights = [34, 26, 22, 16, 34, 42, 28, 16, 26, 26, 26, 26];
  const cells: Record<string, SheetCell> = {};
  const merges: SheetMergeRange[] = [];
  const images: SheetImage[] = [];

  const hasLogo = Boolean(profile.logoDataUrl);
  const totalWidthPx = colWidths.reduce((s, w) => s + w, 0);

  let textStartCol = 0;
  let textEndCol = colCount - 1;

  if (hasLogo && colCount >= 3) {
    if (profile.logoPosition === 'left') {
      textStartCol = 1;
    } else if (profile.logoPosition === 'right') {
      textEndCol = colCount - 2;
    }
  }

  if (textEndCol > textStartCol) {
    merges.push({ startRow: 0, startCol: textStartCol, endRow: 0, endCol: textEndCol });
    merges.push({ startRow: 1, startCol: textStartCol, endRow: 1, endCol: textEndCol });
    merges.push({ startRow: 2, startCol: textStartCol, endRow: 2, endCol: textEndCol });
  }

  const kopAlign = profile.logoPosition === 'center' ? 'center' : 'left';
  cells[cellKey(0, textStartCol)] = {
    value: profile.reportTitle || 'LAPORAN AKTIVITAS KERJA HARIAN',
    style: { bold: true, fontSize: 14, align: kopAlign, textColor: '#0F172A' },
  };
  cells[cellKey(1, textStartCol)] = {
    value: `${profile.vendorName}${profile.subtitle ? ` - ${profile.subtitle}` : ''}`,
    style: { bold: true, fontSize: 11, align: kopAlign, textColor: profile.headerBgColor },
  };
  cells[cellKey(2, textStartCol)] = {
    value: 'Periode: {{periode}}   |   Dicetak: {{tanggal_cetak}}',
    style: { fontSize: 10, align: kopAlign, textColor: '#64748B' },
  };

  if (hasLogo) {
    const logoSize = 68;
    let xPx = 8;
    if (profile.logoPosition === 'center') {
      xPx = Math.max(8, Math.round(totalWidthPx / 2 - logoSize / 2));
    } else if (profile.logoPosition === 'right') {
      xPx = Math.max(8, totalWidthPx - logoSize - 12);
    }
    images.push({
      id: `img-${Date.now()}`,
      dataUrl: profile.logoDataUrl,
      xPx,
      yPx: 6,
      widthPx: logoSize,
      heightPx: logoSize,
      label: profile.vendorName,
    });
  }

  // Row 4: Table Headers & Row 5: Data Loop
  colsToUse.forEach((col, cIdx) => {
    cells[cellKey(4, cIdx)] = {
      value: col.headerLabel,
      style: {
        bold: true,
        align: col.align,
        bgColor: profile.headerBgColor || '#1E3A8A',
        textColor: profile.headerTextColor || '#FFFFFF',
        border: true,
        fontSize: 11,
      },
    };
    cells[cellKey(5, cIdx)] = {
      value: columnConfigToToken(col),
      style: {
        align: col.align,
        border: true,
        fontSize: 11,
        textColor: '#0F172A',
      },
    };
  });

  // Row 6: Summary row
  if (profile.showSummaryRow) {
    merges.push({ startRow: 6, startCol: 0, endRow: 6, endCol: colCount - 1 });
    cells[cellKey(6, 0)] = {
      value: 'Total: {{total_baris}} aktivitas · Total Durasi: {{total_jam}}',
      style: {
        bold: true,
        align: 'right',
        bgColor: '#F1F5F9',
        textColor: '#1E293B',
        border: true,
        fontSize: 11,
      },
    };
  }

  // Row 8 & 11: Signatures
  const leftEnd = Math.min(1, colCount - 1);
  if (leftEnd > 0) {
    merges.push({ startRow: 8, startCol: 0, endRow: 8, endCol: leftEnd });
    merges.push({ startRow: 11, startCol: 0, endRow: 11, endCol: leftEnd });
  }
  cells[cellKey(8, 0)] = {
    value: profile.preparedByLabel || 'Disusun Oleh',
    style: { bold: true, align: 'center', fontSize: 11, textColor: '#334155' },
  };
  cells[cellKey(11, 0)] = {
    value: '( {{penyusun}} )',
    style: { bold: true, align: 'center', fontSize: 11, textColor: '#0F172A' },
  };

  if (colCount >= 3) {
    const rightStart = Math.max(leftEnd + 1, colCount - 2);
    if (colCount - 1 > rightStart) {
      merges.push({ startRow: 8, startCol: rightStart, endRow: 8, endCol: colCount - 1 });
      merges.push({ startRow: 11, startCol: rightStart, endRow: 11, endCol: colCount - 1 });
    }
    cells[cellKey(8, rightStart)] = {
      value: profile.approvedByLabel || 'Disetujui Oleh',
      style: { bold: true, align: 'center', fontSize: 11, textColor: '#334155' },
    };
    cells[cellKey(11, rightStart)] = {
      value: '( {{penyetuju}} )',
      style: { bold: true, align: 'center', fontSize: 11, textColor: '#0F172A' },
    };
  }

  return {
    colWidths,
    rowHeights,
    cells,
    merges,
    images,
    dataRowIndex: 5,
    dataRowIndices: [5],
  };
}

export function getLoopRowIndices(sheet: SheetTemplate): number[] {
  const maxRow = sheet.rowHeights.length;
  const raw = Array.isArray(sheet.dataRowIndices)
    ? sheet.dataRowIndices
    : sheet.dataRowIndex !== null && sheet.dataRowIndex !== undefined
    ? [sheet.dataRowIndex]
    : [];
  const valid = raw.filter((r) => Number.isInteger(r) && r >= 0 && r < maxRow);
  return Array.from(new Set(valid)).sort((a, b) => a - b);
}

export function withLoopRowIndices(
  sheet: SheetTemplate,
  indices: number[]
): SheetTemplate {
  const maxRow = sheet.rowHeights.length;
  const normalized = Array.from(
    new Set(indices.filter((r) => Number.isInteger(r) && r >= 0 && r < maxRow))
  ).sort((a, b) => a - b);
  return {
    ...sheet,
    dataRowIndices: normalized,
    dataRowIndex: normalized[0] ?? null,
  };
}

export function ensureSheetTemplate(profile: VendorProfile): SheetTemplate {
  if (profile.sheetTemplate && profile.sheetTemplate.colWidths.length > 0) {
    return profile.sheetTemplate;
  }
  return profileToDefaultSheetTemplate(profile);
}

function normalizeTokenKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const BUILTIN_CONDITION_FIELDS = new Set([
  'activity',
  'remark',
  'jam',
  'time',
  'timerange',
  'jam_mulai',
  'start_time',
  'starttime',
  'jam_selesai',
  'end_time',
  'endtime',
  'durasi',
  'duration',
  'tanggal',
  'date',
  'hari',
  'day',
  'project_name',
  'project',
  'proyek',
  'project_code',
  'category',
  'kategori',
  'aplikasi_berdampak',
  'status',
  'pic',
  'akun',
  'libur',
  'hari_libur',
  'holiday',
  'is_holiday',
  'bukan_libur',
  'hari_kerja',
  'workday',
  'data',
  'row',
  'entry',
]);

function hasCustomFieldKey(
  customValues: Record<string, string> | undefined,
  fieldKey: string
): boolean {
  if (!customValues) return false;
  const trimmed = fieldKey.trim();
  if (!trimmed) return false;
  if (trimmed in customValues) return true;
  const lower = trimmed.toLowerCase();
  const norm = normalizeTokenKey(trimmed);
  for (const k of Object.keys(customValues)) {
    if (k.trim().toLowerCase() === lower || normalizeTokenKey(k) === norm) {
      return true;
    }
  }
  return false;
}

function getEntryFieldRawValue(
  entry: ActivityEntry | null,
  fieldKey: string,
  dateFormat: DateDisplayFormat,
  timeFormat: TimeDisplayFormat
): string {
  if (!entry) return '';
  const norm = normalizeTokenKey(fieldKey);
  switch (norm) {
    case 'activity':
      return entry.activity?.trim() ?? '';
    case 'remark':
      return entry.remark?.trim() ?? '';
    case 'jam':
    case 'time':
    case 'timerange':
      return formatTimeRangeByPattern(entry.startTime, entry.endTime, timeFormat).trim();
    case 'jam_mulai':
    case 'start_time':
    case 'starttime':
      return formatTimeByPattern(entry.startTime, timeFormat).trim();
    case 'jam_selesai':
    case 'end_time':
    case 'endtime':
      return formatTimeByPattern(entry.endTime, timeFormat).trim();
    case 'durasi':
    case 'duration':
      return (entry.durationMinutes || 0) > 0
        ? formatDurationDecimalHours(entry.durationMinutes)
        : '';
    case 'tanggal':
    case 'date':
      return entry.date?.trim() ? formatDateByPattern(entry.date, dateFormat) : '';
    case 'hari':
    case 'day':
      return entry.date?.trim() ? getIndonesianDayName(entry.date) : '';
    case 'project_name':
    case 'project':
    case 'proyek':
      return entry.project?.trim() ?? '';
    case 'project_code':
    case 'category':
    case 'kategori':
      return entry.category?.trim() ?? '';
    case 'aplikasi_berdampak':
    case 'status':
      return entry.status?.trim() ?? '';
    case 'pic':
    case 'akun':
      return entry.pic?.trim() ?? '';
    case 'libur':
    case 'hari_libur':
    case 'holiday':
    case 'is_holiday':
      return entry.isHoliday ? 'true' : '';
    case 'bukan_libur':
    case 'hari_kerja':
    case 'workday':
      return !entry.isHoliday ? 'true' : '';
    case 'data':
    case 'row':
    case 'entry':
      return 'true';
    default:
      return lookupCustomValue(entry.customValues, fieldKey);
  }
}

function isEntryFieldPresent(
  entry: ActivityEntry | null,
  fieldKey: string,
  dateFormat: DateDisplayFormat,
  timeFormat: TimeDisplayFormat
): boolean {
  if (!entry) return false;
  const norm = normalizeTokenKey(fieldKey);
  const raw = getEntryFieldRawValue(entry, fieldKey, dateFormat, timeFormat).trim();
  if (!raw || raw === '-') return false;
  if (!BUILTIN_CONDITION_FIELDS.has(norm)) {
    const lower = raw.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'tidak') {
      return false;
    }
  }
  return true;
}

function evaluateConditionalToken(
  rawKey: string,
  rawOutput: string,
  entry: ActivityEntry | null,
  dateFormat: DateDisplayFormat,
  timeFormat: TimeDisplayFormat
): string | null {
  const keyTrimmed = rawKey.trim();
  const keyLower = keyTrimmed.toLowerCase();
  if (keyLower === 'custom') return null;

  const pipeIdx = rawOutput.indexOf('|');
  const trueText = pipeIdx >= 0 ? rawOutput.slice(0, pipeIdx) : rawOutput;
  const falseText = pipeIdx >= 0 ? rawOutput.slice(pipeIdx + 1) : '';

  if (!entry) return falseText;

  const eqMatch = /^(?:jika_|if_)?(.+?)(!=|=)(.+)$/i.exec(keyTrimmed);
  if (eqMatch) {
    const [, rawField, op, expected] = eqMatch;
    const actual = getEntryFieldRawValue(entry, rawField, dateFormat, timeFormat);
    const isMatch = actual.toLowerCase() === expected.trim().toLowerCase();
    return (op === '!=' ? !isMatch : isMatch) ? trueText : falseText;
  }

  const keyNorm = normalizeTokenKey(keyTrimmed);
  const negMatch =
    /^(?:jika_tidak_ada|jika_kosong|if_empty|if_not|jika_bukan|bukan)_(.+)$/i.exec(
      keyNorm
    );
  if (negMatch) {
    return !isEntryFieldPresent(entry, negMatch[1], dateFormat, timeFormat)
      ? trueText
      : falseText;
  }

  const posMatch = /^(?:jika_ada|if_has)_(.+)$/i.exec(keyNorm);
  if (posMatch) {
    return isEntryFieldPresent(entry, posMatch[1], dateFormat, timeFormat)
      ? trueText
      : falseText;
  }

  const ifPrefixMatch = /^(?:jika|if)_(.+)$/i.exec(keyNorm);
  if (ifPrefixMatch) {
    const field = ifPrefixMatch[1];
    if (
      BUILTIN_CONDITION_FIELDS.has(normalizeTokenKey(field)) ||
      hasCustomFieldKey(entry.customValues, field)
    ) {
      return isEntryFieldPresent(entry, field, dateFormat, timeFormat)
        ? trueText
        : falseText;
    }
    return isEntryFieldPresent(entry, 'activity', dateFormat, timeFormat)
      ? trueText
      : falseText;
  }

  if (
    BUILTIN_CONDITION_FIELDS.has(keyNorm) ||
    hasCustomFieldKey(entry.customValues, keyTrimmed)
  ) {
    return isEntryFieldPresent(entry, keyTrimmed, dateFormat, timeFormat)
      ? trueText
      : falseText;
  }

  // Arbitrary custom key name (e.g. {{hadir:P}}, {{present:P}}, {{status_absen:P}})
  return isEntryFieldPresent(entry, 'activity', dateFormat, timeFormat)
    ? trueText
    : falseText;
}

export function resolveSheetCellText(
  rawValue: string,
  profile: VendorProfile,
  entry: ActivityEntry | null,
  rowIndex: number,
  meta: SheetRenderMeta
): string {
  if (!rawValue) return '';
  let text = rawValue;

  const dateFormat = meta.dateFormat ?? 'yyyy-mm-dd';
  const timeFormat = meta.timeFormat ?? 'HH:mm';
  const printDate = formatDateByPattern(new Date().toISOString().slice(0, 10), dateFormat);
  const totalDur = formatDurationDecimalHours(meta.totalMinutes);

  text = text
    .replace(/\{\{vendor\}\}/gi, profile.vendorName)
    .replace(/\{\{periode\}\}/gi, meta.periodLabel || '-')
    .replace(/\{\{tanggal_cetak\}\}/gi, printDate)
    .replace(/\{\{penyusun\}\}/gi, meta.preparedByName || '____________________')
    .replace(/\{\{penyetuju\}\}/gi, meta.approvedByName || '____________________')
    .replace(/\{\{total_baris\}\}/gi, String(meta.totalRows))
    .replace(/\{\{total_jam\}\}/gi, totalDur);

  const hasActivity = Boolean(entry && entry.activity.trim().length > 0);
  text = text
    .replace(/\{\{([^{}:]+):([^}]*)\}\}/g, (fullMatch, rawKey: string, rawOutput: string) => {
      const evaluated = evaluateConditionalToken(
        rawKey,
        rawOutput,
        entry,
        dateFormat,
        timeFormat
      );
      return evaluated !== null ? evaluated : fullMatch;
    })
    .replace(/\{\{(?:status_hadir|hadir_p)\}\}/gi, hasActivity ? 'P' : '');

  if (entry) {
    text = text
      .replace(/\{\{no\}\}/gi, String(rowIndex + 1))
      .replace(/\{\{tanggal\}\}/gi, formatDateByPattern(entry.date, dateFormat))
      .replace(/\{\{hari\}\}/gi, getIndonesianDayName(entry.date))
      .replace(
        /\{\{jam\}\}/gi,
        formatTimeRangeByPattern(entry.startTime, entry.endTime, timeFormat)
      )
      .replace(/\{\{jam_mulai\}\}/gi, formatTimeByPattern(entry.startTime, timeFormat))
      .replace(/\{\{jam_selesai\}\}/gi, formatTimeByPattern(entry.endTime, timeFormat))
      .replace(/\{\{durasi\}\}/gi, formatDurationDecimalHours(entry.durationMinutes))
      .replace(/\{\{activity\}\}/gi, entry.activity)
      .replace(/\{\{remark\}\}/gi, entry.remark?.trim() || entry.activity)
      .replace(/\{\{(?:project_name|proyek)\}\}/gi, entry.project || '-')
      .replace(/\{\{(?:project_code|kategori)\}\}/gi, entry.category || '-')
      .replace(/\{\{(?:aplikasi_berdampak|status)\}\}/gi, formatStatusLabel(entry.status))
      .replace(/\{\{pic\}\}/gi, entry.pic || '-')
      .replace(/\{\{custom:([^}]+)\}\}/gi, (_, key: string) => {
        return lookupCustomValue(entry.customValues, key) || '-';
      });
  }

  return text;
}

export function getCellSideBorder(
  style: SheetCellStyle | undefined,
  side: 'top' | 'right' | 'bottom' | 'left'
): { width: number; color: string } | null {
  if (!style?.border) return null;
  const fallbackWidth = style.borderWidth ?? 1;
  const fallbackColor = style.borderColor || '#94a3b8';
  if (!style.borderSides) {
    return { width: fallbackWidth, color: fallbackColor };
  }
  const sideCfg = style.borderSides[side];
  if (!sideCfg) return null;
  if (sideCfg === true) {
    return { width: fallbackWidth, color: fallbackColor };
  }
  return {
    width: sideCfg.width ?? fallbackWidth,
    color: sideCfg.color || fallbackColor,
  };
}

export function extractCustomKeysFromProfile(
  profile: VendorProfile
): { key: string; label: string }[] {
  const result = new Map<string, string>();
  for (const col of profile.columns) {
    if (col.sourceType === 'custom' && col.sourceKey.trim()) {
      result.set(col.sourceKey.trim(), col.headerLabel || col.sourceKey.trim());
    }
  }
  if (profile.sheetTemplate) {
    const regex = /\{\{custom:([^}]+)\}\}/gi;
    for (const [keyCoord, cell] of Object.entries(profile.sheetTemplate.cells)) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(cell.value)) !== null) {
        const customKey = match[1].trim();
        if (!result.has(customKey)) {
          const [rStr, cStr] = keyCoord.split(',');
          const headerCell =
            profile.sheetTemplate.cells[cellKey(Math.max(0, Number(rStr) - 1), Number(cStr))];
          result.set(customKey, headerCell?.value?.trim() || customKey);
        }
      }
    }
  }
  return Array.from(result.entries()).map(([key, label]) => ({ key, label }));
}

export function getMergeCoveringCell(
  merges: SheetMergeRange[],
  row: number,
  col: number
): SheetMergeRange | null {
  for (const m of merges) {
    if (row >= m.startRow && row <= m.endRow && col >= m.startCol && col <= m.endCol) {
      return m;
    }
  }
  return null;
}

export function pxOffsetToExcelCol(colWidths: number[], xPx: number): number {
  let remaining = Math.max(0, xPx);
  for (let i = 0; i < colWidths.length; i++) {
    const w = Math.max(24, colWidths[i] || 100);
    if (remaining <= w) {
      return i + remaining / w;
    }
    remaining -= w;
  }
  const lastW = Math.max(24, colWidths[colWidths.length - 1] || 100);
  return colWidths.length + remaining / lastW;
}

export function pxOffsetToExcelRow(rowHeights: number[], yPx: number): number {
  let remaining = Math.max(0, yPx);
  for (let i = 0; i < rowHeights.length; i++) {
    const h = Math.max(18, rowHeights[i] || 28);
    if (remaining <= h) {
      return i + remaining / h;
    }
    remaining -= h;
  }
  const lastH = Math.max(18, rowHeights[rowHeights.length - 1] || 28);
  return rowHeights.length + remaining / lastH;
}

export function buildLoopedSheetFromTemplate(
  profile: VendorProfile,
  activities: ActivityEntry[],
  meta: Omit<SheetRenderMeta, 'totalRows' | 'totalMinutes'>
): SheetTemplate {
  const tpl = ensureSheetTemplate(profile);
  const colCount = tpl.colWidths.length;
  const rowCount = tpl.rowHeights.length;
  const loopRows = getLoopRowIndices(tpl);
  const loopSet = new Set(loopRows);

  const totalMinutes = activities.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  const renderMeta: SheetRenderMeta = {
    ...meta,
    totalRows: activities.length,
    totalMinutes,
  };

  const outRowHeights: number[] = [];
  const outCells: Record<string, SheetCell> = {};
  const outMerges: SheetMergeRange[] = [];

  // Track original row top Y and output row top Y so images shift accurately across any number of loop rows
  const origRowTop: number[] = [];
  const outRowStart: number[] = [];
  const outRowEnd: number[] = [];
  const outRowTop: number[] = [];
  const formulaRemapQueue: {
    key: string;
    origRow: number;
    outRow: number;
  }[] = [];

  let accOrigY = 0;
  for (let r = 0; r < rowCount; r++) {
    origRowTop.push(accOrigY);
    accOrigY += tpl.rowHeights[r] || 24;
  }

  let accOutY = 0;
  let outRow = 0;
  let r = 0;

  while (r < rowCount) {
    if (loopSet.has(r)) {
      // Group contiguous loop rows into one repeating block per activity entry
      const blockStart = r;
      let blockEnd = r;
      while (blockEnd + 1 < rowCount && loopSet.has(blockEnd + 1)) {
        blockEnd++;
      }

      const items: (ActivityEntry | null)[] = activities.length > 0 ? activities : [null];

      items.forEach((entry, idx) => {
        const iterOutStart = outRow;
        for (let br = blockStart; br <= blockEnd; br++) {
          if (idx === 0) {
            outRowStart[br] = outRow;
            outRowTop[br] = accOutY;
          }
          outRowEnd[br] = outRow;
          const h = tpl.rowHeights[br] || 32;
          outRowHeights.push(h);
          accOutY += h;

          for (let c = 0; c < colCount; c++) {
            const srcCell = tpl.cells[cellKey(br, c)];
            if (srcCell) {
              const hasActivityToken =
                Boolean(entry?.activityFormat) &&
                /\{\{activity\}\}/i.test(srcCell.value);
              const nextStyle = srcCell.style ? { ...srcCell.style } : undefined;
              const holidayRowColor =
                entry?.rowColor || (entry?.isHoliday ? '#A6A6A6' : undefined);
              const baseStyle = holidayRowColor
                ? { ...(nextStyle ?? {}), bgColor: holidayRowColor }
                : nextStyle;
              const mergedStyle =
                hasActivityToken && entry?.activityFormat
                  ? {
                      ...(baseStyle ?? {}),
                      ...(entry.activityFormat.bold ? { bold: true } : {}),
                      ...(entry.activityFormat.italic ? { italic: true } : {}),
                      ...(entry.activityFormat.align
                        ? { align: entry.activityFormat.align }
                        : {}),
                    }
                  : baseStyle;

              const targetK = cellKey(outRow, c);
              const resolvedValue = resolveSheetCellText(
                srcCell.value,
                profile,
                entry,
                idx,
                renderMeta
              );
              outCells[targetK] = {
                value: resolvedValue,
                style: mergedStyle,
              };
              if (isFormulaValue(resolvedValue)) {
                formulaRemapQueue.push({ key: targetK, origRow: br, outRow });
              }
            } else if (entry?.rowColor || entry?.isHoliday) {
              outCells[cellKey(outRow, c)] = {
                value: '',
                style: {
                  bgColor: entry.rowColor || '#A6A6A6',
                },
              };
            }
          }
          outRow++;
        }

        // Replicate merges contained within this contiguous loop block
        for (const m of tpl.merges) {
          if (m.startRow >= blockStart && m.endRow <= blockEnd) {
            outMerges.push({
              startRow: iterOutStart + (m.startRow - blockStart),
              startCol: m.startCol,
              endRow: iterOutStart + (m.endRow - blockStart),
              endCol: m.endCol,
            });
          }
        }
      });

      r = blockEnd + 1;
    } else {
      outRowStart[r] = outRow;
      outRowEnd[r] = outRow;
      outRowTop[r] = accOutY;
      const h = tpl.rowHeights[r] || 24;
      outRowHeights.push(h);
      accOutY += h;

      for (let c = 0; c < colCount; c++) {
        const srcCell = tpl.cells[cellKey(r, c)];
        if (srcCell) {
          const targetK = cellKey(outRow, c);
          const resolvedValue = resolveSheetCellText(
            srcCell.value,
            profile,
            null,
            0,
            renderMeta
          );
          outCells[targetK] = {
            value: resolvedValue,
            style: srcCell.style ? { ...srcCell.style } : undefined,
          };
          if (isFormulaValue(resolvedValue)) {
            formulaRemapQueue.push({ key: targetK, origRow: r, outRow });
          }
        }
      }

      for (const m of tpl.merges) {
        if (m.startRow === r && !loopSet.has(m.endRow)) {
          const spanRows = m.endRow - m.startRow;
          outMerges.push({
            startRow: outRow,
            startCol: m.startCol,
            endRow: outRow + spanRows,
            endCol: m.endCol,
          });
        }
      }

      outRow++;
      r++;
    }
  }

  // Rewrite formula cell references after outRowStart/outRowEnd are completely built
  for (const item of formulaRemapQueue) {
    const cellObj = outCells[item.key];
    if (!cellObj) continue;
    const isInsideLoop = loopSet.has(item.origRow);
    cellObj.value = remapFormulaForLoopExpansion(
      cellObj.value,
      outRowStart,
      outRowEnd,
      isInsideLoop ? item.origRow : undefined,
      isInsideLoop ? item.outRow : undefined
    );
  }

  const totalOrigHeight = accOrigY;
  const totalOutHeight = accOutY;

  const outImages: SheetImage[] = tpl.images.map((img) => {
    let shiftY = 0;
    if (rowCount > 0) {
      if (img.yPx >= totalOrigHeight) {
        shiftY = totalOutHeight - totalOrigHeight;
      } else {
        for (let i = rowCount - 1; i >= 0; i--) {
          if (img.yPx >= origRowTop[i]) {
            shiftY = (outRowTop[i] ?? origRowTop[i]) - origRowTop[i];
            break;
          }
        }
      }
    }
    return {
      ...img,
      id: `${img.id}-${Date.now()}`,
      yPx: Math.max(0, Math.round(img.yPx + shiftY)),
    };
  });

  return {
    colWidths: [...tpl.colWidths],
    rowHeights: outRowHeights,
    cells: outCells,
    merges: outMerges,
    images: outImages,
    dataRowIndex: null,
    dataRowIndices: [],
  };
}
