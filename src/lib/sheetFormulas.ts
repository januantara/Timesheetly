import type { SheetTemplate } from '../types';

export interface CellEvalResult {
  display: string;
  numericValue: number | null;
  isFormula: boolean;
  isError: boolean;
  isDuration: boolean;
}

function makeCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function parseColLetters(letters: string): number {
  const upper = letters.toUpperCase();
  let col = 0;
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col - 1;
}

export function formatColLetters(index: number): string {
  let result = '';
  let n = Math.max(0, index);
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export interface ParsedCellRef {
  row: number;
  col: number;
  absCol: boolean;
  absRow: boolean;
}

export function parseCellRef(token: string): ParsedCellRef | null {
  const match = token.trim().match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/);
  if (!match) return null;
  const absCol = match[1] === '$';
  const col = parseColLetters(match[2]);
  const absRow = match[3] === '$';
  const rowNum = Number(match[4]);
  if (!Number.isInteger(rowNum) || rowNum < 1 || col < 0) return null;
  return { row: rowNum - 1, col, absCol, absRow };
}

function formatCellRef(
  col: number,
  row: number,
  absCol = false,
  absRow = false
): string {
  return `${absCol ? '$' : ''}${formatColLetters(col)}${absRow ? '$' : ''}${row + 1}`;
}

export function isFormulaValue(raw: string | undefined): boolean {
  return Boolean(raw && raw.trim().startsWith('='));
}

export function parseNumericValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function parseDurationMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

