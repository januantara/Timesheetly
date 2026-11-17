import type { ActivityEntry, ActivityFilterState } from '../types';
import { calculateDurationMinutes, getTodayIsoDate } from './formatters';
import { getActiveLanguage, pickLang } from './i18n';

export interface PromptBuilderOptions {
  accountName: string;
  filter: ActivityFilterState;
  savedCustomKeys: string[];
}

export interface ParsedActivityImportResult {
  entries: ActivityEntry[];
  skippedCount: number;
  warnings: string[];
}

export function buildActivityExtractionPrompt({
  filter,
}: PromptBuilderOptions): string {
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let periodInstruction = `the current month (${currentYm}) or the latest pushed history`;
  if (filter.datePreset === 'kustom') {
    if (filter.startDate && filter.endDate) {
      periodInstruction = `the date range ${filter.startDate} to ${filter.endDate}`;
    } else if (filter.startDate) {
      periodInstruction = `from ${filter.startDate} to ${getTodayIsoDate()}`;
    } else if (filter.endDate) {
      periodInstruction = `up to ${filter.endDate}`;
    }
  }

  return `Scan all project folders inside the current root folder and extract daily work activities for ${periodInstruction}.

Instructions for each project folder in the root directory:
1. Detect my Git username and email directly from Git (\`git config user.name\` and \`git config user.email\` in each repository, falling back to \`git config --global user.name\` / \`git config --global user.email\`).
2. Inspect ONLY commits that have already been pushed to the remote repository AND were authored/pushed by that Git username/email (e.g., \`git log --remotes --author="$(git config user.name)" --date=short --pretty=format:"%ad | %s"\` or matching \`git config user.email\`).
3. Strictly EXCLUDE commits made by other authors/teammates and exclude unpushed local-only commits.
4. Group my pushed commits by date (\`YYYY-MM-DD\`) across the project folders and summarize the actual work completed into concise bullet points (\`• \`) separated by \`\\n\` in the \`activity\` field.
5. Output ONLY the \`date\` and \`activity\` fields. Do not include time, project code, or other extra fields.

OUTPUT RULES (STRICT):
- Return ONLY valid JSON (no extra commentary or markdown prose outside the JSON block) so it can be directly imported into Timesheetly.
- Follow this exact structure:

\`\`\`json
{
  "activities": [
    {
      "date": "${getTodayIsoDate()}",
      "activity": "• Implemented feature X in project folder A\\n• Fixed issue Y in project folder B"
    }
  ]
}
\`\`\``;
}

function normalizeDateString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // ISO datetime or YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return isValidYmd(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : '';
  }

  // YYYY/MM/DD
  const slashYmd = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashYmd) {
    const y = slashYmd[1];
    const m = slashYmd[2].padStart(2, '0');
    const d = slashYmd[3].padStart(2, '0');
    return isValidYmd(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : '';
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return isValidYmd(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : '';
  }

  return '';
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

function normalizeTimeString(raw: unknown): string {
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

function extractTimePair(rec: Record<string, unknown>): {
  startTime: string;
  endTime: string;
} {
  let start = normalizeTimeString(
    rec.startTime ?? rec.start_time ?? rec.jamMulai ?? rec.jam_mulai
  );
  let end = normalizeTimeString(
    rec.endTime ?? rec.end_time ?? rec.jamSelesai ?? rec.jam_selesai
  );

  const rangeRaw = rec.timeRange ?? rec.time_range ?? rec.jam;
  if ((!start || !end) && typeof rangeRaw === 'string') {
    const parts = rangeRaw.split(/\s*(?:-|–|s\/d|to)\s*/i);
    if (parts.length >= 2) {
      if (!start) start = normalizeTimeString(parts[0]);
      if (!end) end = normalizeTimeString(parts[1]);
    }
  }

  return {
    startTime: start,
    endTime: end,
  };
}

function extractActivityText(rec: Record<string, unknown>): string {
  const raw =
    rec.activity ??
    rec.aktivitas ??
    rec.deskripsi ??
    rec.description ??
    rec.kegiatan ??
    rec.tasks;

  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    const lines = raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    if (lines.length === 0) return '';
    if (lines.length === 1) return lines[0];
    return lines
      .map((line) => (/^(?:•|-|\d+\.)\s+/.test(line) ? line : `• ${line}`))
      .join('\n');
  }
  return '';
}

function extractJsonCandidate(rawText: string): unknown {
  const lang = getActiveLanguage();
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error(
      pickLang(lang, 'JSON text or file is empty.', 'Teks atau file JSON masih kosong.')
    );
  }

  // 1. Try fenced code block ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through to other strategies
    }
  }

  // 2. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  // 3. Slice from first { or [ to matching last } or ]
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  const startIdx =
    firstObj === -1
      ? firstArr
      : firstArr === -1
      ? firstObj
      : Math.min(firstObj, firstArr);

  if (startIdx >= 0) {
    const openChar = trimmed[startIdx];
    const closeChar = openChar === '{' ? '}' : ']';
    const endIdx = trimmed.lastIndexOf(closeChar);
    if (endIdx > startIdx) {
      const candidate = trimmed.slice(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // fall through
      }
    }
  }

  throw new Error(
    pickLang(
      lang,
      'Unrecognized JSON format. Make sure the prompt output is valid JSON.',
      'Format JSON tidak dikenali. Pastikan output prompt berupa JSON yang valid.'
    )
  );
}

