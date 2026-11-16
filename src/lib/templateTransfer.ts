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
          ? materializedSheet.colWidths.map((w) => Math.max(40, Math.min(480, Number(w) || 100)))
          : [100, 120, 120, 220],
      rowHeights:
        Array.isArray(materializedSheet.rowHeights) && materializedSheet.rowHeights.length > 0
          ? materializedSheet.rowHeights.map((h) => Math.max(18, Math.min(260, Number(h) || 24)))
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
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result);
    }
    if ('formula' in val && typeof val.formula === 'string') {
      return cell.text || '';
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

  const parsedMerges: SheetMergeRange[] = [];
  const rawMerges = ws.model?.merges ?? [];
  for (const mStr of rawMerges) {
    const parsed = parseExcelRange(mStr);
    if (parsed) parsedMerges.push(parsed);
  }

  let maxRow = Math.max(ws.actualRowCount || 0, 1);
  let maxCol = Math.max(ws.actualColumnCount || 0, 1);
  for (const m of parsedMerges) {
    if (m.endRow + 1 > maxRow) maxRow = m.endRow + 1;
    if (m.endCol + 1 > maxCol) maxCol = m.endCol + 1;
  }

  const wsImages = ws.getImages();
  for (const imgRef of wsImages) {
    const brRow = imgRef.range?.br?.nativeRow ?? imgRef.range?.br?.row ?? 0;
    const brCol = imgRef.range?.br?.nativeCol ?? imgRef.range?.br?.col ?? 0;
    if (Math.ceil(brRow) + 1 > maxRow) maxRow = Math.ceil(brRow) + 1;
    if (Math.ceil(brCol) + 1 > maxCol) maxCol = Math.ceil(brCol) + 1;
  }

  const rowCount = Math.max(6, Math.min(200, maxRow));
  const colCount = Math.max(4, Math.min(40, maxCol));

  const colWidths: number[] = Array.from({ length: colCount }, (_, c) => {
    const col = ws.getColumn(c + 1);
    const chars = col.width;
    if (typeof chars === 'number' && chars > 0) {
      return Math.max(48, Math.min(420, Math.round(chars * 7.5)));
    }
    return 115;
  });

  const rowHeights: number[] = Array.from({ length: rowCount }, (_, r) => {
    const row = ws.getRow(r + 1);
    const pts = row.height;
    if (typeof pts === 'number' && pts > 0) {
      return Math.max(20, Math.min(180, Math.round(pts * 1.333)));
    }
    return 26;
  });

  const cells: Record<string, SheetCell> = {};
  const detectedLoopRows = new Set<number>();
  const activityTokenRegex =
    /\{\{(?:no|tanggal|hari|jam|jam_mulai|jam_selesai|durasi|activity|remark|project_name|project_code|aplikasi_berdampak|proyek|kategori|status|pic|custom:[^}]+)\}\}/i;

  for (let r = 0; r < rowCount; r++) {
    const excelRow = ws.getRow(r + 1);
    for (let c = 0; c < colCount; c++) {
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
          style.fontSize = Math.max(9, Math.min(24, Math.round(cell.font.size / 0.9)));
          hasStyle = true;
        }
        const txtColor = argbToHex(cell.font.color?.argb);
        if (txtColor) {
          style.textColor = txtColor;
          hasStyle = true;
        }
      }

      if (cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
        const bgHex = argbToHex(cell.fill.fgColor?.argb);
        if (bgHex && bgHex !== '#FFFFFF') {
          style.bgColor = bgHex;
          hasStyle = true;
        }
      }

      const hAlign = cell.alignment?.horizontal;
      if (hAlign === 'left' || hAlign === 'center' || hAlign === 'right') {
        style.align = hAlign as ColumnAlign;
        hasStyle = true;
      }

      const b = cell.border;
      if (b && (b.top?.style || b.bottom?.style || b.left?.style || b.right?.style)) {
        style.border = true;
        const firstBorder = b.top || b.bottom || b.left || b.right;
        const bStyle = firstBorder?.style;
        style.borderWidth =
          bStyle === 'thick'
            ? 3
            : bStyle === 'medium'
            ? 2
            : bStyle === 'hair'
            ? 0.5
            : 1;
        const bColor = argbToHex(firstBorder?.color?.argb);
        if (bColor) style.borderColor = bColor;
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
    const xPx = excelCoordToPx(colWidths, tlCol, 115);
    const yPx = excelCoordToPx(rowHeights, tlRow, 26);

    const extSize = (imgRef.range as unknown as { ext?: { width?: number; height?: number } })?.ext;
    let widthPx = extSize?.width ? Math.round(extSize.width) : 0;
    let heightPx = extSize?.height ? Math.round(extSize.height) : 0;

    if (!widthPx || !heightPx) {
      const brCol = imgRef.range?.br?.nativeCol ?? imgRef.range?.br?.col ?? tlCol + 1;
      const brRow = imgRef.range?.br?.nativeRow ?? imgRef.range?.br?.row ?? tlRow + 2;
      const endX = excelCoordToPx(colWidths, brCol, 115);
      const endY = excelCoordToPx(rowHeights, brRow, 26);
      widthPx = Math.max(36, endX - xPx);
      heightPx = Math.max(36, endY - yPx);
    }

    images.push({
      id: `img-imp-${Date.now()}-${i}`,
      dataUrl,
      xPx,
      yPx,
      widthPx: Math.max(24, Math.min(480, widthPx)),
      heightPx: Math.max(24, Math.min(360, heightPx)),
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