export function formatMinutesHHmm(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatNumberDisplay(num: number): string {
  if (!Number.isFinite(num)) return '#NUM!';
  const rounded = Math.round(num * 1e9) / 1e9;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Transform user-entered formula text into Excel-compatible formula string (without leading '=').
 * - Converts ';' argument separators (outside quotes) to ','
 * - Normalizes 'COUNT IF(' / 'SUM IF(' to 'COUNTIF(' / 'SUMIF('
 */
export function toExcelFormulaString(rawFormula: string): string {
  const body = rawFormula.trim().replace(/^=+/, '');
  let out = '';
  let inQuotes = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      if (inQuotes && body[i + 1] === '"') {
        out += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      out += ch;
      continue;
    }
    if (!inQuotes && ch === ';') {
      out += ',';
    } else {
      out += ch;
    }
  }

  // Normalize spaced function names outside quotes
  let normalized = '';
  let q = false;
  let segment = '';
  const flushSegment = () => {
    if (!segment) return;
    normalized += segment
      .replace(/\bcount\s+if\s*\(/gi, 'COUNTIF(')
      .replace(/\bsum\s+if\s*\(/gi, 'SUMIF(');
    segment = '';
  };

  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (ch === '"') {
      if (!q) {
        flushSegment();
        q = true;
        normalized += ch;
      } else if (out[i + 1] === '"') {
        normalized += '""';
        i++;
      } else {
        q = false;
        normalized += ch;
      }
    } else if (q) {
      normalized += ch;
    } else {
      segment += ch;
    }
  }
  flushSegment();

  return normalized.trim();
}

function splitFormulaArgs(argsText: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if (ch === '"') {
      if (inQuotes && argsText[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if ((ch === ',' || ch === ';') && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }

  if (current.trim().length > 0 || args.length > 0) {
    args.push(current.trim());
  }
  return args;
}

function parseRangeRect(
  expr: string,
  maxRows: number,
  maxCols: number
): { startRow: number; startCol: number; endRow: number; endCol: number } | null {
  const trimmed = expr.trim();
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) {
    const single = parseCellRef(trimmed);
    if (!single) return null;
    return {
      startRow: single.row,
      startCol: single.col,
      endRow: single.row,
      endCol: single.col,
    };
  }
  const left = parseCellRef(trimmed.slice(0, colonIdx));
  const right = parseCellRef(trimmed.slice(colonIdx + 1));
  if (!left || !right) return null;

  const startRow = Math.max(0, Math.min(left.row, right.row));
  const endRow = Math.min(Math.max(0, maxRows - 1), Math.max(left.row, right.row));
  const startCol = Math.max(0, Math.min(left.col, right.col));
  const endCol = Math.min(Math.max(0, maxCols - 1), Math.max(left.col, right.col));

  if (endRow < startRow || endCol < startCol) return null;
  return { startRow, startCol, endRow, endCol };
}

function wildcardToRegExp(pattern: string): RegExp {
  let regexStr = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && (pattern[i + 1] === '*' || pattern[i + 1] === '?' || pattern[i + 1] === '~')) {
      regexStr += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    } else if (ch === '*') {
      regexStr += '.*';
    } else if (ch === '?') {
      regexStr += '.';
    } else {
      regexStr += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  regexStr += '$';
  return new RegExp(regexStr, 'i');
}

function compareValues(cellVal: string, targetVal: string): number | null {
  const numA = parseNumericValue(cellVal);
  const numB = parseNumericValue(targetVal);
  if (numA !== null && numB !== null) {
    return numA === numB ? 0 : numA < numB ? -1 : 1;
  }
  const durA = parseDurationMinutes(cellVal);
  const durB = parseDurationMinutes(targetVal);
  if (durA !== null && durB !== null) {
    return durA === durB ? 0 : durA < durB ? -1 : 1;
  }
  return null;
}

export function matchesCriteria(cellDisplayValue: string, criteriaRaw: string): boolean {
  const cellTrim = cellDisplayValue.trim();
  const critTrim = criteriaRaw.trim();

  if (critTrim === '') {
    return cellTrim === '';
  }

  const opMatch = critTrim.match(/^(>=|<=|<>|!=|>|<|=)(.*)$/);
  if (opMatch) {
    const op = opMatch[1];
    const rhs = opMatch[2].trim();

    if (op === '<>' || op === '!=') {
      if (rhs === '') return cellTrim !== '';
      const cmp = compareValues(cellTrim, rhs);
      if (cmp !== null) return cmp !== 0;
      if (rhs.includes('*') || rhs.includes('?')) {
        return !wildcardToRegExp(rhs).test(cellTrim);
      }
      return cellTrim.toLowerCase() !== rhs.toLowerCase();
    }

    if (op === '=') {
      if (rhs === '') return cellTrim === '';
      const cmp = compareValues(cellTrim, rhs);
      if (cmp !== null) return cmp === 0;
      if (rhs.includes('*') || rhs.includes('?')) {
        return wildcardToRegExp(rhs).test(cellTrim);
      }
      return cellTrim.toLowerCase() === rhs.toLowerCase();
    }

    const cmp = compareValues(cellTrim, rhs);
    if (cmp !== null) {
      if (op === '>') return cmp > 0;
      if (op === '>=') return cmp >= 0;
      if (op === '<') return cmp < 0;
      if (op === '<=') return cmp <= 0;
    }

    // String fallback comparison for >, >=, <, <=
    if (!cellTrim) return false;
    const strCmp = cellTrim.toLowerCase().localeCompare(rhs.toLowerCase());
    if (op === '>') return strCmp > 0;
    if (op === '>=') return strCmp >= 0;
    if (op === '<') return strCmp < 0;
    if (op === '<=') return strCmp <= 0;
    return false;
  }

  // Exact or wildcard match
  const numCmp = compareValues(cellTrim, critTrim);
  if (numCmp !== null) {
    return numCmp === 0;
  }

  if (critTrim.includes('*') || critTrim.includes('?')) {
    return wildcardToRegExp(critTrim).test(cellTrim);
  }

  return cellTrim.toLowerCase() === critTrim.toLowerCase();
}

interface InternalEvalValue {
  kind: 'number' | 'string' | 'duration' | 'error';
  num: number;
  str: string;
}

function summarizeValuesForSum(values: string[]): InternalEvalValue {
  let numTotal = 0;
  let numCount = 0;
  let durTotal = 0;
  let durCount = 0;

  for (const val of values) {
    const trimmed = val.trim();
    if (!trimmed) continue;
    const num = parseNumericValue(trimmed);
    if (num !== null) {
      numTotal += num;
      numCount++;
      continue;
    }
    const dur = parseDurationMinutes(trimmed);
    if (dur !== null) {
      durTotal += dur;
      durCount++;
    }
  }

  if (numCount === 0 && durCount > 0) {
    return {
      kind: 'duration',
      num: durTotal,
      str: formatMinutesHHmm(durTotal),
    };
  }

  return {
    kind: 'number',
    num: numTotal,
    str: formatNumberDisplay(numTotal),
  };
}

function evalExpression(
  expr: string,
  sheet: SheetTemplate,
  visited: Set<string>
): InternalEvalValue {
  const trimmed = expr.trim();
  if (!trimmed) {
    return { kind: 'string', num: 0, str: '' };
  }

  // String literal "..."
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    // Check that the opening quote closes only at the very end
    let closesAtEnd = true;
    for (let i = 1; i < trimmed.length - 1; i++) {
      if (trimmed[i] === '"') {
        if (trimmed[i + 1] === '"') {
          i++;
        } else {
          closesAtEnd = false;
          break;
        }
      }
    }
    if (closesAtEnd) {
      return {
        kind: 'string',
        num: 0,
        str: trimmed.slice(1, -1).replace(/""/g, '"'),
      };
    }
  }

  // Numeric literal
  const directNum = parseNumericValue(trimmed);
  if (directNum !== null) {
    return { kind: 'number', num: directNum, str: formatNumberDisplay(directNum) };
  }

  // Strip balanced outer parentheses
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    let depth = 0;
    let inQuotes = false;
    let wrapsEntire = true;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '"') {
        if (inQuotes && trimmed[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0 && i < trimmed.length - 1) {
            wrapsEntire = false;
            break;
          }
        }
      }
    }
    if (wrapsEntire && depth === 0) {
      return evalExpression(trimmed.slice(1, -1), sheet, visited);
    }
  }

  // Binary + / - at top level (left-to-right => scan right-to-left)
  let depth = 0;
  let inQuotes = false;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
      // Ignore unary sign after another operator
      const prevNonSpace = trimmed.slice(0, i).trimEnd().slice(-1);
      if (!prevNonSpace || ['+', '-', '*', '/', '(', ',', ';'].includes(prevNonSpace)) {
        continue;
      }
      const left = evalExpression(trimmed.slice(0, i), sheet, visited);
      const right = evalExpression(trimmed.slice(i + 1), sheet, visited);
      if (left.kind === 'error') return left;
      if (right.kind === 'error') return right;
      if (left.kind === 'duration' && right.kind === 'duration') {
        const resMins = ch === '+' ? left.num + right.num : left.num - right.num;
        return { kind: 'duration', num: resMins, str: formatMinutesHHmm(resMins) };
      }
      if (
        (left.kind !== 'number' && parseNumericValue(left.str) === null) ||
        (right.kind !== 'number' && parseNumericValue(right.str) === null)
      ) {
        return { kind: 'error', num: 0, str: '#VALUE!' };
      }
      const lNum = left.kind === 'number' ? left.num : Number(left.str);
      const rNum = right.kind === 'number' ? right.num : Number(right.str);
      const val = ch === '+' ? lNum + rNum : lNum - rNum;
      return { kind: 'number', num: val, str: formatNumberDisplay(val) };
    }
  }

  // Binary * / / at top level
  depth = 0;
  inQuotes = false;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    else if (depth === 0 && (ch === '*' || ch === '/')) {
      const left = evalExpression(trimmed.slice(0, i), sheet, visited);
      const right = evalExpression(trimmed.slice(i + 1), sheet, visited);
      if (left.kind === 'error') return left;
      if (right.kind === 'error') return right;
      const lNum = left.kind === 'number' ? left.num : parseNumericValue(left.str);
      const rNum = right.kind === 'number' ? right.num : parseNumericValue(right.str);
      if (lNum === null || rNum === null) {
        return { kind: 'error', num: 0, str: '#VALUE!' };
      }
      if (ch === '/' && rNum === 0) {
        return { kind: 'error', num: 0, str: '#DIV/0!' };
      }
      const val = ch === '*' ? lNum * rNum : lNum / rNum;
      return { kind: 'number', num: val, str: formatNumberDisplay(val) };
    }
  }

  // Unary +/-
  if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
    const inner = evalExpression(trimmed.slice(1), sheet, visited);
    if (inner.kind === 'error') return inner;
    const n = inner.kind === 'number' ? inner.num : parseNumericValue(inner.str);
    if (n === null) return { kind: 'error', num: 0, str: '#VALUE!' };
    const signed = trimmed.startsWith('-') ? -n : n;
    return { kind: 'number', num: signed, str: formatNumberDisplay(signed) };
  }

  // Function call NAME(...)
  const fnMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9\s]*)\(([\s\S]*)\)$/);
  if (fnMatch) {
    const fnName = fnMatch[1].replace(/\s+/g, '').toUpperCase();
    const argsRaw = fnMatch[2];
    const args = argsRaw.trim() ? splitFormulaArgs(argsRaw) : [];
    return evalFunction(fnName, args, sheet, visited);
  }

  // Single cell reference
  const cellRef = parseCellRef(trimmed);
  if (cellRef) {
    const res = evaluateCellInternal(sheet, cellRef.row, cellRef.col, visited);
    return res;
  }

  return { kind: 'error', num: 0, str: '#NAME?' };
}

