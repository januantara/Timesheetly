import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import type {
  ActivityEntry,
  SheetCell,
  SheetMergeRange,
  SheetTemplate,
  VendorProfile,
} from '../types';
import {
  buildDefaultTimesheetFilename,
  sanitizeExportFilename,
} from './formatters';
import {
  evaluateSheetCell,
  getSheetCellDisplayValue,
  toExcelFormulaString,
} from './sheetFormulas';
import {
  buildLoopedSheetFromTemplate,
  cellKey,
  getCellSideBorder,
  getMergeCoveringCell,
  pxOffsetToExcelCol,
  pxOffsetToExcelRow,
} from './sheetTemplate';

export interface ExportMetadataOptions {
  periodLabel: string;
  preparedByName: string;
  approvedByName: string;
}

interface NormalizedPngImage {
  dataUrl: string;
  base64: string;
  width: number;
  height: number;
}

function hexToArgb(hex: string | undefined, fallback = 'FF0F172A'): string {
  if (!hex) return fallback;
  const cleaned = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `FF${cleaned.toUpperCase()}`;
  }
  return fallback;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function imageToPngDataUrl(src: string): Promise<NormalizedPngImage | null> {
  if (!src) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const targetMax = 420;
        const ratio = Math.min(
          1,
          targetMax / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
        );
        const width = Math.max(1, Math.round((img.naturalWidth || 120) * ratio));
        const height = Math.max(1, Math.round((img.naturalHeight || 120) * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({ dataUrl, base64, width, height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyCellStyleToExcel(
  excelCell: ExcelJS.Cell,
  cellData: SheetCell | undefined,
  rowWidthChars: number,
  textVal: string
): number {
  const st = cellData?.style;
  const fontSize = st?.fontSize ? Math.max(8, Math.round(st.fontSize * 0.9)) : 10;

  excelCell.font = {
    name: 'Calibri',
    size: fontSize,
    bold: Boolean(st?.bold),
    italic: Boolean(st?.italic),
    color: { argb: hexToArgb(st?.textColor, 'FF0F172A') },
  };

  if (st?.bgColor) {
    excelCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(st.bgColor, 'FFFFFFFF') },
    };
  }

  excelCell.alignment = {
    horizontal: st?.align ?? 'left',
    vertical: st?.verticalAlign ?? 'middle',
    wrapText: true,
  };

  if (st?.border) {
    const toExcelBorder = (
      sideSpec: { width: number; color: string } | null
    ): Partial<ExcelJS.Border> | undefined => {
      if (!sideSpec) return undefined;
      const bWidth = sideSpec.width;
      const excelBorderStyle: ExcelJS.BorderStyle =
        bWidth <= 0.75
          ? 'hair'
          : bWidth <= 1.5
          ? 'thin'
          : bWidth <= 2.5
          ? 'medium'
          : 'thick';
      return {
        style: excelBorderStyle,
        color: { argb: hexToArgb(sideSpec.color, 'FF94A3B8') },
      };
    };

    const topB = toExcelBorder(getCellSideBorder(st, 'top'));
    const bottomB = toExcelBorder(getCellSideBorder(st, 'bottom'));
    const leftB = toExcelBorder(getCellSideBorder(st, 'left'));
    const rightB = toExcelBorder(getCellSideBorder(st, 'right'));
    if (topB || bottomB || leftB || rightB) {
      excelCell.border = {
        ...(topB ? { top: topB } : {}),
        ...(bottomB ? { bottom: bottomB } : {}),
        ...(leftB ? { left: leftB } : {}),
        ...(rightB ? { right: rightB } : {}),
      };
    }
  }

  const lines = textVal.split('\n').reduce((acc, part) => {
    return acc + Math.max(1, Math.ceil(part.length / Math.max(6, rowWidthChars - 2)));
  }, 0);
  return Math.max(18, Math.min(120, lines * 15 + 6));
}

export async function exportToExcel(
  profile: VendorProfile,
  activities: ActivityEntry[],
  meta: ExportMetadataOptions
): Promise<void> {
  const sheet = buildLoopedSheetFromTemplate(profile, activities, meta);
  const defaultName = buildDefaultTimesheetFilename(
    meta.preparedByName || 'User',
    activities
  );
  await exportSheetToExcel(
    sheet,
    defaultName,
    profile.vendorName,
    profile.paperOrientation,
    meta.preparedByName || 'Timesheetly'
  );
}

export async function generateStandaloneHtml(
  profile: VendorProfile,
  activities: ActivityEntry[],
  meta: ExportMetadataOptions
): Promise<string> {
  const sheet = buildLoopedSheetFromTemplate(profile, activities, meta);
  return generateStandaloneHtmlFromSheet(
    sheet,
    `${profile.reportTitle} - ${profile.vendorName}`,
    profile.paperOrientation
  );
}

export async function exportSheetToExcel(
  sheet: SheetTemplate,
  title: string,
  sheetLabel: string,
  orientation: 'portrait' | 'landscape',
  author: string
): Promise<void> {
  const colCount = sheet.colWidths.length;
  const rowCount = sheet.rowHeights.length;
  if (colCount === 0 || rowCount === 0) {
    throw new Error('Sheet laporan masih kosong.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = author || 'Timesheetly';
  workbook.created = new Date();

  const safeSheetName =
    sheetLabel.slice(0, 28).replace(/[*?:\\/[\]]/g, '') || 'Laporan';
  const ws = workbook.addWorksheet(safeSheetName, {
    pageSetup: {
      paperSize: 9,
      orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.25,
        footer: 0.25,
      },
    },
  });

  ws.columns = sheet.colWidths.map((px, idx) => ({
    key: `c${idx}`,
    width: Math.max(6, Math.round((px || 100) / 7.5)),
  }));

  for (let r = 0; r < rowCount; r++) {
    const excelRow = ws.getRow(r + 1);
    let maxHeight = Math.round((sheet.rowHeights[r] || 24) * 0.75);

    for (let c = 0; c < colCount; c++) {
      const cellData = sheet.cells[cellKey(r, c)];
      const rawVal = cellData?.value ?? '';
      const evalRes = evaluateSheetCell(sheet, r, c);
      const cell = excelRow.getCell(c + 1);

      if (evalRes.isFormula) {
        if (evalRes.numericValue !== null && !evalRes.isError) {
          cell.value = {
            formula: toExcelFormulaString(rawVal),
            result: evalRes.numericValue,
          };
        } else {
          cell.value = evalRes.display;
        }
      } else if (evalRes.numericValue !== null) {
        cell.value = evalRes.numericValue;
      } else {
        cell.value = rawVal;
      }

      const charWidth = Math.max(6, Math.round((sheet.colWidths[c] || 100) / 7.5));
      const neededH = applyCellStyleToExcel(cell, cellData, charWidth, evalRes.display);
      if (evalRes.display && neededH > maxHeight) {
        maxHeight = Math.max(maxHeight, neededH);
      }
    }

    for (const m of sheet.merges) {
      if (m.startRow === r) {
        ws.mergeCells(m.startRow + 1, m.startCol + 1, m.endRow + 1, m.endCol + 1);
      }
    }

    excelRow.height = maxHeight;
  }

  for (const img of sheet.images) {
    const png = await imageToPngDataUrl(img.dataUrl);
    if (!png) continue;

    const imageId = workbook.addImage({
      base64: png.base64,
      extension: 'png',
    });

    const colCoord = pxOffsetToExcelCol(sheet.colWidths, img.xPx);
    const rowCoord = pxOffsetToExcelRow(sheet.rowHeights, img.yPx);

    ws.addImage(imageId, {
      tl: { col: colCoord, row: rowCoord },
      ext: { width: img.widthPx, height: img.heightPx },
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `${sanitizeExportFilename(title || sheetLabel)}.xlsx`;
  triggerBlobDownload(blob, filename);
}

interface BuiltSheetHtmlParts {
  sumColWidths: number;
  printablePageWidthPx: number;
  printZoom: string;
  maxContentHeightPx: number;
  styleCss: string;
  bodyMarkup: string;
}

async function buildSheetHtmlParts(
  sheet: SheetTemplate,
  title: string,
  orientation: 'portrait' | 'landscape'
): Promise<BuiltSheetHtmlParts> {
  const sumColWidths = Math.max(
    1,
    sheet.colWidths.reduce((s, w) => s + (w || 100), 0)
  );
  const colCount = sheet.colWidths.length;
  const printablePageWidthPx = orientation === 'landscape' ? 986 : 658;
  const printZoom =
    sumColWidths > printablePageWidthPx
      ? (printablePageWidthPx / sumColWidths).toFixed(4)
      : '1';

  const normalizedImages = await Promise.all(
    sheet.images.map(async (img) => {
      const png = await imageToPngDataUrl(img.dataUrl);
      return { ...img, src: png?.dataUrl || img.dataUrl };
    })
  );

  const maxImgBottom = normalizedImages.reduce(
    (m, im) => Math.max(m, im.yPx + im.heightPx),
    0
  );
  const totalRowsHeight = sheet.rowHeights.reduce((s, h) => s + (h || 24), 0);
  const maxContentHeightPx = Math.max(totalRowsHeight, maxImgBottom, 24);

  const colgroupHtml = `<colgroup>${sheet.colWidths
    .map(
      (w) =>
        `<col style="width:${(((w || 100) / sumColWidths) * 100).toFixed(4)}%;" />`
    )
    .join('')}</colgroup>`;

  const rowsHtml: string[] = [];
  for (let r = 0; r < sheet.rowHeights.length; r++) {
    const hPx = sheet.rowHeights[r] || 24;
    const tds: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const merge = getMergeCoveringCell(sheet.merges, r, c);
      if (merge && (merge.startRow !== r || merge.startCol !== c)) {
        continue;
      }
      const colSpan = merge ? merge.endCol - merge.startCol + 1 : 1;
      const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
      let cellMinHeightPx = hPx;
      if (rowSpan > 1) {
        cellMinHeightPx = 0;
        for (let sr = r; sr < r + rowSpan && sr < sheet.rowHeights.length; sr++) {
          cellMinHeightPx += sheet.rowHeights[sr] || 24;
        }
      }

      const cellData = sheet.cells[cellKey(r, c)];
      const st = cellData?.style;
      const val = getSheetCellDisplayValue(sheet, r, c);

      const borderCssParts: string[] = [];
      if (st?.border) {
        if (!st.borderSides) {
          borderCssParts.push(
            `border:${st.borderWidth ?? 1}px solid ${st.borderColor || '#94a3b8'}`
          );
        } else {
          (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
            const spec = getCellSideBorder(st, side);
            borderCssParts.push(
              spec
                ? `border-${side}:${spec.width}px solid ${spec.color}`
                : `border-${side}:none`
            );
          });
        }
      } else {
        borderCssParts.push('border:none');
      }

      const css = [
        `text-align:${st?.align ?? 'left'}`,
        `font-weight:${st?.bold ? '700' : '400'}`,
        `font-style:${st?.italic ? 'italic' : 'normal'}`,
        `font-size:${st?.fontSize ?? 11}px`,
        `color:${st?.textColor ?? '#0f172a'}`,
        st?.bgColor ? `background:${st.bgColor}` : '',
        ...borderCssParts,
        `height:${cellMinHeightPx}px`,
        'box-sizing:border-box',
        'padding:4px 8px',
        `vertical-align:${st?.verticalAlign ?? 'middle'}`,
        'white-space:pre-line',
        'word-break:break-word',
      ]
        .filter(Boolean)
        .join(';');

      tds.push(
        `<td ${colSpan > 1 ? `colspan="${colSpan}"` : ''} ${
          rowSpan > 1 ? `rowspan="${rowSpan}"` : ''
        } style="${css}">${val ? escapeHtml(val) : '&nbsp;'}</td>`
      );
    }
    rowsHtml.push(`<tr style="height:${hPx}px;">${tds.join('')}</tr>`);
  }

  const imgsHtml = normalizedImages
    .map(
      (img) =>
        `<img src="${img.src}" alt="${escapeHtml(img.label || title)}" style="position:absolute;left:${img.xPx}px;top:${img.yPx}px;width:${img.widthPx}px;height:${img.heightPx}px;object-fit:contain;pointer-events:none;" />`
    )
    .join('');

  const styleCss = `
    .sheet-export-scope, .sheet-export-scope * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet-export-scope {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.35;
    }
    .sheet-export-scope table {
      border-collapse: collapse;
      table-layout: fixed;
    }
    .sheet-export-scope tr {
      page-break-inside: avoid;
    }
    .sheet-export-scope img {
      display: block;
    }
  `;

  const bodyMarkup = `<div class="sheet-export-scope"><div class="sheet-canvas" style="position:relative;width:${sumColWidths}px;min-height:${maxContentHeightPx}px;margin:0 auto;background:#ffffff;"><table style="width:${sumColWidths}px;border-collapse:collapse;table-layout:fixed;">${colgroupHtml}<tbody>${rowsHtml.join('')}</tbody></table>${imgsHtml}</div></div>`;

  return {
    sumColWidths,
    printablePageWidthPx,
    printZoom,
    maxContentHeightPx,
    styleCss,
    bodyMarkup,
  };
}

export async function generateStandaloneHtmlFromSheet(
  sheet: SheetTemplate,
  title: string,
  orientation: 'portrait' | 'landscape'
): Promise<string> {
  const parts = await buildSheetHtmlParts(sheet, title, orientation);
  const pxToMm = 25.4 / 96;
  const marginMm = 18;
  const customPageWidthMm = Math.max(
    80,
    Number((parts.sumColWidths * pxToMm + marginMm * 2).toFixed(2))
  );
  const customPageHeightMm = Math.max(
    80,
    Number((parts.maxContentHeightPx * pxToMm + marginMm * 2).toFixed(2))
  );

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${customPageWidthMm}mm ${customPageHeightMm}mm; margin: ${marginMm}mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #ffffff; }
    ${parts.styleCss}
    @media print {
      body { padding: 0; }
      .sheet-canvas { zoom: 1; }
    }
  </style>
</head>
<body>
  ${parts.bodyMarkup}
</body>
</html>`;
}

export async function downloadSheetHtmlReport(
  sheet: SheetTemplate,
  title: string,
  orientation: 'portrait' | 'landscape'
): Promise<void> {
  const html = await generateStandaloneHtmlFromSheet(sheet, title, orientation);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const filename = `${sanitizeExportFilename(title)}.html`;
  triggerBlobDownload(blob, filename);
}

export async function downloadHtmlReport(
  profile: VendorProfile,
  activities: ActivityEntry[],
  meta: ExportMetadataOptions
): Promise<void> {
  const html = await generateStandaloneHtml(profile, activities, meta);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const defaultName = buildDefaultTimesheetFilename(
    meta.preparedByName || 'User',
    activities
  );
  const filename = `${sanitizeExportFilename(defaultName)}.html`;
  triggerBlobDownload(blob, filename);
}

export async function exportSheetToPdf(
  sheet: SheetTemplate,
  title: string,
  orientation: 'portrait' | 'landscape'
): Promise<void> {
  const colCount = sheet.colWidths.length;
  const rowCount = sheet.rowHeights.length;
  if (colCount === 0 || rowCount === 0) {
    throw new Error('Sheet laporan masih kosong.');
  }

  const parts = await buildSheetHtmlParts(sheet, title, orientation);

  const scopePaddingPx = 4;
  const captureWidth = parts.sumColWidths + scopePaddingPx * 2;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-14000px';
  host.style.top = '0';
  host.style.width = `${captureWidth}px`;
  host.style.background = '#ffffff';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  host.setAttribute('aria-hidden', 'true');

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-sheet-export-style', 'true');
  styleEl.textContent = parts.styleCss;
  host.appendChild(styleEl);

  const contentHolder = document.createElement('div');
  contentHolder.innerHTML = parts.bodyMarkup;
  host.appendChild(contentHolder);

  const scopeEl = contentHolder.querySelector('.sheet-export-scope') as HTMLElement | null;
  if (scopeEl) {
    scopeEl.style.padding = `${scopePaddingPx}px`;
    scopeEl.style.width = `${captureWidth}px`;
  }

  document.body.appendChild(host);

  try {
    const imgs = Array.from(host.querySelectorAll('img'));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 1000);
          })
      )
    );

    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    );

    const captureTarget = scopeEl ?? (host.querySelector('.sheet-canvas') as HTMLElement | null);
    if (!captureTarget) {
      throw new Error('Gagal menyiapkan pratinjau PDF.');
    }

    const captureRect = captureTarget.getBoundingClientRect();
    const trElements = Array.from(captureTarget.querySelectorAll('tbody > tr'));
    const lastRowBottom =
      trElements.length > 0
        ? Math.max(
            0,
            trElements[trElements.length - 1].getBoundingClientRect().bottom -
              captureRect.top
          )
        : 0;

    const totalCssH = Math.max(
      captureTarget.scrollHeight,
      parts.maxContentHeightPx + scopePaddingPx * 2,
      lastRowBottom + scopePaddingPx,
      32
    );

    // Keep rendered canvas inside safe browser max-height limits while staying sharp
    const targetScale = Math.min(2.5, Math.max(1.2, 13000 / totalCssH));

    const renderedCanvas = await html2canvas(captureTarget, {
      scale: targetScale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: captureWidth,
      height: Math.ceil(totalCssH),
      windowWidth: captureWidth,
      onclone: (clonedDoc) => {
        // Isolate export styles from Tailwind v4 Preflight so PDF matches standalone HTML 1:1
        const headStyles = Array.from(
          clonedDoc.head.querySelectorAll('style, link[rel="stylesheet"]')
        );
        for (const node of headStyles) {
          if (!node.hasAttribute('data-sheet-export-style')) {
            node.parentNode?.removeChild(node);
          }
        }
        const cloneStyle = clonedDoc.createElement('style');
        cloneStyle.setAttribute('data-sheet-export-style', 'true');
        cloneStyle.textContent = `
          html, body { margin: 0; padding: 0; background: #ffffff; }
          ${parts.styleCss}
        `;
        clonedDoc.head.appendChild(cloneStyle);
      },
    });

    // Export as a single continuous custom-sized PDF page fitted to the full sheet (no A4 page breaks)
    const pxToMm = 25.4 / 96;
    const margin = 18;
    const contentWidthMm = captureWidth * pxToMm;
    const contentHeightMm = totalCssH * pxToMm;
    const pageWidthMm = Math.max(
      80,
      Number((contentWidthMm + margin * 2).toFixed(2))
    );
    const pageHeightMm = Math.max(
      80,
      Number((contentHeightMm + margin * 2).toFixed(2))
    );
    const docOrientation: 'portrait' | 'landscape' =
      pageWidthMm > pageHeightMm ? 'landscape' : 'portrait';

    const doc = new jsPDF({
      orientation: docOrientation,
      unit: 'mm',
      format: [pageWidthMm, pageHeightMm],
    });
    const actualPageW = doc.internal.pageSize.getWidth();
    const actualPageH = doc.internal.pageSize.getHeight();
    const drawW = Math.max(10, actualPageW - margin * 2);
    const drawH = Math.max(10, actualPageH - margin * 2);

    const imgDataUrl = renderedCanvas.toDataURL('image/png');
    doc.addImage(
      imgDataUrl,
      'PNG',
      margin,
      margin,
      drawW,
      drawH,
      undefined,
      'FAST'
    );

    const filename = `${sanitizeExportFilename(title || 'Timesheet')}.pdf`;
    doc.save(filename);
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

export async function printReportToPdf(
  sheet: SheetTemplate,
  title: string,
  orientation: 'portrait' | 'landscape'
): Promise<'printed' | 'downloaded_pdf'> {
  const html = await generateStandaloneHtmlFromSheet(sheet, title, orientation);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '1120px';
  iframe.style.height = '800px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const removeIframe = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  try {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      iframe.onload = done;
      iframe.srcdoc = html;
      setTimeout(done, 500);
    });

    const printWin = iframe.contentWindow;
    if (!printWin) {
      removeIframe();
      await exportSheetToPdf(sheet, title, orientation);
      return 'downloaded_pdf';
    }

    await new Promise<void>((r) =>
      printWin.requestAnimationFrame(() =>
        printWin.requestAnimationFrame(() => r())
      )
    );

    let beforePrintFired = false;
    const onBeforePrint = () => {
      beforePrintFired = true;
    };
    const onAfterPrint = () => {
      printWin.removeEventListener('afterprint', onAfterPrint);
      setTimeout(removeIframe, 500);
    };

    printWin.addEventListener('beforeprint', onBeforePrint);
    printWin.addEventListener('afterprint', onAfterPrint);
    printWin.focus();
    printWin.print();
    printWin.removeEventListener('beforeprint', onBeforePrint);

    if (beforePrintFired) {
      setTimeout(removeIframe, 60_000);
      return 'printed';
    }

    removeIframe();
    // Fallback when sandboxed iframe blocks window.print()
    await exportSheetToPdf(sheet, title, orientation);
    return 'downloaded_pdf';
  } catch {
    removeIframe();
    await exportSheetToPdf(sheet, title, orientation);
    return 'downloaded_pdf';
  }
}