function getStringField(rec: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

export function parseImportedActivitiesText(
  rawText: string,
  accountName: string
): ParsedActivityImportResult {
  const lang = getActiveLanguage();
  const parsed = extractJsonCandidate(rawText);

  let rawItems: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.activities)) {
      rawItems = obj.activities;
    } else if (Array.isArray(obj.items)) {
      rawItems = obj.items;
    } else if (Array.isArray(obj.data)) {
      rawItems = obj.data;
    } else if (obj.date || obj.tanggal || obj.activity || obj.aktivitas) {
      rawItems = [obj];
    }
  }

  if (rawItems.length === 0) {
    throw new Error(
      pickLang(
        lang,
        'No "activities" list found in the JSON.',
        'Daftar "activities" tidak ditemukan di dalam JSON.'
      )
    );
  }

  const nowIso = new Date().toISOString();
  const ownerPic = accountName.trim() || pickLang(lang, 'My Account', 'Akun Saya');
  const entries: ActivityEntry[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  rawItems.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      skippedCount++;
      warnings.push(
        pickLang(
          lang,
          `Row #${idx + 1} is not a valid JSON object.`,
          `Baris #${idx + 1} bukan objek JSON yang valid.`
        )
      );
      return;
    }
    const rec = item as Record<string, unknown>;
    const date = normalizeDateString(rec.date ?? rec.tanggal);
    const activityText = extractActivityText(rec);

    if (!date) {
      skippedCount++;
      warnings.push(
        pickLang(
          lang,
          `Row #${idx + 1} skipped due to invalid or missing date.`,
          `Baris #${idx + 1} dilewati karena tanggal tidak valid atau kosong.`
        )
      );
      return;
    }
    if (!activityText) {
      skippedCount++;
      warnings.push(
        pickLang(
          lang,
          `Row #${idx + 1} (${date}) skipped because activity text is empty.`,
          `Baris #${idx + 1} (${date}) dilewati karena teks aktivitas kosong.`
        )
      );
      return;
    }

    const { startTime, endTime } = extractTimePair(rec);
    const durationMinutes =
      startTime && endTime ? calculateDurationMinutes(startTime, endTime) : 0;

    const projectName = getStringField(rec, [
      'projectName',
      'project_name',
      'project',
      'folder',
      'namaProject',
    ]);
    const projectCode = getStringField(rec, [
      'projectCode',
      'project_code',
      'category',
      'kodeProject',
    ]);
    const impactedApp = getStringField(rec, [
      'aplikasiBerdampak',
      'aplikasi_berdampak',
      'impactedApp',
      'status',
    ]);

    const customValues: Record<string, string> = {};
    const rawCustom = rec.customValues ?? rec.custom_values ?? rec.details;
    if (rawCustom && typeof rawCustom === 'object' && !Array.isArray(rawCustom)) {
      for (const [k, v] of Object.entries(rawCustom as Record<string, unknown>)) {
        if (k.trim() && v !== null && v !== undefined) {
          const strVal = String(v).trim();
          if (strVal) {
            customValues[k.trim()] = strVal;
          }
        }
      }
    }

    entries.push({
      id: `act-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      startTime,
      endTime,
      durationMinutes,
      project: projectName,
      category: projectCode,
      activity: activityText,
      remark: activityText,
      status: impactedApp,
      pic: ownerPic,
      customValues,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  if (entries.length === 0) {
    throw new Error(
      warnings[0] ||
        pickLang(
          lang,
          'No valid activity rows found to import. Ensure each item has "date" (YYYY-MM-DD) and "activity".',
          'Tidak ada baris aktivitas valid yang dapat diimpor. Pastikan tiap item memiliki "date" (YYYY-MM-DD) dan "activity".'
        )
    );
  }

  return { entries, skippedCount, warnings };
}