function collectArgValues(
  args: string[],
  sheet: SheetTemplate,
  visited: Set<string>
): { values: string[]; error?: InternalEvalValue } {
  const maxRows = sheet.rowHeights.length;
  const maxCols = sheet.colWidths.length;
  const values: string[] = [];

  for (const arg of args) {
    if (!arg) continue;
    const rect = parseRangeRect(arg, maxRows, maxCols);
    if (rect) {
      for (let r = rect.startRow; r <= rect.endRow; r++) {
        for (let c = rect.startCol; c <= rect.endCol; c++) {
          const cellVal = evaluateCellInternal(sheet, r, c, visited);
          if (cellVal.kind === 'error') {
            return { values: [], error: cellVal };
          }
          values.push(cellVal.str);
        }
      }
    } else {
      const evaluated = evalExpression(arg, sheet, visited);
      if (evaluated.kind === 'error') {
        return { values: [], error: evaluated };
      }
      values.push(evaluated.str);
    }
  }

  return { values };
}

function evalFunction(
  fnName: string,
  args: string[],
  sheet: SheetTemplate,
  visited: Set<string>
): InternalEvalValue {
  const maxRows = sheet.rowHeights.length;
  const maxCols = sheet.colWidths.length;

  if (fnName === 'SUM') {
    if (args.length === 0) return { kind: 'error', num: 0, str: '#VALUE!' };
    const collected = collectArgValues(args, sheet, visited);
    if (collected.error) return collected.error;
    return summarizeValuesForSum(collected.values);
  }

  if (fnName === 'COUNT') {
    if (args.length === 0) return { kind: 'error', num: 0, str: '#VALUE!' };
    const collected = collectArgValues(args, sheet, visited);
    if (collected.error) return collected.error;
    let count = 0;
    for (const v of collected.values) {
      if (parseNumericValue(v) !== null || parseDurationMinutes(v) !== null) {
        count++;
      }
    }
    return { kind: 'number', num: count, str: String(count) };
  }

  if (fnName === 'COUNTA') {
    if (args.length === 0) return { kind: 'error', num: 0, str: '#VALUE!' };
    const collected = collectArgValues(args, sheet, visited);
    if (collected.error) return collected.error;
    let count = 0;
    for (const v of collected.values) {
      if (v.trim() !== '') count++;
    }
    return { kind: 'number', num: count, str: String(count) };
  }

  if (fnName === 'AVERAGE' || fnName === 'AVG') {
    if (args.length === 0) return { kind: 'error', num: 0, str: '#VALUE!' };
    const collected = collectArgValues(args, sheet, visited);
    if (collected.error) return collected.error;
    let total = 0;
    let count = 0;
    let durTotal = 0;
    let durCount = 0;
    for (const v of collected.values) {
      const n = parseNumericValue(v);
      if (n !== null) {
        total += n;
        count++;
      } else {
        const d = parseDurationMinutes(v);
        if (d !== null) {
          durTotal += d;
          durCount++;
        }
      }
    }
    if (count === 0 && durCount > 0) {
      const avgDur = durTotal / durCount;
      return { kind: 'duration', num: avgDur, str: formatMinutesHHmm(avgDur) };
    }
    if (count === 0) return { kind: 'error', num: 0, str: '#DIV/0!' };
    const avg = total / count;
    return { kind: 'number', num: avg, str: formatNumberDisplay(avg) };
  }

  if (fnName === 'COUNTIF') {
    if (args.length !== 2) return { kind: 'error', num: 0, str: '#VALUE!' };
    const rect = parseRangeRect(args[0], maxRows, maxCols);
    if (!rect) return { kind: 'error', num: 0, str: '#REF!' };

    const criteriaVal = evalCriteriaArg(args[1], sheet, visited);
    if (criteriaVal.error) return criteriaVal.error;

    let count = 0;
    for (let r = rect.startRow; r <= rect.endRow; r++) {
      for (let c = rect.startCol; c <= rect.endCol; c++) {
        const cellVal = evaluateCellInternal(sheet, r, c, visited);
        if (cellVal.kind === 'error') return cellVal;
        if (matchesCriteria(cellVal.str, criteriaVal.str)) {
          count++;
        }
      }
    }
    return { kind: 'number', num: count, str: String(count) };
  }

  if (fnName === 'SUMIF') {
    if (args.length < 2 || args.length > 3) {
      return { kind: 'error', num: 0, str: '#VALUE!' };
    }
    const criteriaRect = parseRangeRect(args[0], maxRows, maxCols);
    if (!criteriaRect) return { kind: 'error', num: 0, str: '#REF!' };

    const criteriaVal = evalCriteriaArg(args[1], sheet, visited);
    if (criteriaVal.error) return criteriaVal.error;

    let sumStartRow = criteriaRect.startRow;
    let sumStartCol = criteriaRect.startCol;
    if (args.length === 3) {
      const sumRect = parseRangeRect(args[2], maxRows, maxCols);
      if (!sumRect) return { kind: 'error', num: 0, str: '#REF!' };
      sumStartRow = sumRect.startRow;
      sumStartCol = sumRect.startCol;
    }

    const matchedSumValues: string[] = [];
    const rowSpan = criteriaRect.endRow - criteriaRect.startRow;
    const colSpan = criteriaRect.endCol - criteriaRect.startCol;

    for (let dr = 0; dr <= rowSpan; dr++) {
      for (let dc = 0; dc <= colSpan; dc++) {
        const critCell = evaluateCellInternal(
          sheet,
          criteriaRect.startRow + dr,
          criteriaRect.startCol + dc,
          visited
        );
        if (critCell.kind === 'error') return critCell;
        if (matchesCriteria(critCell.str, criteriaVal.str)) {
          const sr = sumStartRow + dr;
          const sc = sumStartCol + dc;
          if (sr >= 0 && sr < maxRows && sc >= 0 && sc < maxCols) {
            const sumCell = evaluateCellInternal(sheet, sr, sc, visited);
            if (sumCell.kind === 'error') return sumCell;
            matchedSumValues.push(sumCell.str);
          }
        }
      }
    }

    return summarizeValuesForSum(matchedSumValues);
  }

  return { kind: 'error', num: 0, str: '#NAME?' };
}

