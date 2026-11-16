import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Check,
  ChevronDown,
  Columns3,
  Combine,
  Grid,
  ImagePlus,
  Italic,
  Plus,
  Redo2,
  Repeat,
  Rows3,
  Sigma,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react';
import { STARTER_LOGO_PRESETS } from '../lib/seedData';
import {
  evaluateSheetCell,
  getSheetCellDisplayValue,
  shiftFormulaOnColDelete,
  shiftFormulaOnColInsert,
  shiftFormulaOnRowDelete,
  shiftFormulaOnRowInsert,
} from '../lib/sheetFormulas';
import {
  ACTIVITY_DATA_TAGS,
  cellKey,
  colIndexToLetter,
  DOCUMENT_META_TAGS,
  getLoopRowIndices,
  getMergeCoveringCell,
  withLoopRowIndices,
} from '../lib/sheetTemplate';
import type {
  ColumnAlign,
  SheetCell,
  SheetCellStyle,
  SheetImage,
  SheetMergeRange,
  SheetTemplate,
  VerticalAlign,
} from '../types';

interface ExcelSheetEditorProps {
  sheet: SheetTemplate;
  mode: 'template' | 'report';
  historyKey?: string;
  onChange: (updater: (prev: SheetTemplate) => SheetTemplate) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
  maxHeightClass?: string;
}

const MAX_HISTORY = 50;

interface CellCoord {
  row: number;
  col: number;
}

interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

const QUICK_FILL_COLORS = ['', '#1E3A8A', '#0F766E', '#1E293B', '#2563EB'];
const QUICK_TEXT_COLORS = ['#0F172A', '#FFFFFF', '#1E3A8A'];
const QUICK_BORDER_COLORS = ['#0F172A', '#94A3B8', '#1E3A8A', '#DC2626'];
const BORDER_WIDTH_PRESETS: { value: number; label: string }[] = [
  { value: 0.5, label: 'Sangat Tipis' },
  { value: 1, label: 'Tipis' },
  { value: 1.5, label: 'Agak Tipis' },
  { value: 2, label: 'Sedang' },
  { value: 3, label: 'Tebal' },
  { value: 4, label: 'Sangat Tebal' },
];

function normalizeSelection(a: CellCoord, b: CellCoord): SelectionRange {
  return {
    startRow: Math.min(a.row, b.row),
    startCol: Math.min(a.col, b.col),
    endRow: Math.max(a.row, b.row),
    endCol: Math.max(a.col, b.col),
  };
}

function getTargetCellKeysForRanges(
  sheet: SheetTemplate,
  ranges: SelectionRange[]
): string[] {
  const keys = new Set<string>();
  for (const range of ranges) {
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const merge = getMergeCoveringCell(sheet.merges, r, c);
        if (merge) {
          for (let mr = merge.startRow; mr <= merge.endRow; mr++) {
            for (let mc = merge.startCol; mc <= merge.endCol; mc++) {
              keys.add(cellKey(mr, mc));
            }
          }
        } else {
          keys.add(cellKey(r, c));
        }
      }
    }
  }
  return Array.from(keys);
}

function normalizeHexColor(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const cleaned = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned.toLowerCase() : fallback;
}

function slugifyCustomKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `kolom_${Date.now()}`
  );
}

function measureAutoFitColumnWidth(
  sheet: SheetTemplate,
  colIndex: number,
  mode: 'template' | 'report'
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return sheet.colWidths[colIndex] || 120;

  let maxWidth = 48;
  let foundSingleColContent = false;

  for (let r = 0; r < sheet.rowHeights.length; r++) {
    const merge = getMergeCoveringCell(sheet.merges, r, colIndex);
    if (merge && merge.endCol > merge.startCol) {
      continue;
    }
    const startR = merge ? merge.startRow : r;
    const cellData = sheet.cells[cellKey(startR, colIndex)];
    const rawVal = cellData?.value ?? '';
    const val = getSheetCellDisplayValue(sheet, startR, colIndex);
    if (!val.trim()) continue;

    foundSingleColContent = true;
    const st = cellData?.style;
    const fontSize = st?.fontSize ?? 11;
    const fontWeight = st?.bold ? '700' : '400';
    const fontStyle = st?.italic ? 'italic' : 'normal';
    const hasToken = mode === 'template' && /\{\{[^}]+\}\}/.test(rawVal);
    const fontFamily = hasToken
      ? '"JetBrains Mono", ui-monospace, monospace'
      : '"Public Sans", ui-sans-serif, system-ui, sans-serif';

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    for (const line of val.split('\n')) {
      const measured = ctx.measureText(line).width + 20;
      if (measured > maxWidth) maxWidth = measured;
    }
  }

  // Fallback: if column only contains horizontally merged cells, estimate share
  if (!foundSingleColContent) {
    for (let r = 0; r < sheet.rowHeights.length; r++) {
      const merge = getMergeCoveringCell(sheet.merges, r, colIndex);
      if (!merge) continue;
      const cellData = sheet.cells[cellKey(merge.startRow, merge.startCol)];
      const rawVal = cellData?.value ?? '';
      const val = getSheetCellDisplayValue(sheet, merge.startRow, merge.startCol);
      if (!val.trim()) continue;

      const colSpan = Math.max(1, merge.endCol - merge.startCol + 1);
      const st = cellData?.style;
      const fontSize = st?.fontSize ?? 11;
      const fontWeight = st?.bold ? '700' : '400';
      const fontStyle = st?.italic ? 'italic' : 'normal';
      const hasToken = mode === 'template' && /\{\{[^}]+\}\}/.test(rawVal);
      const fontFamily = hasToken
        ? '"JetBrains Mono", ui-monospace, monospace'
        : '"Public Sans", ui-sans-serif, system-ui, sans-serif';

      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      for (const line of val.split('\n')) {
        const measured = (ctx.measureText(line).width + 20) / colSpan;
        if (measured > maxWidth) maxWidth = measured;
      }
    }
  }

  return Math.max(48, Math.min(640, Math.ceil(maxWidth)));
}

function measureAutoFitRowHeight(
  sheet: SheetTemplate,
  rowIndex: number,
  mode: 'template' | 'report'
): number {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.top = '-9999px';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.boxSizing = 'border-box';
  probe.style.padding = '3px 6px';
  probe.style.whiteSpace = 'pre-wrap';
  probe.style.wordBreak = 'break-word';
  probe.style.lineHeight = '1.375';
  document.body.appendChild(probe);

  let maxHeight = 26;

  try {
    for (let c = 0; c < sheet.colWidths.length; c++) {
      const merge = getMergeCoveringCell(sheet.merges, rowIndex, c);
      if (merge && (merge.startRow !== rowIndex || merge.startCol !== c)) {
        continue;
      }
      if (merge && merge.endRow > merge.startRow) {
        continue;
      }

      const colSpan = merge ? merge.endCol - merge.startCol + 1 : 1;
      let cellWidth = 0;
      for (let i = 0; i < colSpan; i++) {
        cellWidth += sheet.colWidths[c + i] || 100;
      }

      const cellData = sheet.cells[cellKey(rowIndex, c)];
      const rawVal = cellData?.value ?? '';
      const val = getSheetCellDisplayValue(sheet, rowIndex, c);
      if (!val.trim()) continue;

      const st = cellData?.style;
      const hasToken = mode === 'template' && /\{\{[^}]+\}\}/.test(rawVal);
      probe.style.width = `${Math.max(24, cellWidth)}px`;
      probe.style.fontSize = `${st?.fontSize ?? 11}px`;
      probe.style.fontWeight = st?.bold ? '700' : '400';
      probe.style.fontStyle = st?.italic ? 'italic' : 'normal';
      probe.style.fontFamily = hasToken
        ? '"JetBrains Mono", ui-monospace, monospace'
        : '"Public Sans", ui-sans-serif, system-ui, sans-serif';
      probe.textContent = val;

      const measured = Math.ceil(probe.getBoundingClientRect().height) + 4;
      if (measured > maxHeight) maxHeight = measured;
    }
  } finally {
    document.body.removeChild(probe);
  }

  return Math.max(24, Math.min(360, maxHeight));
}

