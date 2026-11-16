import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateByPattern, getIndonesianDayName, getTodayIsoDate } from '../lib/formatters';
import type { DateDisplayFormat } from '../types';

interface DateMeta {
  isHoliday?: boolean;
  hasActivity?: boolean;
}

interface SingleDatePickerProps {
  value: string;
  onChange: (nextIsoDate: string) => void;
  dateFormat?: DateDisplayFormat;
  existingByDate?: Map<string, DateMeta>;
}

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

export function SingleDatePicker({
  value,
  onChange,
  dateFormat = 'dd MMMM yyyy',
  existingByDate,
}: SingleDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const initialAnchor = useMemo(() => {
    const parsed = parseIsoYearMonth(value);
    if (parsed) return parsed;
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = useState(initialAnchor.year);
  const [viewMonth, setViewMonth] = useState(initialAnchor.month);

  useEffect(() => {
    if (open) {
      setViewYear(initialAnchor.year);
      setViewMonth(initialAnchor.month);
    }
  }, [open, initialAnchor.year, initialAnchor.month]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
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
    const cells: { day: number | null; iso: string | null; isWeekend: boolean }[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ day: null, iso: null, isWeekend: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = (firstDayOfWeek + d - 1) % 7;
      cells.push({
        day: d,
        iso: toIsoDate(viewYear, viewMonth, d),
        isWeekend: dow === 0 || dow === 6,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, iso: null, isWeekend: false });
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

  const todayIso = getTodayIsoDate();
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayIso = toIsoDate(
    yesterdayObj.getFullYear(),
    yesterdayObj.getMonth(),
    yesterdayObj.getDate()
  );

  const dayName = getIndonesianDayName(value);
  const displayDate = value ? formatDateByPattern(value, dateFormat) : 'Pilih tanggal...';

  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    const years: number[] = [];
    for (let y = base - 3; y <= base + 2; y++) years.push(y);
    if (!years.includes(viewYear)) years.push(viewYear);
    return years.sort((a, b) => a - b);
  }, [viewYear]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Pilih tanggal"
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border bg-white text-left transition-colors ${
          open
            ? 'border-blue-600 ring-2 ring-blue-500/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-xs font-medium text-slate-900 font-mono tabular-nums truncate">
            {displayDate}
          </span>
        </span>

        <span className="flex items-center gap-1.5 shrink-0">
          {value && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200/80 text-[10px] font-medium text-slate-600">
              {dayName}
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
              open ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Bulan sebelumnya"
              className="p-1 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                aria-label="Pilih bulan"
                className="px-1 py-0.5 rounded border border-transparent hover:border-slate-200 bg-transparent text-[11px] font-semibold text-slate-900 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {MONTH_NAMES_ID.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                aria-label="Pilih tahun"
                className="px-1 py-0.5 rounded border border-transparent hover:border-slate-200 bg-transparent text-[11px] font-semibold text-slate-900 font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              aria-label="Bulan berikutnya"
              className="p-1 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
              {WEEKDAYS_ID.map((w, idx) => (
                <div
                  key={w}
                  className={`text-center text-[10px] font-semibold py-0.5 ${
                    idx === 0 || idx === 6 ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.day || !cell.iso) {
                  return <div key={idx} className="h-7" />;
                }

                const iso = cell.iso;
                const isSelected = value === iso;
                const isToday = iso === todayIso;
                const meta = existingByDate?.get(iso);

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={`relative h-7 w-full text-[11px] font-mono tabular-nums rounded-md transition-colors flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold shadow-sm'
                        : isToday
                        ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-300 hover:bg-blue-100'
                        : cell.isWeekend
                        ? 'text-slate-500 hover:bg-slate-100'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {meta && (meta.hasActivity || meta.isHoliday) && (
                      <span
                        className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                          isSelected
                            ? 'bg-white'
                            : meta.isHoliday
                            ? 'bg-slate-400'
                            : 'bg-blue-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(yesterdayIso);
                setOpen(false);
              }}
              className="px-2 py-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Kemarin
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
              className="px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Hari Ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