function evalCriteriaArg(
  arg: string,
  sheet: SheetTemplate,
  visited: Set<string>
): { str: string; error?: InternalEvalValue } {
  const trimmed = arg.trim();
  if (!trimmed) return { str: '' };

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return { str: trimmed.slice(1, -1).replace(/""/g, '"') };
  }

  const ref = parseCellRef(trimmed);
  if (ref) {
    const val = evaluateCellInternal(sheet, ref.row, ref.col, visited);
    if (val.kind === 'error') return { str: '', error: val };
    return { str: val.str };
  }

  const evaluated = evalExpression(trimmed, sheet, visited);
  if (evaluated.kind === 'error') {
    // Allow unquoted comparison/wildcard criteria fallback like >10
    if (/^(>=|<=|<>|!=|>|<|=)/.test(trimmed) || trimmed.includes('*') || trimmed.includes('?')) {
      return { str: trimmed };
    }
    return { str: '', error: evaluated };
  }
  return { str: evaluated.str };
}

function evaluateCellInternal(
  sheet: SheetTemplate,
  row: number,
  col: number,
  visited: Set<string>
): InternalEvalValue {
  if (row < 0 || row >= sheet.rowHeights.length || col < 0 || col >= sheet.colWidths.length) {
    return { kind: 'string', num: 0, str: '' };
  }

  const key = makeCellKey(row, col);
  const raw = sheet.cells[key]?.value ?? '';

  if (!isFormulaValue(raw)) {
    const dur = parseDurationMinutes(raw);
    if (dur !== null) {
      return { kind: 'duration', num: dur, str: raw.trim() };
    }
    const num = parseNumericValue(raw);
    if (num !== null) {
      return { kind: 'number', num, str: raw.trim() };
    }
    return { kind: 'string', num: 0, str: raw };
  }

  if (visited.has(key)) {
    return { kind: 'error', num: 0, str: '#CIRC!' };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(key);

  const body = raw.trim().slice(1).trim();
  if (!body) {
    return { kind: 'error', num: 0, str: '#ERROR!' };
  }

  return evalExpression(body, sheet, nextVisited);
}

export function evaluateSheetCell(
  sheet: SheetTemplate,
  row: number,
  col: number
): CellEvalResult {
  const raw = sheet.cells[makeCellKey(row, col)]?.value ?? '';
  if (!isFormulaValue(raw)) {
    const num = parseNumericValue(raw);
    const dur = parseDurationMinutes(raw);
    return {
      display: raw,
      numericValue: num,
      isFormula: false,
      isError: false,
      isDuration: dur !== null,
    };
  }

  const res = evaluateCellInternal(sheet, row, col, new Set<string>());
  return {
    display: res.str,
    numericValue: res.kind === 'number' ? res.num : null,
    isFormula: true,
    isError: res.kind === 'error',
    isDuration: res.kind === 'duration',
  };
}

export function getSheetCellDisplayValue(
  sheet: SheetTemplate,
  row: number,
  col: number
): string {
  return evaluateSheetCell(sheet, row, col).display;
}

/**
 * Rewrite cell references inside a formula outside string literals.
 */
function rewriteFormulaReferences(
  formula: string,
  replacer: (token: string, isRange: boolean) => string
): string {
  if (!isFormulaValue(formula)) return formula;
  let out = '';
  let inQuotes = false;
  let segment = '';

  const refOrRangePattern =
    /(\$?[A-Za-z]+\$?\d+\s*:\s*\$?[A-Za-z]+\$?\d+|\$?[A-Za-z]+\$?\d+)/g;

  const flushSegment = () => {
    if (!segment) return;
    out += segment.replace(refOrRangePattern, (match) => {
      return replacer(match, match.includes(':'));
    });
    segment = '';
  };

  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '"') {
      if (!inQuotes) {
        flushSegment();
        inQuotes = true;
        out += ch;
      } else if (formula[i + 1] === '"') {
        out += '""';
        i++;
      } else {
        inQuotes = false;
        out += ch;
      }
    } else if (inQuotes) {
      out += ch;
    } else {
      segment += ch;
    }
  }
  flushSegment();

  return out;
}

