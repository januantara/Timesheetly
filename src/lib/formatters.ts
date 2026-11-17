import type {
  ActivityEntry,
  ActivityFilterState,
  ActivityStatus,
  AppLanguage,
  ColumnConfig,
  DateDisplayFormat,
  TimeDisplayFormat,
} from '../types';

export function calculateDurationMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
    return 0;
  }
  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  if (endTotal < startTotal) {
    // Handle overnight shift crossing midnight
    return 24 * 60 - startTotal + endTotal;
  }
  return endTotal - startTotal;
}

export function formatDurationHHMM(minutes: number): string {
  if (!minutes || minutes <= 0) return '00:00';
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatDurationShort(minutes: number): string {
  return formatDurationHHMM(minutes);
}

export function formatDurationDecimalHours(minutes: number): string {
  return formatDurationHHMM(minutes);
}

export function formatStatusLabel(status: ActivityStatus): string {
  const trimmed = (status ?? '').trim();
  return trimmed || '-';
}

const MONTHS_SHORT_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_FULL_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DATE_FORMAT_OPTIONS: {
  value: DateDisplayFormat;
  label: string;
  example: string;
}[] = [
  { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD', example: '2026-11-15' },
  { value: 'dd/mm/yyyy', label: 'DD/MM/YYYY', example: '15/11/2026' },
  { value: 'dd-mm-yyyy', label: 'DD-MM-YYYY', example: '15-11-2026' },
  { value: 'mm/dd/yyyy', label: 'MM/DD/YYYY', example: '11/15/2026' },
  { value: 'dd MMM yyyy', label: 'DD MMM YYYY', example: '15 Nov 2026' },
  { value: 'dd MMMM yyyy', label: 'DD MMMM YYYY', example: '15 November 2026' },
];

export const TIME_FORMAT_OPTIONS: {
  value: TimeDisplayFormat;
  label: string;
  example: string;
}[] = [
  { value: 'HH:mm', label: '24-Hour (HH:mm)', example: '14:30' },
  { value: 'HH.mm', label: '24-Hour (HH.mm)', example: '14.30' },
  { value: 'hh:mm A', label: '12-Hour (AM/PM)', example: '02:30 PM' },
];

export function getTimeFormatOptions(lang: AppLanguage = 'en'): {
  value: TimeDisplayFormat;
  label: string;
  example: string;
}[] {
  if (lang === 'id') {
    return [
      { value: 'HH:mm', label: '24 Jam (HH:mm)', example: '14:30' },
      { value: 'HH.mm', label: '24 Jam (HH.mm)', example: '14.30' },
      { value: 'hh:mm A', label: '12 Jam (AM/PM)', example: '02:30 PM' },
    ];
  }
  return TIME_FORMAT_OPTIONS;
}

export function formatDateIndonesian(dateStr: string): string {
  return formatDateByPattern(dateStr, 'dd MMM yyyy');
}

export function formatDateByPattern(
  dateStr: string,
  format: DateDisplayFormat = 'yyyy-mm-dd'
): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const monthIdx = Number(m) - 1;
  const shortMonth = MONTHS_SHORT_EN[monthIdx] ?? m;
  const fullMonth = MONTHS_FULL_EN[monthIdx] ?? m;

  switch (format) {
    case 'dd/mm/yyyy':
      return `${d}/${m}/${y}`;
    case 'dd-mm-yyyy':
      return `${d}-${m}-${y}`;
    case 'mm/dd/yyyy':
      return `${m}/${d}/${y}`;
    case 'dd MMM yyyy':
      return `${d} ${shortMonth} ${y}`;
    case 'dd MMMM yyyy':
      return `${d} ${fullMonth} ${y}`;
    case 'yyyy-mm-dd':
    default:
      return `${y}-${m}-${d}`;
  }
}

export function formatTimeByPattern(
  hhmm: string,
  format: TimeDisplayFormat = 'HH:mm'
): string {
  if (!hhmm || !hhmm.trim()) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');

  switch (format) {
    case 'HH.mm':
      return `${hh}.${mm}`;
    case 'hh:mm A': {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${String(h12).padStart(2, '0')}:${mm} ${period}`;
    }
    case 'HH:mm':
    default:
      return `${hh}:${mm}`;
  }
}

export function formatTimeRangeByPattern(
  startTime: string,
  endTime: string,
  format: TimeDisplayFormat = 'HH:mm'
): string {
  const start = formatTimeByPattern(startTime, format);
  const end = formatTimeByPattern(endTime, format);
  if (!start && !end) return '';
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

export function getIndonesianDayName(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '-';
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[dateObj.getDay()] ?? '-';
}

export function getEnglishDayName(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '-';
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dateObj.getDay()] ?? '-';
}

export function getDayNameByLanguage(dateStr: string, lang: AppLanguage = 'en'): string {
  return lang === 'id' ? getIndonesianDayName(dateStr) : getEnglishDayName(dateStr);
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeCustomKeySlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function lookupCustomValue(
  customValues: Record<string, string> | undefined,
  key: string
): string {
  if (!customValues) return '';
  const trimmedKey = key.trim();
  if (!trimmedKey) return '';
  if (customValues[trimmedKey] !== undefined) {
    return customValues[trimmedKey].trim();
  }
  const lowerKey = trimmedKey.toLowerCase();
  const slugKey = normalizeCustomKeySlug(trimmedKey);
  for (const [k, v] of Object.entries(customValues)) {
    const kTrim = k.trim();
    if (kTrim.toLowerCase() === lowerKey) {
      return v.trim();
    }
    if (slugKey && normalizeCustomKeySlug(kTrim) === slugKey) {
      return v.trim();
    }
  }
  return '';
}

export function resolveColumnValue(
  column: ColumnConfig,
  entry: ActivityEntry,
  rowIndex: number,
  dateFormat: DateDisplayFormat = 'yyyy-mm-dd',
  timeFormat: TimeDisplayFormat = 'HH:mm'
): string {
  switch (column.sourceType) {
    case 'auto_index':
      return String(rowIndex + 1);
    case 'static_text':
      return column.staticValue ?? '';
    case 'custom':
      return lookupCustomValue(entry.customValues, column.sourceKey) || '-';
    case 'field': {
      switch (column.sourceKey) {
        case 'date':
          return formatDateByPattern(entry.date, dateFormat);
        case 'day':
          return getIndonesianDayName(entry.date);
        case 'timeRange':
          return formatTimeRangeByPattern(entry.startTime, entry.endTime, timeFormat);
        case 'startTime':
          return formatTimeByPattern(entry.startTime, timeFormat);
        case 'endTime':
          return formatTimeByPattern(entry.endTime, timeFormat);
        case 'duration':
          return formatDurationDecimalHours(entry.durationMinutes);
        case 'project':
          return entry.project || '-';
        case 'category':
          return entry.category || '-';
        case 'activity':
          return entry.activity;
        case 'remark':
          return entry.remark?.trim() || entry.activity;
        case 'status':
          return formatStatusLabel(entry.status);
        case 'pic':
          return entry.pic;
        default:
          return '';
      }
    }
  }
}

export function filterActivities(
  activities: ActivityEntry[],
  filter: ActivityFilterState,
  activeAccountName = '',
  dateFormat: DateDisplayFormat = 'yyyy-mm-dd',
  timeFormat: TimeDisplayFormat = 'HH:mm',
  options?: { includeEmptyHolidays?: boolean }
): ActivityEntry[] {
  const now = new Date();
  const includeEmptyHolidays = Boolean(options?.includeEmptyHolidays);

  let startBound = '';
  let endBound = '';

  if (filter.datePreset === 'bulan_ini') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    startBound = `${y}-${m}-01`;
    endBound = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  } else if (filter.datePreset === 'kustom') {
    startBound = filter.startDate;
    endBound = filter.endDate;
  }

  const query = filter.search.trim().toLowerCase();
  const normalizedAccount = activeAccountName.trim().toLowerCase();

  return activities.filter((item) => {
    // User lain tidak boleh melihat aktivitas user lainnya
    if (normalizedAccount) {
      if (item.pic.trim().toLowerCase() !== normalizedAccount) {
        return false;
      }
    }

    if (!includeEmptyHolidays && item.isHoliday && !item.activity.trim()) {
      return false;
    }

    if (startBound && item.date < startBound) {
      return false;
    }

    if (endBound && item.date > endBound) {
      return false;
    }

    if (query) {
      const dayNameId = getIndonesianDayName(item.date);
      const dayNameEn = getEnglishDayName(item.date);
      const customText = Object.values(item.customValues ?? {}).join(' ');
      const haystack = [
        item.date,
        formatDateByPattern(item.date, dateFormat),
        dayNameId,
        dayNameEn,
        item.startTime,
        item.endTime,
        formatTimeRangeByPattern(item.startTime, item.endTime, timeFormat),
        item.project,
        item.category,
        item.activity,
        item.remark,
        item.pic,
        formatStatusLabel(item.status),
        customText,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'activity-report';
}

const ENGLISH_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function sanitizeExportFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\.(xlsx|xls|pdf|html?)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '');
  return cleaned || 'Timesheet';
}

export function buildDefaultTimesheetFilename(
  accountName: string,
  activities: Pick<ActivityEntry, 'date'>[] = []
): string {
  const safeName =
    accountName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/^[_.-]+|[_.-]+$/g, '') || 'User';

  const validDates = activities
    .map((a) => a.date?.trim())
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();

  let monthIdx: number;
  let year: number;

  if (validDates.length > 0) {
    const latest = validDates[validDates.length - 1];
    const [yStr, mStr] = latest.split('-');
    const parsedYear = Number(yStr);
    const parsedMonth = Number(mStr) - 1;
    if (
      !Number.isNaN(parsedYear) &&
      !Number.isNaN(parsedMonth) &&
      parsedMonth >= 0 &&
      parsedMonth <= 11
    ) {
      year = parsedYear;
      monthIdx = parsedMonth;
    } else {
      const now = new Date();
      year = now.getFullYear();
      monthIdx = now.getMonth();
    }
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIdx = now.getMonth();
  }

  const monthName = ENGLISH_MONTH_NAMES[monthIdx] ?? 'January';
  return `Timesheet_${safeName}_${monthName}-${year}`;
}
