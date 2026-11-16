import type { ActivityEntry } from '../types';
import { calculateDurationMinutes } from './formatters';

export const HOLIDAY_ROW_COLOR = '#A6A6A6';

export interface DigiHcParsedRecord {
  attAbsenId?: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  attAbsenFlag: string;
  isHoliday: boolean;
  rowColor?: string;
  empName?: string;
}

export interface DigiHcParseResult {
  records: DigiHcParsedRecord[];
  skippedCount: number;
  warnings: string[];
  holidayCount: number;
  workDayCount: number;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function toJakartaDate(epochMs: number): Date {
  // Shift epoch by UTC+7 so getUTC* reads Asia/Jakarta wall-clock regardless of browser TZ
  return new Date(epochMs + 7 * 3600 * 1000);
}

function parseDigiHcDate(rec: Record<string, unknown>): string {
  const periodeHari = rec.periodeHari ?? rec.date ?? rec.tanggal;
  if (typeof periodeHari === 'string' && periodeHari.trim()) {
    const trimmed = periodeHari.trim();
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const d = dmy[1].padStart(2, '0');
      const m = dmy[2].padStart(2, '0');
      const y = dmy[3];
      if (isValidYmd(Number(y), Number(m), Number(d))) {
        return `${y}-${m}-${d}`;
      }
    }
    const ymd = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (ymd) {
      const y = ymd[1];
      const m = ymd[2].padStart(2, '0');
      const d = ymd[3].padStart(2, '0');
      if (isValidYmd(Number(y), Number(m), Number(d))) {
        return `${y}-${m}-${d}`;
      }
    }
  }

  const rawMs = rec.attAbsenDate ?? rec.attAbsenRealCheckIn;
  if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs > 0) {
    const jkt = toJakartaDate(rawMs);
    const y = jkt.getUTCFullYear();
    const m = String(jkt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(jkt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

function normalizeHhMm(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function epochMsToHhMm(rawMs: unknown): string {
  if (typeof rawMs !== 'number' || !Number.isFinite(rawMs) || rawMs <= 0) {
    return '';
  }
  const jkt = toJakartaDate(rawMs);
  const h = String(jkt.getUTCHours()).padStart(2, '0');
  const m = String(jkt.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function extractJsonArrayCandidate(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Respons JSON DigiHC masih kosong.');
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const firstArr = trimmed.indexOf('[');
  const firstObj = trimmed.indexOf('{');
  const startIdx =
    firstArr === -1
      ? firstObj
      : firstObj === -1
      ? firstArr
      : Math.min(firstArr, firstObj);

  if (startIdx >= 0) {
    const openChar = trimmed[startIdx];
    const closeChar = openChar === '[' ? ']' : '}';
    const endIdx = trimmed.lastIndexOf(closeChar);
    if (endIdx > startIdx) {
      try {
        return JSON.parse(trimmed.slice(startIdx, endIdx + 1));
      } catch {
        // fall through
      }
    }
  }

  throw new Error(
    'Format JSON DigiHC tidak valid. Tempelkan array JSON response dari DigiHC.'
  );
}

export function parseDigiHcAttendanceText(rawText: string): DigiHcParseResult {
  const parsed = extractJsonArrayCandidate(rawText);

  let rawItems: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.data)) rawItems = obj.data;
    else if (Array.isArray(obj.result)) rawItems = obj.result;
    else if (Array.isArray(obj.items)) rawItems = obj.items;
    else if (obj.periodeHari || obj.attAbsenDate || obj.attAbsenFlag) {
      rawItems = [obj];
    }
  }

  if (rawItems.length === 0) {
    throw new Error('Tidak ditemukan daftar absensi pada JSON DigiHC tersebut.');
  }

  const byDate = new Map<string, DigiHcParsedRecord>();
  const warnings: string[] = [];
  let skippedCount = 0;

  rawItems.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      skippedCount++;
      warnings.push(`Baris #${idx + 1} bukan objek JSON yang valid.`);
      return;
    }

    const rec = item as Record<string, unknown>;
    const date = parseDigiHcDate(rec);
    if (!date) {
      skippedCount++;
      warnings.push(`Baris #${idx + 1} dilewati karena tanggal tidak valid.`);
      return;
    }

    const flagRaw =
      typeof rec.attAbsenFlag === 'string' ? rec.attAbsenFlag.trim().toUpperCase() : '';
    const isHoliday = flagRaw === 'LIB';

    let startTime = '';
    let endTime = '';

    if (isHoliday) {
      startTime = '08:00';
      endTime = '17:00';
    } else {
      startTime =
        normalizeHhMm(rec.jamCheckIn) || epochMsToHhMm(rec.attAbsenRealCheckIn);
      endTime =
        normalizeHhMm(rec.jamCheckOut) || epochMsToHhMm(rec.attAbsenRealCheckOut);
    }

    const durationMinutes =
      startTime && endTime ? calculateDurationMinutes(startTime, endTime) : 0;

    byDate.set(date, {
      attAbsenId: typeof rec.attAbsenId === 'number' ? rec.attAbsenId : undefined,
      date,
      startTime,
      endTime,
      durationMinutes,
      attAbsenFlag: flagRaw || 'H',
      isHoliday,
      rowColor: isHoliday ? HOLIDAY_ROW_COLOR : undefined,
      empName: typeof rec.empName === 'string' ? rec.empName.trim() : undefined,
    });
  });

  const records = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  if (records.length === 0) {
    throw new Error(
      warnings[0] ||
        'Tidak ada record absensi DigiHC yang valid (pastikan terdapat periodeHari / attAbsenDate).'
    );
  }

  const holidayCount = records.filter((r) => r.isHoliday).length;
  const workDayCount = records.length - holidayCount;

  return {
    records,
    skippedCount,
    warnings,
    holidayCount,
    workDayCount,
  };
}