export function shiftFormulaOnRowInsert(formula: string, atRow: number): string {
  return rewriteFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      const [lStr, rStr] = token.split(':');
      const l = parseCellRef(lStr);
      const r = parseCellRef(rStr);
      if (!l || !r) return token;
      const nextLRow = l.row >= atRow ? l.row + 1 : l.row;
      const nextRRow = r.row >= atRow ? r.row + 1 : r.row;
      return `${formatCellRef(l.col, nextLRow, l.absCol, l.absRow)}:${formatCellRef(
        r.col,
        nextRRow,
        r.absCol,
        r.absRow
      )}`;
    }
    const ref = parseCellRef(token);
    if (!ref) return token;
    const nextRow = ref.row >= atRow ? ref.row + 1 : ref.row;
    return formatCellRef(ref.col, nextRow, ref.absCol, ref.absRow);
  });
}

export function shiftFormulaOnRowDelete(formula: string, deletedRow: number): string {
  return rewriteFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      const [lStr, rStr] = token.split(':');
      const l = parseCellRef(lStr);
      const r = parseCellRef(rStr);
      if (!l || !r) return token;
      const minR = Math.min(l.row, r.row);
      const maxR = Math.max(l.row, r.row);
      if (minR === deletedRow && maxR === deletedRow) return '#REF!';
      const nextLRow =
        l.row > deletedRow
          ? l.row - 1
          : l.row === deletedRow
          ? l.row
          : l.row;
      const nextRRow =
        r.row > deletedRow
          ? r.row - 1
          : r.row === deletedRow
          ? Math.max(0, r.row - 1)
          : r.row;
      return `${formatCellRef(l.col, nextLRow, l.absCol, l.absRow)}:${formatCellRef(
        r.col,
        nextRRow,
        r.absCol,
        r.absRow
      )}`;
    }
    const ref = parseCellRef(token);
    if (!ref) return token;
    if (ref.row === deletedRow) return '#REF!';
    const nextRow = ref.row > deletedRow ? ref.row - 1 : ref.row;
    return formatCellRef(ref.col, nextRow, ref.absCol, ref.absRow);
  });
}