export function ExcelSheetEditor({
  sheet,
  mode,
  historyKey,
  onChange,
  onNotify,
  maxHeightClass = 'max-h-[calc(100vh-340px)] min-h-[340px]',
}: ExcelSheetEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const borderMenuRef = useRef<HTMLDivElement>(null);
  const formulaMenuRef = useRef<HTMLDivElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const [history, setHistory] = useState<{
    past: SheetTemplate[];
    future: SheetTemplate[];
  }>({ past: [], future: [] });

  const dragInitialSheetRef = useRef<SheetTemplate | null>(null);
  const formulaSessionPushedRef = useRef(false);
  const colorSessionPushedRef = useRef(false);
  const borderSessionPushedRef = useRef(false);

  const [anchorCell, setAnchorCell] = useState<CellCoord>({ row: 0, col: 0 });
  const [focusCell, setFocusCell] = useState<CellCoord>({ row: 0, col: 0 });
  const [additionalRanges, setAdditionalRanges] = useState<SelectionRange[]>([]);
  const [selectingCells, setSelectingCells] = useState(false);
  const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
  const [editOrigin, setEditOrigin] = useState<'doubleClick' | 'type'>('doubleClick');
  const [editBuffer, setEditBuffer] = useState('');

  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showBorderMenu, setShowBorderMenu] = useState(false);
  const [showFormulaMenu, setShowFormulaMenu] = useState(false);
  const [borderWidthInput, setBorderWidthInput] = useState<string>('1');
  const [customTagInput, setCustomTagInput] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const [imgInteraction, setImgInteraction] = useState<{
    id: string;
    mode: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const [colResize, setColResize] = useState<{
    colIndex: number;
    startX: number;
    origWidth: number;
  } | null>(null);

  const [rowResize, setRowResize] = useState<{
    rowIndex: number;
    startY: number;
    origHeight: number;
  } | null>(null);

  useEffect(() => {
    setHistory({ past: [], future: [] });
    dragInitialSheetRef.current = null;
    formulaSessionPushedRef.current = false;
    colorSessionPushedRef.current = false;
    borderSessionPushedRef.current = false;
    setShowBorderMenu(false);
    setShowFormulaMenu(false);
    setAdditionalRanges([]);
    setEditingCell(null);
  }, [historyKey]);

  // Clamp selection safely when sheet size shrinks or swaps
  useEffect(() => {
    const maxR = Math.max(0, sheet.rowHeights.length - 1);
    const maxC = Math.max(0, sheet.colWidths.length - 1);
    setAnchorCell((curr) => ({
      row: Math.min(curr.row, maxR),
      col: Math.min(curr.col, maxC),
    }));
    setFocusCell((curr) => ({
      row: Math.min(curr.row, maxR),
      col: Math.min(curr.col, maxC),
    }));
  }, [sheet.rowHeights.length, sheet.colWidths.length]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (imgInteraction) {
        const dx = e.clientX - imgInteraction.startClientX;
        const dy = e.clientY - imgInteraction.startClientY;
        onChange((prev) => {
          const nextImages = prev.images.map((im) => {
            if (im.id !== imgInteraction.id) return im;
            if (imgInteraction.mode === 'move') {
              return {
                ...im,
                xPx: Math.max(0, Math.round(imgInteraction.origX + dx)),
                yPx: Math.max(0, Math.round(imgInteraction.origY + dy)),
              };
            }
            const nextW = Math.max(24, Math.round(imgInteraction.origW + dx));
            const ratio = imgInteraction.origH / Math.max(1, imgInteraction.origW);
            const nextH = Math.max(24, Math.round(nextW * ratio));
            return { ...im, widthPx: nextW, heightPx: nextH };
          });
          return { ...prev, images: nextImages };
        });
      } else if (colResize) {
        const dx = e.clientX - colResize.startX;
        const nextW = Math.max(48, Math.min(640, Math.round(colResize.origWidth + dx)));
        onChange((prev) => {
          const nextWidths = [...prev.colWidths];
          nextWidths[colResize.colIndex] = nextW;
          return { ...prev, colWidths: nextWidths };
        });
      } else if (rowResize) {
        const dy = e.clientY - rowResize.startY;
        const nextH = Math.max(20, Math.min(360, Math.round(rowResize.origHeight + dy)));
        onChange((prev) => {
          const nextHeights = [...prev.rowHeights];
          nextHeights[rowResize.rowIndex] = nextH;
          return { ...prev, rowHeights: nextHeights };
        });
      }
    };

    const handleMouseUp = () => {
      if (dragInitialSheetRef.current) {
        const initial = dragInitialSheetRef.current;
        dragInitialSheetRef.current = null;
        if (JSON.stringify(initial) !== JSON.stringify(sheetRef.current)) {
          setHistory((h) => ({
            past: [...h.past.slice(-(MAX_HISTORY - 1)), initial],
            future: [],
          }));
        }
      }
      setSelectingCells(false);
      setImgInteraction(null);
      setColResize(null);
      setRowResize(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [imgInteraction, colResize, rowResize, onChange]);

  const selection = normalizeSelection(anchorCell, focusCell);
  const allSelections: SelectionRange[] = [...additionalRanges, selection];
  const activeKey = cellKey(selection.startRow, selection.startCol);
  const activeCellData: SheetCell = sheet.cells[activeKey] ?? { value: '' };
  const activeStyle: SheetCellStyle = activeCellData.style ?? {};
  const selectedImage = sheet.images.find((i) => i.id === selectedImageId) ?? null;

  useEffect(() => {
    formulaSessionPushedRef.current = false;
    colorSessionPushedRef.current = false;
    borderSessionPushedRef.current = false;
  }, [
    selection.startRow,
    selection.startCol,
    selection.endRow,
    selection.endCol,
    additionalRanges.length,
  ]);

  useEffect(() => {
    const bw = activeStyle.border ? activeStyle.borderWidth ?? 1 : 1;
    setBorderWidthInput(String(bw));
  }, [activeKey, activeStyle.border, activeStyle.borderWidth]);

  useEffect(() => {
    if (!showBorderMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        borderMenuRef.current &&
        !borderMenuRef.current.contains(e.target as Node)
      ) {
        setShowBorderMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowBorderMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showBorderMenu]);

  useEffect(() => {
    if (!showFormulaMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        formulaMenuRef.current &&
        !formulaMenuRef.current.contains(e.target as Node)
      ) {
        setShowFormulaMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFormulaMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showFormulaMenu]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const commitChange = (updater: (prev: SheetTemplate) => SheetTemplate) => {
    const snapshot = structuredClone(sheetRef.current);
    setHistory((h) => ({
      past: [...h.past.slice(-(MAX_HISTORY - 1)), snapshot],
      future: [],
    }));
    onChange(updater);
  };

  const handleUndo = () => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const currentSnapshot = structuredClone(sheetRef.current);
    setHistory((h) => ({
      past: h.past.slice(0, -1),
      future: [currentSnapshot, ...h.future.slice(0, MAX_HISTORY - 1)],
    }));
    setEditingCell(null);
    setSelectedImageId(null);
    formulaSessionPushedRef.current = false;
    colorSessionPushedRef.current = false;
    onChange(() => structuredClone(previous));
  };

  const handleRedo = () => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    const currentSnapshot = structuredClone(sheetRef.current);
    setHistory((h) => ({
      past: [...h.past.slice(-(MAX_HISTORY - 1)), currentSnapshot],
      future: h.future.slice(1),
    }));
    setEditingCell(null);
    setSelectedImageId(null);
    formulaSessionPushedRef.current = false;
    colorSessionPushedRef.current = false;
    onChange(() => structuredClone(next));
  };

  const setCellValue = (
    row: number,
    col: number,
    value: string,
    recordHistory = true
  ) => {
    const updater = (prev: SheetTemplate): SheetTemplate => {
      const k = cellKey(row, col);
      const existing = prev.cells[k];
      return {
        ...prev,
        cells: {
          ...prev.cells,
          [k]: { ...existing, value },
        },
      };
    };
    if (recordHistory) {
      commitChange(updater);
    } else {
      onChange(updater);
    }
  };

  const applyStyleToSelection = (
    patch: Partial<SheetCellStyle>,
    recordHistory = true
  ) => {
    const updater = (prev: SheetTemplate): SheetTemplate => {
      const nextCells = { ...prev.cells };
      const targetKeys = getTargetCellKeysForRanges(prev, allSelections);
      for (const k of targetKeys) {
        const curr = nextCells[k] ?? { value: '' };
        nextCells[k] = {
          ...curr,
          style: { ...(curr.style ?? {}), ...patch },
        };
      }
      return { ...prev, cells: nextCells };
    };
    if (recordHistory) {
      commitChange(updater);
    } else {
      onChange(updater);
    }
  };

  const insertTokenIntoActiveCell = (token: string) => {
    const currentVal = activeCellData.value || '';
    const nextVal = currentVal ? `${currentVal} ${token}` : token;
    setCellValue(selection.startRow, selection.startCol, nextVal, true);
    setShowTagMenu(false);
  };

  const insertFormulaPreset = (templateText: string, selStart: number, selEnd: number) => {
    setCellValue(selection.startRow, selection.startCol, templateText, true);
    setShowFormulaMenu(false);
    requestAnimationFrame(() => {
      const input = formulaInputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(selStart, selEnd);
      }
    });
  };

  const handleInsertColumn = (atIndex: number) => {
    commitChange((prev) => {
      const nextWidths = [...prev.colWidths];
      nextWidths.splice(atIndex, 0, 120);

      const nextCells: Record<string, SheetCell> = {};
      for (const [k, v] of Object.entries(prev.cells)) {
        const [rStr, cStr] = k.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        nextCells[cellKey(r, c >= atIndex ? c + 1 : c)] = {
          ...v,
          value: shiftFormulaOnColInsert(v.value, atIndex),
        };
      }

      const nextMerges = prev.merges.map((m) => ({
        startRow: m.startRow,
        endRow: m.endRow,
        startCol: m.startCol >= atIndex ? m.startCol + 1 : m.startCol,
        endCol: m.endCol >= atIndex ? m.endCol + 1 : m.endCol,
      }));

      return { ...prev, colWidths: nextWidths, cells: nextCells, merges: nextMerges };
    });
  };

  const handleDeleteColumn = (colIndex: number) => {
    if (sheet.colWidths.length <= 1) {
      onNotify('error', 'Minimal harus ada 1 kolom.');
      return;
    }
    commitChange((prev) => {
      const nextWidths = prev.colWidths.filter((_, i) => i !== colIndex);
      const nextCells: Record<string, SheetCell> = {};
      for (const [k, v] of Object.entries(prev.cells)) {
        const [rStr, cStr] = k.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        if (c === colIndex) continue;
        nextCells[cellKey(r, c > colIndex ? c - 1 : c)] = {
          ...v,
          value: shiftFormulaOnColDelete(v.value, colIndex),
        };
      }
      const nextMerges: SheetMergeRange[] = [];
      for (const m of prev.merges) {
        if (m.startCol === colIndex && m.endCol === colIndex) continue;
        const startCol = m.startCol > colIndex ? m.startCol - 1 : m.startCol;
        const endCol = m.endCol >= colIndex ? m.endCol - 1 : m.endCol;
        if (endCol >= startCol && (endCol > startCol || m.endRow > m.startRow)) {
          nextMerges.push({ ...m, startCol, endCol });
        }
      }
      return { ...prev, colWidths: nextWidths, cells: nextCells, merges: nextMerges };
    });
    setAnchorCell((curr) => ({ ...curr, col: Math.max(0, curr.col - 1) }));
    setFocusCell((curr) => ({ ...curr, col: Math.max(0, curr.col - 1) }));
  };

  const handleInsertRow = (atIndex: number) => {
    commitChange((prev) => {
      const nextHeights = [...prev.rowHeights];
      nextHeights.splice(atIndex, 0, 28);

      const nextCells: Record<string, SheetCell> = {};
      for (const [k, v] of Object.entries(prev.cells)) {
        const [rStr, cStr] = k.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        nextCells[cellKey(r >= atIndex ? r + 1 : r, c)] = {
          ...v,
          value: shiftFormulaOnRowInsert(v.value, atIndex),
        };
      }

      const nextMerges = prev.merges.map((m) => ({
        startCol: m.startCol,
        endCol: m.endCol,
        startRow: m.startRow >= atIndex ? m.startRow + 1 : m.startRow,
        endRow: m.endRow >= atIndex ? m.endRow + 1 : m.endRow,
      }));

      const nextLoopRows = getLoopRowIndices(prev).map((lr) =>
        lr >= atIndex ? lr + 1 : lr
      );

      return withLoopRowIndices(
        {
          ...prev,
          rowHeights: nextHeights,
          cells: nextCells,
          merges: nextMerges,
        },
        nextLoopRows
      );
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (sheet.rowHeights.length <= 1) {
      onNotify('error', 'Minimal harus ada 1 baris.');
      return;
    }
    commitChange((prev) => {
      const nextHeights = prev.rowHeights.filter((_, i) => i !== rowIndex);
      const nextCells: Record<string, SheetCell> = {};
      for (const [k, v] of Object.entries(prev.cells)) {
        const [rStr, cStr] = k.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        if (r === rowIndex) continue;
        nextCells[cellKey(r > rowIndex ? r - 1 : r, c)] = {
          ...v,
          value: shiftFormulaOnRowDelete(v.value, rowIndex),
        };
      }
      const nextMerges: SheetMergeRange[] = [];
      for (const m of prev.merges) {
        if (m.startRow === rowIndex && m.endRow === rowIndex) continue;
        const startRow = m.startRow > rowIndex ? m.startRow - 1 : m.startRow;
        const endRow = m.endRow >= rowIndex ? m.endRow - 1 : m.endRow;
        if (endRow >= startRow && (endRow > startRow || m.endCol > m.startCol)) {
          nextMerges.push({ ...m, startRow, endRow });
        }
      }
      const nextLoopRows = getLoopRowIndices(prev)
        .filter((lr) => lr !== rowIndex)
        .map((lr) => (lr > rowIndex ? lr - 1 : lr));

      return withLoopRowIndices(
        {
          ...prev,
          rowHeights: nextHeights,
          cells: nextCells,
          merges: nextMerges,
        },
        nextLoopRows
      );
    });
    setAnchorCell((curr) => ({ ...curr, row: Math.max(0, curr.row - 1) }));
    setFocusCell((curr) => ({ ...curr, row: Math.max(0, curr.row - 1) }));
  };

  const isRangeSingleMerge = sheet.merges.some(
    (m) =>
      m.startRow === selection.startRow &&
      m.startCol === selection.startCol &&
      m.endRow === selection.endRow &&
      m.endCol === selection.endCol
  );
  const canMerge =
    selection.endRow > selection.startRow || selection.endCol > selection.startCol;
  const activeCellMerge = getMergeCoveringCell(
    sheet.merges,
    selection.startRow,
    selection.startCol
  );

  const handleToggleMerge = () => {
    if (activeCellMerge || isRangeSingleMerge) {
      const target = activeCellMerge ?? selection;
      commitChange((prev) => ({
        ...prev,
        merges: prev.merges.filter(
          (m) =>
            !(
              m.startRow === target.startRow &&
              m.startCol === target.startCol &&
              m.endRow === target.endRow &&
              m.endCol === target.endCol
            )
        ),
      }));
      return;
    }

    if (!canMerge) return;

    commitChange((prev) => {
      const nonOverlapping = prev.merges.filter(
        (m) =>
          m.endRow < selection.startRow ||
          m.startRow > selection.endRow ||
          m.endCol < selection.startCol ||
          m.startCol > selection.endCol
      );
      return {
        ...prev,
        merges: [...nonOverlapping, selection],
      };
    });
  };

  const addImageToSheet = (dataUrl: string, label = 'Gambar') => {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newImg: SheetImage = {
      id,
      dataUrl,
      xPx: 24,
      yPx: 16,
      widthPx: 84,
      heightPx: 84,
      label,
    };
    commitChange((prev) => ({
      ...prev,
      images: [...prev.images, newImg],
    }));
    setSelectedImageId(id);
    setShowImageMenu(false);
  };

  const handleImageFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onNotify('error', 'Pilih file gambar PNG, JPG, WebP, atau SVG.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) addImageToSheet(result, file.name);
    };
    reader.readAsDataURL(file);
  };

  const scrollCellIntoView = (row: number, col: number) => {
    requestAnimationFrame(() => {
      const container = gridRef.current;
      if (!container) return;
      const merge = getMergeCoveringCell(sheet.merges, row, col);
      const targetRow = merge ? merge.startRow : row;
      const targetCol = merge ? merge.startCol : col;
      const td = container.querySelector<HTMLElement>(
        `td[data-cell="${targetRow}-${targetCol}"]`
      );
      if (!td) return;

      const cRect = container.getBoundingClientRect();
      const tRect = td.getBoundingClientRect();
      const stickyTopOffset = 32;
      const leftOffset = 60;

      if (tRect.top < cRect.top + stickyTopOffset) {
        container.scrollTop -= cRect.top + stickyTopOffset - tRect.top + 8;
      } else if (tRect.bottom > cRect.bottom) {
        container.scrollTop += tRect.bottom - cRect.bottom + 8;
      }

      if (tRect.left < cRect.left + leftOffset) {
        container.scrollLeft -= cRect.left + leftOffset - tRect.left + 8;
      } else if (tRect.right > cRect.right) {
        container.scrollLeft += tRect.right - cRect.right + 8;
      }
    });
  };

  const moveFromCoord = (
    row: number,
    col: number,
    dRow: number,
    dCol: number,
    snapToMergeOrigin: boolean
  ): CellCoord => {
    const maxR = Math.max(0, sheet.rowHeights.length - 1);
    const maxC = Math.max(0, sheet.colWidths.length - 1);
    const currMerge = getMergeCoveringCell(sheet.merges, row, col);

    let nextRow = row;
    let nextCol = col;

    if (dRow > 0) {
      nextRow = Math.min(maxR, (currMerge ? currMerge.endRow : row) + dRow);
    } else if (dRow < 0) {
      nextRow = Math.max(0, (currMerge ? currMerge.startRow : row) + dRow);
    }

    if (dCol > 0) {
      nextCol = Math.min(maxC, (currMerge ? currMerge.endCol : col) + dCol);
    } else if (dCol < 0) {
      nextCol = Math.max(0, (currMerge ? currMerge.startCol : col) + dCol);
    }

    if (snapToMergeOrigin) {
      const destMerge = getMergeCoveringCell(sheet.merges, nextRow, nextCol);
      if (destMerge) {
        return { row: destMerge.startRow, col: destMerge.startCol };
      }
    }

    return { row: nextRow, col: nextCol };
  };

  const moveActiveCell = (dRow: number, dCol: number, extendSelection = false) => {
    if (extendSelection) {
      const nextFocus = moveFromCoord(focusCell.row, focusCell.col, dRow, dCol, false);
      setFocusCell(nextFocus);
      scrollCellIntoView(nextFocus.row, nextFocus.col);
      return;
    }

    const baseRow = selection.startRow;
    const baseCol = selection.startCol;
    const nextCoord = moveFromCoord(baseRow, baseCol, dRow, dCol, true);
    setAdditionalRanges([]);
    setAnchorCell(nextCoord);
    setFocusCell(nextCoord);
    setSelectedImageId(null);
    setShowTagMenu(false);
    setShowImageMenu(false);
    scrollCellIntoView(nextCoord.row, nextCoord.col);
  };

  const beginInlineEdit = (
    row: number,
    col: number,
    initialChar?: string
  ) => {
    const merge = getMergeCoveringCell(sheet.merges, row, col);
    const targetRow = merge ? merge.startRow : row;
    const targetCol = merge ? merge.startCol : col;
    const existingVal = sheet.cells[cellKey(targetRow, targetCol)]?.value ?? '';
    setEditingCell({ row: targetRow, col: targetCol });
    setEditOrigin(initialChar !== undefined ? 'type' : 'doubleClick');
    setEditBuffer(initialChar !== undefined ? initialChar : existingVal);
  };

  const commitInlineEdit = (
    moveDir?: 'up' | 'down' | 'left' | 'right',
    refocusGrid = false
  ) => {
    if (!editingCell) return;
    const prevVal =
      sheetRef.current.cells[cellKey(editingCell.row, editingCell.col)]?.value ?? '';
    if (editBuffer !== prevVal) {
      setCellValue(editingCell.row, editingCell.col, editBuffer, true);
    }
    const { row, col } = editingCell;
    setEditingCell(null);

    if (moveDir) {
      const dRow = moveDir === 'up' ? -1 : moveDir === 'down' ? 1 : 0;
      const dCol = moveDir === 'left' ? -1 : moveDir === 'right' ? 1 : 0;
      const nextCoord = moveFromCoord(row, col, dRow, dCol, true);
      setAnchorCell(nextCoord);
      setFocusCell(nextCoord);
      scrollCellIntoView(nextCoord.row, nextCoord.col);
    }

    if (refocusGrid) {
      requestAnimationFrame(() => {
        gridRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActiveCell(-1, 0, e.shiftKey);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActiveCell(1, 0, e.shiftKey);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveActiveCell(0, -1, e.shiftKey);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveActiveCell(0, 1, e.shiftKey);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      moveActiveCell(0, e.shiftKey ? -1 : 1, false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      moveActiveCell(e.shiftKey ? -1 : 1, 0, false);
    } else if (e.key === 'F2') {
      e.preventDefault();
      beginInlineEdit(selection.startRow, selection.startCol);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const targetKeys = getTargetCellKeysForRanges(sheetRef.current, allSelections);
      const hasNonEmpty = targetKeys.some(
        (k) => Boolean(sheetRef.current.cells[k]?.value)
      );
      if (!hasNonEmpty) return;

      commitChange((prev) => {
        const nextCells = { ...prev.cells };
        for (const k of getTargetCellKeysForRanges(prev, allSelections)) {
          if (nextCells[k]) {
            nextCells[k] = { ...nextCells[k], value: '' };
          }
        }
        return { ...prev, cells: nextCells };
      });
    } else if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      beginInlineEdit(selection.startRow, selection.startCol, e.key);
    }
  };

  const handleAutoFitColumn = (colIndex: number) => {
    setColResize(null);
    const nextWidth = measureAutoFitColumnWidth(sheetRef.current, colIndex, mode);
    if (sheetRef.current.colWidths[colIndex] === nextWidth) return;
    commitChange((prev) => {
      const nextWidths = [...prev.colWidths];
      nextWidths[colIndex] = nextWidth;
      return { ...prev, colWidths: nextWidths };
    });
  };

  const handleAutoFitRow = (rowIndex: number) => {
    setRowResize(null);
    const nextHeight = measureAutoFitRowHeight(sheetRef.current, rowIndex, mode);
    if (sheetRef.current.rowHeights[rowIndex] === nextHeight) return;
    commitChange((prev) => {
      const nextHeights = [...prev.rowHeights];
      nextHeights[rowIndex] = nextHeight;
      return { ...prev, rowHeights: nextHeights };
    });
  };

  const totalTableWidth = sheet.colWidths.reduce((s, w) => s + w, 0);
  const loopRows = getLoopRowIndices(sheet);
  const loopRowSet = new Set(loopRows);
  const selectedRowSet = new Set<number>();
  for (const rng of allSelections) {
    for (let r = rng.startRow; r <= rng.endRow; r++) {
      selectedRowSet.add(r);
    }
  }
  const selectedRowSpan = Array.from(selectedRowSet).sort((a, b) => a - b);
  const allSelectedRowsAreLoop =
    selectedRowSpan.length > 0 && selectedRowSpan.every((r) => loopRowSet.has(r));

  const primaryRangeLabel =
    selection.startRow === selection.endRow && selection.startCol === selection.endCol
      ? `${colIndexToLetter(selection.startCol)}${selection.startRow + 1}`
      : `${colIndexToLetter(selection.startCol)}${selection.startRow + 1}:${colIndexToLetter(selection.endCol)}${selection.endRow + 1}`;
  const selectionLabel =
    additionalRanges.length > 0
      ? `${primaryRangeLabel} (+${additionalRanges.length})`
      : primaryRangeLabel;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Ribbon Row 1: Formatting & Structure */}
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Urungkan (Ctrl+Z)"
            aria-label="Undo"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Ulangi (Ctrl+Y)"
            aria-label="Redo"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span>Redo</span>
          </button>
        </div>

        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => applyStyleToSelection({ bold: !activeStyle.bold })}
            title="Tebal (Bold)"
            className={`p-1.5 rounded text-xs ${
              activeStyle.bold
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyStyleToSelection({ italic: !activeStyle.italic })}
            title="Miring (Italic)"
            className={`p-1.5 rounded text-xs ${
              activeStyle.italic
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-1.5 py-0.5">
          <button
            type="button"
            onClick={() =>
              applyStyleToSelection(
                activeStyle.border
                  ? { border: false }
                  : {
                      border: true,
                      borderWidth: activeStyle.borderWidth ?? 1,
                      borderColor: activeStyle.borderColor || '#94a3b8',
                    }
              )
            }
            title="Aktif/Nonaktifkan Garis Batas Sel (Border)"
            className={`p-1.5 rounded text-xs ${
              activeStyle.border
                ? 'bg-blue-600 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
          </button>
          <div ref={borderMenuRef} className="relative flex items-center">
            <div className="flex items-center rounded-md border border-slate-200 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15 overflow-hidden">
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                aria-label="Ketebalan border (px)"
                title="Ketik ukuran ketebalan border (0.5 - 12 px)"
                value={borderWidthInput}
                onFocus={(e) => {
                  borderSessionPushedRef.current = false;
                  e.target.select();
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  setBorderWidthInput(raw);
                  const parsed = parseFloat(raw);
                  if (!Number.isNaN(parsed) && parsed >= 0.5 && parsed <= 12) {
                    const normalized = Number(parsed.toFixed(2));
                    const shouldRecord = !borderSessionPushedRef.current;
                    borderSessionPushedRef.current = true;
                    applyStyleToSelection(
                      {
                        border: true,
                        borderWidth: normalized,
                        borderColor: activeStyle.borderColor || '#94a3b8',
                      },
                      shouldRecord
                    );
                  }
                }}
                onBlur={() => {
                  const parsed = parseFloat(borderWidthInput);
                  if (Number.isNaN(parsed)) {
                    setBorderWidthInput(
                      String(activeStyle.border ? activeStyle.borderWidth ?? 1 : 1)
                    );
                  } else {
                    const clamped = Number(
                      Math.min(12, Math.max(0.5, parsed)).toFixed(2)
                    );
                    setBorderWidthInput(String(clamped));
                    if (
                      !activeStyle.border ||
                      activeStyle.borderWidth !== clamped
                    ) {
                      const shouldRecord = !borderSessionPushedRef.current;
                      applyStyleToSelection(
                        {
                          border: true,
                          borderWidth: clamped,
                          borderColor: activeStyle.borderColor || '#94a3b8',
                        },
                        shouldRecord
                      );
                    }
                  }
                  borderSessionPushedRef.current = false;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                    gridRef.current?.focus({ preventScroll: true });
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setBorderWidthInput(
                      String(activeStyle.border ? activeStyle.borderWidth ?? 1 : 1)
                    );
                    (e.currentTarget as HTMLInputElement).blur();
                    gridRef.current?.focus({ preventScroll: true });
                  }
                }}
                className="w-11 pl-2 pr-0.5 py-0.5 text-[11px] font-mono font-semibold text-slate-800 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[10px] font-mono text-slate-400 pr-1 select-none">
                px
              </span>
              <button
                type="button"
                aria-label="Pilih preset ketebalan border"
                title="Pilih ketebalan garis batas sel"
                onClick={() => {
                  setShowBorderMenu((v) => !v);
                  setShowTagMenu(false);
                  setShowImageMenu(false);
                }}
                className="px-1.5 py-1 border-l border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              >
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${
                    showBorderMenu ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {showBorderMenu && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-52 rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Preset Ketebalan Border
                </div>
                {BORDER_WIDTH_PRESETS.map((preset) => {
                  const currentWidth = activeStyle.border
                    ? activeStyle.borderWidth ?? 1
                    : 1;
                  const isActive =
                    activeStyle.border &&
                    Math.abs(currentWidth - preset.value) < 0.01;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        applyStyleToSelection({
                          border: true,
                          borderWidth: preset.value,
                          borderColor: activeStyle.borderColor || '#94a3b8',
                        });
                        setBorderWidthInput(String(preset.value));
                        setShowBorderMenu(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 flex items-center shrink-0">
                          <span
                            className="block w-full rounded-full"
                            style={{
                              height: `${Math.max(1, preset.value)}px`,
                              backgroundColor:
                                activeStyle.borderColor || '#334155',
                            }}
                          />
                        </span>
                        <span className="truncate">{preset.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400">
                          {preset.value}px
                        </span>
                        {isActive && <Check className="h-3.5 w-3.5 text-blue-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <input
            type="color"
            value={normalizeHexColor(activeStyle.borderColor, '#94a3b8')}
            onFocus={() => {
              colorSessionPushedRef.current = false;
            }}
            onBlur={() => {
              colorSessionPushedRef.current = false;
            }}
            onChange={(e) => {
              const shouldRecord = !colorSessionPushedRef.current;
              colorSessionPushedRef.current = true;
              applyStyleToSelection(
                {
                  border: true,
                  borderWidth: activeStyle.borderWidth ?? 1,
                  borderColor: e.target.value,
                },
                shouldRecord
              );
            }}
            className="h-5 w-5 rounded border border-slate-200 cursor-pointer"
            title="Warna garis batas sel (Border)"
          />
          {QUICK_BORDER_COLORS.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() =>
                applyStyleToSelection({
                  border: true,
                  borderWidth: activeStyle.borderWidth ?? 1,
                  borderColor: hex,
                })
              }
              style={{ backgroundColor: hex }}
              className="h-3.5 w-3.5 rounded-sm border border-slate-300"
              title={`Warna border ${hex}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5">
          {(
            [
              { value: 'left', icon: AlignLeft, label: 'Rata Kiri' },
              { value: 'center', icon: AlignCenter, label: 'Rata Tengah' },
              { value: 'right', icon: AlignRight, label: 'Rata Kanan' },
            ] as { value: ColumnAlign; icon: typeof AlignLeft; label: string }[]
          ).map((al) => {
            const Icon = al.icon;
            const active = (activeStyle.align ?? 'left') === al.value;
            return (
              <button
                key={al.value}
                type="button"
                onClick={() => applyStyleToSelection({ align: al.value })}
                title={al.label}
                className={`p-1.5 rounded ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5">
          {(
            [
              {
                value: 'top',
                icon: AlignVerticalJustifyStart,
                label: 'Rata Atas',
              },
              {
                value: 'middle',
                icon: AlignVerticalJustifyCenter,
                label: 'Rata Tengah Vertikal',
              },
              {
                value: 'bottom',
                icon: AlignVerticalJustifyEnd,
                label: 'Rata Bawah',
              },
            ] as {
              value: VerticalAlign;
              icon: typeof AlignVerticalJustifyStart;
              label: string;
            }[]
          ).map((va) => {
            const Icon = va.icon;
            const active = (activeStyle.verticalAlign ?? 'middle') === va.value;
            return (
              <button
                key={va.value}
                type="button"
                onClick={() => applyStyleToSelection({ verticalAlign: va.value })}
                title={va.label}
                className={`p-1.5 rounded ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1">
          <span className="text-[11px] text-slate-500">Latar</span>
          <input
            type="color"
            value={normalizeHexColor(activeStyle.bgColor, '#ffffff')}
            onFocus={() => {
              colorSessionPushedRef.current = false;
            }}
            onBlur={() => {
              colorSessionPushedRef.current = false;
            }}
            onChange={(e) => {
              const shouldRecord = !colorSessionPushedRef.current;
              colorSessionPushedRef.current = true;
              applyStyleToSelection({ bgColor: e.target.value }, shouldRecord);
            }}
            className="h-5 w-5 rounded border border-slate-200 cursor-pointer"
            title="Warna latar semua sel terpilih"
          />
          {QUICK_FILL_COLORS.map((hex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyStyleToSelection({ bgColor: hex || undefined })}
              title={hex ? `Latar ${hex}` : 'Hapus warna latar'}
              style={{ backgroundColor: hex || '#ffffff' }}
              className="h-4 w-4 rounded-sm border border-slate-300 relative"
            >
              {!hex && <span className="block w-full h-0.5 bg-red-400 rotate-45" />}
            </button>
          ))}

          <span className="text-slate-300 mx-0.5">|</span>
          <span className="text-[11px] text-slate-500">Teks</span>
          <input
            type="color"
            value={normalizeHexColor(activeStyle.textColor, '#0f172a')}
            onFocus={() => {
              colorSessionPushedRef.current = false;
            }}
            onBlur={() => {
              colorSessionPushedRef.current = false;
            }}
            onChange={(e) => {
              const shouldRecord = !colorSessionPushedRef.current;
              colorSessionPushedRef.current = true;
              applyStyleToSelection({ textColor: e.target.value }, shouldRecord);
            }}
            className="h-5 w-5 rounded border border-slate-200 cursor-pointer"
            title="Warna teks semua sel terpilih"
          />
          {QUICK_TEXT_COLORS.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => applyStyleToSelection({ textColor: hex })}
              style={{ backgroundColor: hex }}
              className="h-4 w-4 rounded-sm border border-slate-300"
              title={`Teks ${hex}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleToggleMerge}
          disabled={!canMerge && !activeCellMerge}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap"
          title="Pilih beberapa sel (seret atau Shift+Klik) untuk menggabungkan sel"
        >
          {activeCellMerge ? (
            <>
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              <span>Pisah Sel</span>
            </>
          ) : (
            <>
              <Combine className="h-3.5 w-3.5" />
              <span>Gabung Sel</span>
            </>
          )}
        </button>

        {mode === 'template' && (
          <button
            type="button"
            onClick={() => {
              commitChange((prev) => {
                const current = getLoopRowIndices(prev);
                const currSet = new Set(current);
                if (allSelectedRowsAreLoop) {
                  for (const r of selectedRowSpan) currSet.delete(r);
                } else {
                  for (const r of selectedRowSpan) currSet.add(r);
                }
                return withLoopRowIndices(prev, Array.from(currSet));
              });
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
              allSelectedRowsAreLoop
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
            title="Pilih 1 atau lebih baris untuk diulang otomatis per catatan activity saat ekspor"
          >
            <Repeat className="h-3.5 w-3.5" />
            <span>
              {allSelectedRowsAreLoop
                ? selection.startRow === selection.endRow
                  ? `Baris ${selection.startRow + 1}: Loop Aktif`
                  : `Baris ${selection.startRow + 1}-${selection.endRow + 1}: Loop Aktif`
                : selection.startRow === selection.endRow
                ? 'Jadikan Baris Loop'
                : `Jadikan Baris ${selection.startRow + 1}-${selection.endRow + 1} Loop`}
            </span>
          </button>
        )}
      </div>

      {/* Ribbon Row 2: Columns & Rows + Dynamic Tags (template mode) + Insert Image */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center gap-2 relative">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleInsertColumn(selection.startCol + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Columns3 className="h-3.5 w-3.5 text-slate-500" />
            <span>+ Kolom</span>
          </button>
          <button
            type="button"
            onClick={() => handleDeleteColumn(selection.startCol)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
            title={`Hapus kolom ${colIndexToLetter(selection.startCol)}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Hapus Kolom</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleInsertRow(selection.startRow + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Rows3 className="h-3.5 w-3.5 text-slate-500" />
            <span>+ Baris</span>
          </button>
          <button
            type="button"
            onClick={() => handleDeleteRow(selection.startRow)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
            title={`Hapus baris ${selection.startRow + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Hapus Baris</span>
          </button>
        </div>

        <span className="text-slate-200" aria-hidden="true">|</span>

        {mode === 'template' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowTagMenu((v) => !v);
                setShowImageMenu(false);
                setShowBorderMenu(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Sisipkan Data ke Sel {selectionLabel}</span>
            </button>

            {showTagMenu && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                    Data Activity (untuk Baris Loop)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ACTIVITY_DATA_TAGS.map((tag) => (
                      <button
                        key={tag.token}
                        type="button"
                        onClick={() => insertTokenIntoActiveCell(tag.token)}
                        className="px-2 py-1 rounded border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 hover:border-blue-400 hover:bg-blue-50"
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                    Info Laporan (untuk Kop / Bawah)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DOCUMENT_META_TAGS.map((tag) => (
                      <button
                        key={tag.token}
                        type="button"
                        onClick={() => insertTokenIntoActiveCell(tag.token)}
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50"
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                    Atau Buat Data Kustom Baru
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      placeholder="Misal: No. PO"
                      className="flex-1 min-w-0 px-2.5 py-1 rounded border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!customTagInput.trim()) return;
                        insertTokenIntoActiveCell(
                          `{{custom:${slugifyCustomKey(customTagInput.trim())}}}`
                        );
                        setCustomTagInput('');
                      }}
                      className="px-2.5 py-1 rounded bg-slate-900 text-white text-xs font-medium"
                    >
                      Sisip
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowImageMenu((v) => !v);
              setShowTagMenu(false);
              setShowBorderMenu(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <ImagePlus className="h-3.5 w-3.5 text-slate-600" />
            <span>+ Masukkan Gambar</span>
          </button>

          {showImageMenu && (
            <div className="absolute left-0 top-full mt-1.5 z-40 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-3">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Unggah Gambar (PNG / JPG)
              </button>
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-500 mb-1.5">Logo Bawaan:</div>
                <div className="grid grid-cols-3 gap-2">
                  {STARTER_LOGO_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => addImageToSheet(preset.url, preset.label)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:border-blue-500 bg-white flex flex-col items-center gap-1"
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 object-contain"
                      />
                      <span className="text-[10px] text-slate-600 truncate w-full text-center">
                        {preset.label.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFileUpload(file);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>

        {selectedImage && (
          <div className="ml-auto flex items-center gap-2 px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50/70 text-xs">
            <span className="font-medium text-blue-900">
              Gambar ({selectedImage.widthPx}×{selectedImage.heightPx}px)
            </span>
            <button
              type="button"
              onClick={() => {
                commitChange((prev) => ({
                  ...prev,
                  images: prev.images.filter((i) => i.id !== selectedImage.id),
                }));
                setSelectedImageId(null);
              }}
              className="text-red-600 font-medium hover:underline"
            >
              Hapus Gambar
            </button>
          </div>
        )}
      </div>

      {/* Formula / Cell Content Bar */}
      <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
        <div className="px-2.5 py-1 rounded border border-slate-200 bg-white font-mono text-xs font-semibold text-slate-700 tabular-nums min-w-[54px] text-center">
          {selectionLabel}
        </div>

        <div ref={formulaMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setShowFormulaMenu((v) => !v);
              setShowTagMenu(false);
              setShowImageMenu(false);
              setShowBorderMenu(false);
            }}
            title="Sisipkan Rumus (SUM, COUNT, COUNTIF, SUMIF)"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
              showFormulaMenu
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sigma className="h-3.5 w-3.5 text-blue-600" />
            <span>Rumus</span>
            <ChevronDown
              className={`h-3 w-3 text-slate-400 transition-transform ${
                showFormulaMenu ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showFormulaMenu && (
            <div className="absolute left-0 top-full mt-1.5 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Sisipkan Rumus ke Sel {selectionLabel}
              </div>
              {(() => {
                const colLetter = colIndexToLetter(selection.startCol);
                const endRowNum = Math.max(2, selection.startRow);
                const defaultRange = `${colLetter}2:${colLetter}${endRowNum}`;
                const prevColLetter =
                  selection.startCol > 0
                    ? colIndexToLetter(selection.startCol - 1)
                    : colLetter;
                const prevRange = `${prevColLetter}2:${prevColLetter}${endRowNum}`;

                const formulaPresets = [
                  {
                    name: 'SUM',
                    syntax: `=SUM(${defaultRange})`,
                    desc: 'Menjumlahkan angka atau durasi (HH:mm) pada rentang sel',
                    selStart: 5,
                    selEnd: 5 + defaultRange.length,
                  },
                  {
                    name: 'COUNT',
                    syntax: `=COUNT(${defaultRange})`,
                    desc: 'Menghitung jumlah sel yang berisi angka atau durasi',
                    selStart: 7,
                    selEnd: 7 + defaultRange.length,
                  },
                  {
                    name: 'COUNTIF',
                    syntax: `=COUNTIF(${defaultRange}, "kriteria")`,
                    desc: 'Menghitung sel yang memenuhi kondisi tertentu (mis. "PRJ-01", ">2")',
                    selStart: 9,
                    selEnd: 9 + defaultRange.length,
                  },
                  {
                    name: 'SUMIF',
                    syntax: `=SUMIF(${prevRange}, "kriteria", ${defaultRange})`,
                    desc: 'Menjumlahkan nilai pada rentang hasil sesuai kriteria',
                    selStart: 7,
                    selEnd: 7 + prevRange.length,
                  },
                  {
                    name: 'COUNTA',
                    syntax: `=COUNTA(${defaultRange})`,
                    desc: 'Menghitung seluruh sel yang tidak kosong (teks maupun angka)',
                    selStart: 8,
                    selEnd: 8 + defaultRange.length,
                  },
                ];

                return formulaPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      insertFormulaPreset(
                        preset.syntax,
                        preset.selStart,
                        preset.selEnd
                      )
                    }
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-50/70 transition-colors border border-transparent hover:border-blue-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700">
                        {preset.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600 truncate">
                        {preset.syntax}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {preset.desc}
                    </div>
                  </button>
                ));
              })()}
            </div>
          )}
        </div>

        <span className="font-mono text-xs text-slate-400">fx</span>
        <input
          ref={formulaInputRef}
          type="text"
          value={activeCellData.value ?? ''}
          onFocus={() => {
            formulaSessionPushedRef.current = false;
          }}
          onBlur={() => {
            formulaSessionPushedRef.current = false;
          }}
          onChange={(e) => {
            const shouldRecord = !formulaSessionPushedRef.current;
            formulaSessionPushedRef.current = true;
            setCellValue(
              selection.startRow,
              selection.startCol,
              e.target.value,
              shouldRecord
            );
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              moveActiveCell(e.shiftKey ? -1 : 1, 0, false);
              gridRef.current?.focus({ preventScroll: true });
            } else if (e.key === 'Escape') {
              e.preventDefault();
              gridRef.current?.focus({ preventScroll: true });
            }
          }}
          placeholder={
            mode === 'template'
              ? 'Ketik teks, tag {{tanggal}}, atau rumus =SUM(...), =COUNT(...), =COUNTIF(...), =SUMIF(...)'
              : 'Ketik teks atau rumus =SUM(...), =COUNT(...), =COUNTIF(...), =SUMIF(...)'
          }
          className="flex-1 px-2.5 py-1 rounded border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-blue-600"
        />
        {(() => {
          const activeEval = evaluateSheetCell(
            sheet,
            selection.startRow,
            selection.startCol
          );
          if (!activeEval.isFormula) return null;
          return (
            <div
              className={`px-2 py-1 rounded border font-mono text-[11px] font-semibold whitespace-nowrap ${
                activeEval.isError
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
              title="Hasil evaluasi rumus saat ini"
            >
              = {activeEval.display}
            </div>
          );
        })()}
      </div>

      {/* Interactive Excel Grid Area */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        className={`overflow-auto bg-slate-100/70 p-0 pb-3 pr-3 outline-none ${maxHeightClass}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const file = e.dataTransfer.files?.[0];
          if (file && file.type.startsWith('image/')) {
            e.preventDefault();
            handleImageFileUpload(file);
          }
        }}
      >
        <div className="inline-block bg-white shadow-sm border-r border-b border-slate-300 select-none">
          {/* Column Letters Header Row */}
          <div className="flex border-b border-slate-300 bg-slate-100 sticky top-0 z-20">
            <div className="w-14 shrink-0 border-r border-slate-300 bg-slate-100 sticky left-0 z-30" />
            {sheet.colWidths.map((w, cIdx) => {
              const isColSelected = allSelections.some(
                (rng) => cIdx >= rng.startCol && cIdx <= rng.endCol
              );
              return (
                <div
                  key={cIdx}
                  style={{ width: `${w}px` }}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      setAdditionalRanges((prev) => [...prev, selection]);
                    } else {
                      setAdditionalRanges([]);
                    }
                    setAnchorCell({ row: 0, col: cIdx });
                    setFocusCell({ row: sheet.rowHeights.length - 1, col: cIdx });
                    setSelectedImageId(null);
                    setEditingCell(null);
                    gridRef.current?.focus({ preventScroll: true });
                  }}
                  className={`relative shrink-0 h-7 border-r border-slate-300 flex items-center justify-center font-mono text-[11px] font-semibold cursor-pointer ${
                    isColSelected
                      ? 'bg-blue-100 text-blue-800'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <span>{colIndexToLetter(cIdx)}</span>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      dragInitialSheetRef.current = structuredClone(sheetRef.current);
                      setColResize({ colIndex: cIdx, startX: e.clientX, origWidth: w });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleAutoFitColumn(cIdx);
                    }}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/80"
                    title="Seret untuk ubah lebar · Klik dua kali untuk sesuaikan dengan isi"
                  />
                </div>
              );
            })}
          </div>

          {/* Grid Body */}
          <div className="flex">
            {/* Left Row Numbers */}
            <div className="w-14 shrink-0 bg-slate-100 border-r border-slate-300 sticky left-0 z-10">
              {sheet.rowHeights.map((h, rIdx) => {
                const isRowSelected = allSelections.some(
                  (rng) => rIdx >= rng.startRow && rIdx <= rng.endRow
                );
                const isLoop = mode === 'template' && loopRowSet.has(rIdx);
                return (
                  <div
                    key={rIdx}
                    style={{ height: `${h}px` }}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        setAdditionalRanges((prev) => [...prev, selection]);
                      } else {
                        setAdditionalRanges([]);
                      }
                      setAnchorCell({ row: rIdx, col: 0 });
                      setFocusCell({ row: rIdx, col: sheet.colWidths.length - 1 });
                      setSelectedImageId(null);
                      setEditingCell(null);
                      gridRef.current?.focus({ preventScroll: true });
                    }}
                    className={`relative border-b border-slate-300 flex items-center justify-center gap-1 font-mono text-[11px] cursor-pointer px-1 ${
                      isLoop
                        ? 'bg-blue-600 text-white font-semibold'
                        : isRowSelected
                        ? 'bg-blue-100 text-blue-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                    title={
                      isLoop
                        ? 'Baris ini mengulang data activity saat ekspor'
                        : 'Klik untuk pilih baris'
                    }
                  >
                    <span>{rIdx + 1}</span>
                    {isLoop && <Repeat className="h-3 w-3 shrink-0" />}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        dragInitialSheetRef.current = structuredClone(sheetRef.current);
                        setRowResize({
                          rowIndex: rIdx,
                          startY: e.clientY,
                          origHeight: h,
                        });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleAutoFitRow(rIdx);
                      }}
                      className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-blue-500/80"
                      title="Seret untuk ubah tinggi · Klik dua kali untuk sesuaikan dengan isi"
                    />
                  </div>
                );
              })}
            </div>

            {/* Cell Matrix + Draggable Images Overlay */}
            <div
              className="relative"
              style={{ width: `${totalTableWidth}px` }}
              onClick={() => {
                setShowTagMenu(false);
                setShowImageMenu(false);
                setShowBorderMenu(false);
                setShowFormulaMenu(false);
              }}
            >
              <table
                className="border-collapse table-fixed"
                style={{ width: `${totalTableWidth}px` }}
              >
                <colgroup>
                  {sheet.colWidths.map((w, idx) => (
                    <col key={idx} style={{ width: `${w}px` }} />
                  ))}
                </colgroup>
                <tbody>
                  {sheet.rowHeights.map((h, rIdx) => (
                    <tr key={rIdx} style={{ height: `${h}px` }}>
                      {sheet.colWidths.map((_, cIdx) => {
                        const merge = getMergeCoveringCell(sheet.merges, rIdx, cIdx);
                        if (merge && (merge.startRow !== rIdx || merge.startCol !== cIdx)) {
                          return null;
                        }

                        const colSpan = merge ? merge.endCol - merge.startCol + 1 : 1;
                        const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
                        const k = cellKey(rIdx, cIdx);
                        const cellData = sheet.cells[k];
                        const st = cellData?.style;
                        const val = cellData?.value ?? '';
                        const cellEval = evaluateSheetCell(sheet, rIdx, cIdx);

                        const cellEndRow = rIdx + rowSpan - 1;
                        const cellEndCol = cIdx + colSpan - 1;
                        const isSelected = allSelections.some(
                          (rng) =>
                            cellEndRow >= rng.startRow &&
                            rIdx <= rng.endRow &&
                            cellEndCol >= rng.startCol &&
                            cIdx <= rng.endCol
                        );
                        const isPrimary =
                          rIdx === selection.startRow && cIdx === selection.startCol;

                        const isEditing =
                          editingCell?.row === rIdx && editingCell?.col === cIdx;

                        const hasToken = mode === 'template' && /\{\{[^}]+\}\}/.test(val);

                        return (
                          <td
                            key={cIdx}
                            data-cell={`${rIdx}-${cIdx}`}
                            colSpan={colSpan}
                            rowSpan={rowSpan}
                            onMouseDown={(e) => {
                              if (isEditing) return;
                              e.stopPropagation();
                              if (editingCell) {
                                const prevVal =
                                  sheetRef.current.cells[
                                    cellKey(editingCell.row, editingCell.col)
                                  ]?.value ?? '';
                                if (editBuffer !== prevVal) {
                                  setCellValue(
                                    editingCell.row,
                                    editingCell.col,
                                    editBuffer,
                                    true
                                  );
                                }
                                setEditingCell(null);
                              }
                              setSelectedImageId(null);
                              if (e.shiftKey) {
                                setFocusCell({ row: rIdx, col: cIdx });
                              } else if (e.ctrlKey || e.metaKey) {
                                setAdditionalRanges((prev) => [...prev, selection]);
                                setAnchorCell({ row: rIdx, col: cIdx });
                                setFocusCell({ row: rIdx, col: cIdx });
                                setSelectingCells(true);
                              } else {
                                setAdditionalRanges([]);
                                setAnchorCell({ row: rIdx, col: cIdx });
                                setFocusCell({ row: rIdx, col: cIdx });
                                setSelectingCells(true);
                              }
                              gridRef.current?.focus({ preventScroll: true });
                            }}
                            onMouseEnter={() => {
                              if (selectingCells) {
                                setFocusCell({ row: rIdx, col: cIdx });
                              }
                            }}
                            onDoubleClick={() => beginInlineEdit(rIdx, cIdx)}
                            style={{
                              backgroundColor:
                                st?.bgColor || (isSelected ? '#eff6ff' : '#ffffff'),
                              color: cellEval.isError
                                ? '#dc2626'
                                : st?.textColor || '#0f172a',
                              textAlign: st?.align || 'left',
                              verticalAlign: st?.verticalAlign || 'middle',
                              fontWeight: st?.bold ? 700 : 400,
                              fontStyle: st?.italic ? 'italic' : 'normal',
                              fontSize: `${st?.fontSize ?? 11}px`,
                              border: st?.border
                                ? `${st.borderWidth ?? 1}px solid ${st.borderColor || '#94a3b8'}`
                                : '1px dashed rgba(203, 213, 225, 0.75)',
                              boxShadow: isPrimary
                                ? 'inset 0 0 0 2px #2563eb'
                                : isSelected
                                ? 'inset 0 0 0 1.5px #60a5fa'
                                : undefined,
                            }}
                            className="relative px-1.5 py-0.5 overflow-hidden"
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                value={editBuffer}
                                onChange={(e) => setEditBuffer(e.target.value)}
                                onBlur={() => commitInlineEdit()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitInlineEdit(e.shiftKey ? 'up' : 'down', true);
                                  } else if (e.key === 'Tab') {
                                    e.preventDefault();
                                    commitInlineEdit(e.shiftKey ? 'left' : 'right', true);
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    commitInlineEdit('up', true);
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    commitInlineEdit('down', true);
                                  } else if (
                                    e.key === 'ArrowLeft' &&
                                    editOrigin === 'type'
                                  ) {
                                    e.preventDefault();
                                    commitInlineEdit('left', true);
                                  } else if (
                                    e.key === 'ArrowRight' &&
                                    editOrigin === 'type'
                                  ) {
                                    e.preventDefault();
                                    commitInlineEdit('right', true);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingCell(null);
                                    requestAnimationFrame(() => {
                                      gridRef.current?.focus({ preventScroll: true });
                                    });
                                  }
                                }}
                                autoFocus
                                className="w-full h-full bg-white text-slate-900 text-xs px-1 outline-none"
                              />
                            ) : (
                              <div
                                title={
                                  cellEval.isFormula
                                    ? `Rumus: ${val} → ${cellEval.display}`
                                    : undefined
                                }
                                style={{
                                  maxHeight: `${Math.max(16, h * rowSpan - 4)}px`,
                                }}
                                className={`whitespace-pre-wrap break-words leading-snug overflow-hidden ${
                                  hasToken ? 'font-mono text-[11px]' : ''
                                }`}
                              >
                                {cellEval.display}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Floating Draggable & Resizable Images */}
              {sheet.images.map((img) => {
                const isImgSelected = selectedImageId === img.id;
                return (
                  <div
                    key={img.id}
                    style={{
                      left: `${img.xPx}px`,
                      top: `${img.yPx}px`,
                      width: `${img.widthPx}px`,
                      height: `${img.heightPx}px`,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedImageId(img.id);
                      setEditingCell(null);
                      dragInitialSheetRef.current = structuredClone(sheetRef.current);
                      setImgInteraction({
                        id: img.id,
                        mode: 'move',
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origX: img.xPx,
                        origY: img.yPx,
                        origW: img.widthPx,
                        origH: img.heightPx,
                      });
                    }}
                    className={`absolute cursor-move z-10 group ${
                      isImgSelected
                        ? 'ring-2 ring-blue-600 bg-white/30'
                        : 'hover:ring-1 hover:ring-blue-400'
                    }`}
                    title="Seret gambar ke posisi manapun"
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.label || 'Gambar sheet'}
                      referrerPolicy="no-referrer"
                      draggable={false}
                      className="w-full h-full object-contain pointer-events-none"
                    />

                    {isImgSelected && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          dragInitialSheetRef.current = structuredClone(sheetRef.current);
                          setImgInteraction({
                            id: img.id,
                            mode: 'resize',
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            origX: img.xPx,
                            origY: img.yPx,
                            origW: img.widthPx,
                            origH: img.heightPx,
                          });
                        }}
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-sm bg-blue-600 border-2 border-white cursor-nwse-resize shadow"
                        title="Seret untuk ubah ukuran gambar"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          Gunakan tombol panah untuk berpindah sel · Klik dua kali atau tekan F2 untuk mengetik · Seret sel lalu klik Gabung Sel
        </span>
        <span className="font-mono tabular-nums">
          {sheet.images.length} gambar
          {mode === 'template' && (
            <>
              {' '}
              · Baris loop:{' '}
              {loopRows.length > 0
                ? `Baris ${loopRows.map((r) => r + 1).join(', ')}`
                : 'Belum dipilih'}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