function combineDistinctText(a: string, b: string): string {
  const ta = a.trim();
  const tb = b.trim();
  if (!ta) return tb;
  if (!tb) return ta;
  if (ta.toLowerCase() === tb.toLowerCase()) return ta;
  const existingParts = ta.split(',').map((s) => s.trim().toLowerCase());
  const nextParts = tb.split(',').map((s) => s.trim());
  const additions = nextParts.filter(
    (p) => p && !existingParts.includes(p.toLowerCase())
  );
  return additions.length > 0 ? `${ta}, ${additions.join(', ')}` : ta;
}

function mergeActivityBody(existingText: string, incomingText: string): string {
  const a = existingText.trim();
  const b = incomingText.trim();
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;

  const existingLines = a.split('\n').map((l) => l.trim()).filter(Boolean);
  const existingNorm = new Set(existingLines.map((l) => l.toLowerCase()));
  const incomingLines = b.split('\n').map((l) => l.trim()).filter(Boolean);
  const newLines = incomingLines.filter((l) => !existingNorm.has(l.toLowerCase()));

  if (newLines.length === 0) return a;
  return `${a}\n${newLines.join('\n')}`;
}

export function mergeActivityEntries(
  existing: ActivityEntry,
  incoming: ActivityEntry
): ActivityEntry {
  const nowIso = new Date().toISOString();
  const isHoliday = Boolean(existing.isHoliday || incoming.isHoliday);
  const rowColor =
    existing.rowColor ||
    incoming.rowColor ||
    (isHoliday ? HOLIDAY_ROW_COLOR : undefined);

  let startTime = existing.startTime;
  let endTime = existing.endTime;

  if (isHoliday) {
    startTime = existing.startTime || incoming.startTime || '08:00';
    endTime = existing.endTime || incoming.endTime || '17:00';
  } else {
    if (existing.startTime && incoming.startTime) {
      startTime =
        existing.startTime <= incoming.startTime
          ? existing.startTime
          : incoming.startTime;
    } else {
      startTime = existing.startTime || incoming.startTime;
    }

    if (existing.endTime && incoming.endTime) {
      endTime =
        existing.endTime >= incoming.endTime ? existing.endTime : incoming.endTime;
    } else {
      endTime = existing.endTime || incoming.endTime;
    }
  }

  const durationMinutes =
    startTime && endTime ? calculateDurationMinutes(startTime, endTime) : 0;

  const mergedActivity = mergeActivityBody(existing.activity, incoming.activity);
  const mergedCustomValues: Record<string, string> = {
    ...(existing.customValues ?? {}),
  };
  for (const [k, v] of Object.entries(incoming.customValues ?? {})) {
    if (k.trim() && v.trim()) {
      mergedCustomValues[k.trim()] = v.trim();
    }
  }

  return {
    ...existing,
    startTime,
    endTime,
    durationMinutes,
    project: combineDistinctText(existing.project, incoming.project),
    category: combineDistinctText(existing.category, incoming.category),
    activity: mergedActivity,
    remark: mergedActivity,
    status: combineDistinctText(existing.status, incoming.status),
    activityFormat: existing.activityFormat ?? incoming.activityFormat,
    isHoliday: isHoliday || undefined,
    rowColor,
    attAbsenFlag: incoming.attAbsenFlag || existing.attAbsenFlag,
    customValues: mergedCustomValues,
    updatedAt: nowIso,
  };
}