export function shiftFormulaOnColInsert(formula: string, atCol: number): string {
  return rewriteFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      const [lStr, rStr] = token.split(':');
      const l = parseCellRef(lStr);
      const r = parseCellRef(rStr);
      if (!l || !r) return token;
      const nextLCol = l.col >= atCol ? l.col + 1 : l.col;
      const nextRCol = r.col >= atCol ? r.col + 1 : r.col;
      return `${formatCellRef(nextLCol, l.row, l.absCol, l.absRow)}:${formatCellRef(
        nextRCol,
        r.row,
        r.absCol,
        r.absRow
      )}`;
    }
    const ref = parseCellRef(token);
    if (!ref) return token;
    const nextCol = ref.col >= atCol ? ref.col + 1 : ref.col;
    return formatCellRef(nextCol, ref.row, ref.absCol, ref.absRow);
  });
}

export function shiftFormulaOnColDelete(formula: string, deletedCol: number): string {
  return rewriteFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      const [lStr, rStr] = token.split(':');
      const l = parseCellRef(lStr);
      const r = parseCellRef(rStr);
      if (!l || !r) return token;
      const minC = Math.min(l.col, r.col);
      const maxC = Math.max(l.col, r.col);
      if (minC === deletedCol && maxC === deletedCol) return '#REF!';
      const nextLCol = l.col > deletedCol ? l.col - 1 : l.col;
      const nextRCol =
        r.col > deletedCol
          ? r.col - 1
          : r.col === deletedCol
          ? Math.max(0, r.col - 1)
          : r.col;
      return `${formatCellRef(nextLCol, l.row, l.absCol, l.absRow)}:${formatCellRef(
        nextRCol,
        r.row,
        r.absCol,
        r.absRow
      )}`;
    }
    const ref = parseCellRef(token);
    if (!ref) return token;
    if (ref.col === deletedCol) return '#REF!';
    const nextCol = ref.col > deletedCol ? ref.col - 1 : ref.col;
    return formatCellRef(nextCol, ref.row, ref.absCol, ref.absRow);
  });
}

