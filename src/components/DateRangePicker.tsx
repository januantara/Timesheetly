import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDateByPattern } from '../lib/formatters';
import { useLanguage } from '../lib/i18n';
import type { DateDisplayFormat } from '../types';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  dateFormat: DateDisplayFormat;
  onChange: (startDate: string, endDate: string) => void;
}

const MONTH_NAMES_EN = [
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

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function toIsoDate(year: number, monthZeroIdx: number, day: number): string {
  const m = String(monthZeroIdx + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseIsoYearMonth(iso: string): { year: number; month: number } | null {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { year: parts[0], month: parts[1] - 1 };
}

export function DateRangePicker({
  startDate,
  endDate,
  dateFormat,
  onChange,
}: DateRangePickerProps) {
  const { lang, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const monthNames = lang === 'id' ? MONTH_NAMES_ID : MONTH_NAMES_EN;
  const weekdays = lang === 'id' ? WEEKDAYS_ID : WEEKDAYS_EN;

  const initialAnchor = useMemo(() => {
    const parsed = parseIsoYearMonth(startDate || endDate);
    if (parsed) return parsed;
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [startDate, endDate]);

  const [viewYear, setViewYear] = useState(initialAnchor.year);
  const [viewMonth, setViewMonth] = useState(initialAnchor.month);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setViewYear(initialAnchor.year);
      setViewMonth(initialAnchor.month);
      setPendingStart(null);
      setHoverDate(null);
    }
  }, [open, initialAnchor.year, initialAnchor.month]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setPendingStart(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPendingStart(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: { day: number | null; iso: string | null }[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ day: null, iso: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toIsoDate(viewYear, viewMonth, d) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, iso: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (iso: string) => {
    if (!pendingStart) {
      setPendingStart(iso);
      setHoverDate(iso);
    } else {
      const [s, e] = pendingStart <= iso ? [pendingStart, iso] : [iso, pendingStart];
      onChange(s, e);
      setPendingStart(null);
      setHoverDate(null);
      setOpen(false);
    }
  };

  const previewRange = useMemo(() => {
    if (pendingStart) {
      const target = hoverDate || pendingStart;
      return pendingStart <= target
        ? { start: pendingStart, end: target }
        : { start: target, end: pendingStart };
    }
    if (startDate || endDate) {
      return { start: startDate || endDate, end: endDate || startDate };
    }
    return { start: '', end: '' };
  }, [pendingStart, hoverDate, startDate, endDate]);

  const displayText = useMemo(() => {
    if (!startDate && !endDate) return '';
    if (startDate && endDate) {
      if (startDate === endDate) {
        return formatDateByPattern(startDate, dateFormat);
      }
      return `${formatDateByPattern(startDate, dateFormat)} – ${formatDateByPattern(
        endDate,
        dateFormat
      )}`;
    }
    if (startDate) return `${t('From', 'Dari')} ${formatDateByPattern(startDate, dateFormat)}`;
    return `${t('Until', 'Sampai')} ${formatDateByPattern(endDate, dateFormat)}`;
  }, [startDate, endDate, dateFormat, t]);

  const applyQuickRange = (kind: '7days' | 'month' | 'clear') => {
    if (kind === 'clear') {
      onChange('', '');
      setPendingStart(null);
      setOpen(false);
      return;
    }
    const now = new Date();
    if (kind === '7days') {
      const startObj = new Date(now);
      startObj.setDate(now.getDate() - 6);
      onChange(
        toIsoDate(startObj.getFullYear(), startObj.getMonth(), startObj.getDate()),
        toIsoDate(now.getFullYear(), now.getMonth(), now.getDate())
      );
    } else {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      onChange(
        toIsoDate(now.getFullYear(), now.getMonth(), 1),
        toIsoDate(now.getFullYear(), now.getMonth(), lastDay)
      );
    }
    setPendingStart(null);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-label={t('Select date range', 'Pilih rentang tanggal')}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 min-w-[230px] px-3 py-1.5 rounded-lg border bg-white text-xs cursor-pointer transition-colors ${
          open
            ? 'border-blue-600 ring-2 ring-blue-500/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span
          className={`flex-1 font-mono tabular-nums truncate ${
            displayText ? 'text-slate-900 font-medium' : 'text-slate-400 font-sans'
          }`}
        >
          {displayText || t('Select date range...', 'Pilih rentang tanggal...')}
        </span>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('', '');
              setPendingStart(null);
            }}
            aria-label={t('Clear date range', 'Hapus rentang tanggal')}
            title={t('Clear date range', 'Hapus rentang tanggal')}
            className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              aria-label={t('Previous month', 'Bulan sebelumnya')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-display text-xs font-semibold text-slate-900">
              {monthNames[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label={t('Next month', 'Bulan berikutnya')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="text-[11px] text-center text-slate-500">
            {pendingStart
              ? t(
                  `Select end date (start ${formatDateByPattern(pendingStart, dateFormat)})`,
                  `Pilih tanggal selesai (mulai ${formatDateByPattern(pendingStart, dateFormat)})`
                )
              : t('Click start date then end date', 'Klik tanggal mulai lalu tanggal selesai')}
          </div>

          <div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {weekdays.map((w) => (
                <div
                  key={w}
                  className="text-center text-[10px] font-semibold text-slate-400 py-1"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.day || !cell.iso) {
                  return <div key={idx} className="h-8" />;
                }

                const iso = cell.iso;
                const isStart = previewRange.start === iso;
                const isEnd = previewRange.end === iso;
                const inRange =
                  Boolean(previewRange.start && previewRange.end) &&
                  iso > previewRange.start &&
                  iso < previewRange.end;

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => handleDayClick(iso)}
                    onMouseEnter={() => {
                      if (pendingStart) setHoverDate(iso);
                    }}
                    className={`h-8 w-full text-xs font-mono tabular-nums rounded-md transition-colors ${
                      isStart || isEnd
                        ? 'bg-blue-600 text-white font-semibold'
                        : inRange
                        ? 'bg-blue-50 text-blue-800 font-medium'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyQuickRange('7days')}
                className="px-2 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('7 Days', '7 Hari')}
              </button>
              <button
                type="button"
                onClick={() => applyQuickRange('month')}
                className="px-2 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('This Month', 'Bulan Ini')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => applyQuickRange('clear')}
              className="px-2 py-1 rounded text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              {t('All', 'Semua')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
