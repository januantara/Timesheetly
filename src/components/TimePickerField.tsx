import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';

interface TimePickerFieldProps {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  ariaLabel?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parseHhMm(val: string): { hh: string; mm: string } {
  const match = val.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return { hh: '08', mm: '00' };
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return {
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
  };
}

function normalizeTypedTime(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (/^\d{4}$/.test(digitsOnly)) {
    const h = Number(digitsOnly.slice(0, 2));
    const m = Number(digitsOnly.slice(2, 4));
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  const colonMatch = trimmed.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    const m = Number(colonMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

export function TimePickerField({
  label,
  value,
  onChange,
  ariaLabel,
}: TimePickerFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const { hh, mm } = parseHhMm(value);
    if (hourListRef.current) {
      const activeHour = hourListRef.current.querySelector(
        `[data-hour="${hh}"]`
      ) as HTMLElement | null;
      if (activeHour) {
        activeHour.scrollIntoView({ block: 'center' });
      }
    }
    if (minuteListRef.current) {
      const activeMinute = minuteListRef.current.querySelector(
        `[data-minute="${mm}"]`
      ) as HTMLElement | null;
      if (activeMinute) {
        activeMinute.scrollIntoView({ block: 'center' });
      }
    }
  }, [open, value]);

  const { hh: selectedHour, mm: selectedMinute } = parseHhMm(value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);
    if (/^\d{2}:\d{2}$/.test(next)) {
      const normalized = normalizeTypedTime(next);
      if (normalized !== null) {
        onChange(normalized);
      }
    } else if (next === '') {
      onChange('');
    }
  };

  const handleInputBlur = () => {
    const normalized = normalizeTypedTime(draft);
    if (normalized !== null) {
      setDraft(normalized);
      if (normalized !== value) {
        onChange(normalized);
      }
    } else {
      setDraft(value);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div
        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-white transition-colors ${
          open
            ? 'border-blue-600 ring-2 ring-blue-500/20'
            : 'border-slate-200 hover:border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/20'
        }`}
      >
        <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-[11px] font-medium text-slate-400 shrink-0 select-none">
          {label}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onFocus={() => setOpen(true)}
          placeholder="08:00"
          maxLength={5}
          aria-label={ariaLabel ?? label}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium font-mono tabular-nums text-slate-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Pilih ${label.toLowerCase()}`}
          aria-expanded={open}
          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              open ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-slate-200 bg-white shadow-xl p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1.5 pb-1 text-center">
                Jam
              </div>
              <div
                ref={hourListRef}
                className="max-h-48 overflow-y-auto space-y-0.5 pr-1"
              >
                {HOURS.map((h) => {
                  const active = Boolean(value) && selectedHour === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-hour={h}
                      onClick={() => {
                        const nextVal = `${h}:${value ? selectedMinute : '00'}`;
                        setDraft(nextVal);
                        onChange(nextVal);
                      }}
                      className={`w-full px-1.5 py-1 rounded-md text-[11px] font-mono tabular-nums text-center transition-colors ${
                        active
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-l border-slate-100 pl-1.5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1.5 pb-1 text-center">
                Menit
              </div>
              <div
                ref={minuteListRef}
                className="max-h-48 overflow-y-auto space-y-0.5 pr-1"
              >
                {MINUTES.map((m) => {
                  const active = Boolean(value) && selectedMinute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-minute={m}
                      onClick={() => {
                        const nextVal = `${value ? selectedHour : '08'}:${m}`;
                        setDraft(nextVal);
                        onChange(nextVal);
                        setOpen(false);
                      }}
                      className={`w-full px-1.5 py-1 rounded-md text-[11px] font-mono tabular-nums text-center transition-colors ${
                        active
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