/**
 * Remap formula references when loop rows expand during buildLoopedSheetFromTemplate.
 */
export function remapFormulaForLoopExpansion(
  formula: string,
  outRowStart: number[],
  outRowEnd: number[],
  origRowContext?: number,
  outRowContext?: number
): string {
  return rewriteFormulaReferences(formula, (token, isRange) => {
    if (isRange) {
      const [lStr, rStr] = token.split(':');
      const l = parseCellRef(lStr);
      const r = parseCellRef(rStr);
      if (!l || !r) return token;

      const lo = Math.min(l.row, r.row);
      const hi = Math.max(l.row, r.row);
      const mappedLo = outRowStart[lo] ?? lo;
      const mappedHi = outRowEnd[hi] ?? hi;
      const nextLRow = l.row <= r.row ? mappedLo : mappedHi;
      const nextRRow = l.row <= r.row ? mappedHi : mappedLo;

      return `${formatCellRef(l.col, nextLRow, l.absCol, l.absRow)}:${formatCellRef(
        r.col,
        nextRRow,
        r.absCol,
        r.absRow
      )}`;
    }

    const ref = parseCellRef(token);
    if (!ref) return token;

    let nextRow = outRowStart[ref.row] ?? ref.row;
    if (
      origRowContext !== undefined &&
      outRowContext !== undefined &&
      ref.row === origRowContext
    ) {
      nextRow = outRowContext;
    }
    return formatCellRef(ref.col, nextRow, ref.absCol, ref.absRow);
  });
}
