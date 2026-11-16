import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BookmarkCheck,
  BookmarkPlus,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Italic,
  List,
  ListOrdered,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  calculateDurationMinutes,
  formatDurationShort,
  getIndonesianDayName,
  getTodayIsoDate,
} from '../lib/formatters';
import { extractCustomKeysFromProfile } from '../lib/sheetTemplate';
import type {
  ActivityEntry,
  ActivityStatus,
  ActivityTextFormat,
  ColumnAlign,
  VendorProfile,
} from '../types';

interface CustomFieldDef {
  key: string;
  label: string;
  vendorNames: string[];
}

interface ManualDetailRow {
  id: string;
  key: string;
  value: string;
}

interface ActivityModalProps {
  open: boolean;
  initialEntry: ActivityEntry | null;
  existingActivities: ActivityEntry[];
  defaultPicName: string;
  vendorProfiles: VendorProfile[];
  savedCustomKeys: string[];
  onSaveCustomKey: (key: string) => Promise<void>;
  onRemoveCustomKey: (key: string) => Promise<void>;
  onClose: () => void;
  onSave: (entry: ActivityEntry) => Promise<boolean>;
}

function extractCustomFields(vendorProfiles: VendorProfile[]): CustomFieldDef[] {
  const map = new Map<string, CustomFieldDef>();
  for (const vendor of vendorProfiles) {
    for (const cf of extractCustomKeysFromProfile(vendor)) {
      const existing = map.get(cf.key);
      if (existing) {
        if (!existing.vendorNames.includes(vendor.vendorName)) {
          existing.vendorNames.push(vendor.vendorName);
        }
      } else {
        map.set(cf.key, {
          key: cf.key,
          label: cf.label,
          vendorNames: [vendor.vendorName],
        });
      }
    }
  }
  return Array.from(map.values());
}

function toTitleCase(input: string): string {
  return input.replace(
    /\b([a-zA-Z\u00C0-\u024F])([a-zA-Z\u00C0-\u024F]*)/g,
    (_, first: string, rest: string) => first.toUpperCase() + rest.toLowerCase()
  );
}

export function ActivityModal({
  open,
  initialEntry,
  existingActivities,
  defaultPicName,
  vendorProfiles,
  savedCustomKeys,
  onSaveCustomKey,
  onRemoveCustomKey,
  onClose,
  onSave,
}: ActivityModalProps) {
  const activityRef = useRef<HTMLTextAreaElement>(null);

  const [date, setDate] = useState(getTodayIsoDate());
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('10:30');
  const [timeTouched, setTimeTouched] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayTouched, setHolidayTouched] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityFormat, setActivityFormat] = useState<ActivityTextFormat>({
    bold: false,
    italic: false,
    align: 'left',
  });
  const [caseMode, setCaseMode] = useState<0 | 1 | 2>(0);
  const [project, setProject] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ActivityStatus>('');
  const [templateCustomValues, setTemplateCustomValues] = useState<Record<string, string>>({});
  const [manualDetails, setManualDetails] = useState<ManualDetailRow[]>([]);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newValueInput, setNewValueInput] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const customFields = extractCustomFields(vendorProfiles);
  const templateCustomKeySet = new Set(customFields.map((c) => c.key));
  const templateCustomLowerSet = new Set(
    customFields.flatMap((c) => [c.key.toLowerCase(), c.label.toLowerCase()])
  );
  const savedKeyLowerSet = new Set(savedCustomKeys.map((k) => k.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    if (initialEntry) {
      setDate(initialEntry.date);
      setStartTime(initialEntry.startTime);
      setEndTime(initialEntry.endTime);
      setIsHoliday(Boolean(initialEntry.isHoliday));
      setActivity(initialEntry.activity);
      setActivityFormat({
        bold: Boolean(initialEntry.activityFormat?.bold),
        italic: Boolean(initialEntry.activityFormat?.italic),
        align: initialEntry.activityFormat?.align ?? 'left',
      });
      setProject(initialEntry.project);
      setCategory(initialEntry.category);
      setStatus(initialEntry.status ?? '');

      const tplVals: Record<string, string> = {};
      const manualRows: ManualDetailRow[] = [];
      const seenLower = new Set<string>();
      for (const [k, v] of Object.entries(initialEntry.customValues ?? {})) {
        if (templateCustomKeySet.has(k)) {
          tplVals[k] = v;
        } else if (k.trim()) {
          seenLower.add(k.trim().toLowerCase());
          manualRows.push({
            id: `det-${k}-${Math.random().toString(36).slice(2, 6)}`,
            key: k,
            value: v,
          });
        }
      }
      for (const savedKey of savedCustomKeys) {
        const lower = savedKey.trim().toLowerCase();
        if (!lower || seenLower.has(lower) || templateCustomLowerSet.has(lower)) continue;
        seenLower.add(lower);
        manualRows.push({
          id: `saved-${lower}-${Math.random().toString(36).slice(2, 6)}`,
          key: savedKey,
          value: '',
        });
      }
      setTemplateCustomValues(tplVals);
      setManualDetails(manualRows);
      setNewKeyInput('');
      setNewValueInput('');
      setShowExtras(
        Boolean(
          initialEntry.project ||
            initialEntry.category ||
            initialEntry.status ||
            Object.keys(initialEntry.customValues ?? {}).length > 0 ||
            manualRows.length > 0
        )
      );
    } else {
      setDate(getTodayIsoDate());
      setStartTime('08:30');
      setEndTime('10:30');
      setIsHoliday(false);
      setActivity('');
      setActivityFormat({ bold: false, italic: false, align: 'left' });
      setProject('');
      setCategory('');
      setStatus('');
      setTemplateCustomValues({});
      const initialSavedRows: ManualDetailRow[] = [];
      const seenLower = new Set<string>();
      for (const savedKey of savedCustomKeys) {
        const lower = savedKey.trim().toLowerCase();
        if (!lower || seenLower.has(lower) || templateCustomLowerSet.has(lower)) continue;
        seenLower.add(lower);
        initialSavedRows.push({
          id: `saved-${lower}-${Math.random().toString(36).slice(2, 6)}`,
          key: savedKey,
          value: '',
        });
      }
      setManualDetails(initialSavedRows);
      setNewKeyInput('');
      setNewValueInput('');
      setShowExtras(initialSavedRows.length > 0);
    }
    setTimeTouched(false);
    setHolidayTouched(false);
    setCaseMode(0);
    setError('');
  }, [open, initialEntry]);

  useEffect(() => {
    if (!open || initialEntry || !date) return;
    const match = existingActivities.find((item) => item.date === date);
    if (!holidayTouched) {
      setIsHoliday(Boolean(match?.isHoliday));
    }
    if (!timeTouched) {
      if (match && !match.activity.trim() && (match.startTime || match.endTime)) {
        setStartTime(match.startTime || '');
        setEndTime(match.endTime || '');
      } else if (match?.isHoliday) {
        setStartTime('08:00');
        setEndTime('17:00');
      }
    }
  }, [open, initialEntry, timeTouched, holidayTouched, date, existingActivities]);

  if (!open) return null;

  const sameDateExisting = existingActivities.find(
    (item) => item.date === date && item.id !== initialEntry?.id
  );

  const durationMinutes = calculateDurationMinutes(startTime, endTime);
  const dayName = getIndonesianDayName(date);

  const applyListFormatting = (kind: 'bullet' | 'number') => {
    const el = activityRef.current;
    const text = activity;

    if (!text.trim()) {
      const prefix = kind === 'bullet' ? '• ' : '1. ';
      setActivity(prefix);
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.setSelectionRange(prefix.length, prefix.length);
        }
      });
      return;
    }

    const selStart = el ? el.selectionStart : 0;
    const selEnd = el ? el.selectionEnd : text.length;
    const lines = text.split('\n');

    // Determine which line indices are targeted
    let targetLineIndices: number[] = [];
    if (selStart !== selEnd) {
      let charAcc = 0;
      lines.forEach((line, idx) => {
        const lineStart = charAcc;
        const lineEnd = charAcc + line.length;
        if (lineEnd >= selStart && lineStart <= selEnd) {
          targetLineIndices.push(idx);
        }
        charAcc = lineEnd + 1;
      });
    } else {
      const anyLineHasList = lines.some((l) => /^\s*(•|-|\d+\.)\s+/.test(l));
      if (!anyLineHasList) {
        // Convert all non-empty lines into points
        targetLineIndices = lines
          .map((l, idx) => (l.trim() ? idx : -1))
          .filter((idx) => idx >= 0);
      } else {
        // Toggle only the line where the cursor currently sits
        let charAcc = 0;
        let cursorLine = 0;
        for (let idx = 0; idx < lines.length; idx++) {
          const lineEnd = charAcc + lines[idx].length;
          if (selStart <= lineEnd) {
            cursorLine = idx;
            break;
          }
          charAcc = lineEnd + 1;
          cursorLine = idx;
        }
        targetLineIndices = [cursorLine];
      }
    }

    if (targetLineIndices.length === 0) {
      targetLineIndices = [0];
    }

    const targetSet = new Set(targetLineIndices);
    const alreadyAllFormatted = targetLineIndices.every((idx) =>
      kind === 'bullet'
        ? /^\s*(•|-)\s+/.test(lines[idx])
        : /^\s*\d+\.\s+/.test(lines[idx])
    );

    let seq = 1;
    const nextLines = lines.map((line, idx) => {
      if (!targetSet.has(idx)) return line;
      const stripped = line.replace(/^\s*(?:•|-|\d+\.)\s*/, '');
      if (alreadyAllFormatted) {
        return stripped;
      }
      if (kind === 'bullet') {
        return `• ${stripped}`;
      }
      const numbered = `${seq}. ${stripped}`;
      seq += 1;
      return numbered;
    });

    const nextText = nextLines.join('\n');
    setActivity(nextText);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
      }
    });
  };

  const handleCycleCase = () => {
    const el = activityRef.current;
    const nextMode = ((caseMode + 1) % 3) as 0 | 1 | 2;
    setCaseMode(nextMode);

    const transform = (str: string) => {
      if (nextMode === 1) return str.toUpperCase();
      if (nextMode === 2) return str.toLowerCase();
      return toTitleCase(str);
    };

    if (!activity) return;

    if (el && el.selectionStart !== el.selectionEnd) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const replaced =
        activity.slice(0, start) +
        transform(activity.slice(start, end)) +
        activity.slice(end);
      setActivity(replaced);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, end);
      });
    } else {
      setActivity(transform(activity));
      requestAnimationFrame(() => el?.focus());
    }
  };

  const handleActivityKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start !== end) return;

    const before = activity.slice(0, start);
    const after = activity.slice(end);
    const lastNewline = before.lastIndexOf('\n');
    const currentLine = before.slice(lastNewline + 1);

    const bulletMatch = currentLine.match(/^(\s*[•-]\s+)(.*)$/);
    if (bulletMatch) {
      e.preventDefault();
      if (!bulletMatch[2].trim()) {
        // Exit bullet list cleanly on empty bullet line
        const nextVal = before.slice(0, lastNewline + 1) + after;
        const caret = lastNewline + 1;
        setActivity(nextVal);
        requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      } else {
        const insert = `\n${bulletMatch[1]}`;
        const nextVal = before + insert + after;
        const caret = start + insert.length;
        setActivity(nextVal);
        requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      }
      return;
    }

    const numMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      e.preventDefault();
      if (!numMatch[3].trim()) {
        const nextVal = before.slice(0, lastNewline + 1) + after;
        const caret = lastNewline + 1;
        setActivity(nextVal);
        requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      } else {
        const nextNum = Number(numMatch[2]) + 1;
        const insert = `\n${numMatch[1]}${nextNum}. `;
        const nextVal = before + insert + after;
        const caret = start + insert.length;
        setActivity(nextVal);
        requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      }
    }
  };

  const handleAddManualDetail = () => {
    const trimmedKey = newKeyInput.trim();
    if (!trimmedKey) return;

    const existingIdx = manualDetails.findIndex(
      (d) => d.key.trim().toLowerCase() === trimmedKey.toLowerCase()
    );
    if (existingIdx >= 0) {
      setManualDetails((prev) =>
        prev.map((d, idx) =>
          idx === existingIdx ? { ...d, value: newValueInput.trim() } : d
        )
      );
    } else {
      setManualDetails((prev) => [
        ...prev,
        {
          id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          key: trimmedKey,
          value: newValueInput.trim(),
        },
      ]);
    }
    setNewKeyInput('');
    setNewValueInput('');
  };

  const handleSaveAndInsertKey = async () => {
    const trimmedKey = newKeyInput.trim();
    if (!trimmedKey) return;
    await onSaveCustomKey(trimmedKey);

    const existingIdx = manualDetails.findIndex(
      (d) => d.key.trim().toLowerCase() === trimmedKey.toLowerCase()
    );
    if (existingIdx >= 0) {
      if (newValueInput.trim()) {
        setManualDetails((prev) =>
          prev.map((d, idx) =>
            idx === existingIdx ? { ...d, value: newValueInput.trim() } : d
          )
        );
      }
    } else if (!templateCustomLowerSet.has(trimmedKey.toLowerCase())) {
      setManualDetails((prev) => [
        ...prev,
        {
          id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          key: trimmedKey,
          value: newValueInput.trim(),
        },
      ]);
    }
    setNewKeyInput('');
    setNewValueInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError('Tanggal wajib diisi.');
      return;
    }
    if (!isHoliday && !activity.trim()) {
      setError('Isi activity tidak boleh kosong.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const mergedCustomValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(templateCustomValues)) {
        if (k.trim() && v.trim()) {
          mergedCustomValues[k.trim()] = v.trim();
        }
      }
      for (const row of manualDetails) {
        if (row.key.trim() && row.value.trim()) {
          mergedCustomValues[row.key.trim()] = row.value.trim();
        }
      }
      if (newKeyInput.trim() && newValueInput.trim()) {
        mergedCustomValues[newKeyInput.trim()] = newValueInput.trim();
      }

      const trimmedActivity = activity.trim();
      const hasFormat =
        Boolean(activityFormat.bold) ||
        Boolean(activityFormat.italic) ||
        (activityFormat.align && activityFormat.align !== 'left');

      const nowIso = new Date().toISOString();
      const entry: ActivityEntry = {
        id: initialEntry?.id ?? `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        startTime,
        endTime,
        durationMinutes,
        project: project.trim(),
        category: category.trim(),
        activity: trimmedActivity,
        activityFormat: hasFormat ? activityFormat : undefined,
        remark: trimmedActivity,
        status: status.trim(),
        pic: initialEntry?.pic || defaultPicName || 'Akun Saya',
        isHoliday,
        rowColor: isHoliday ? '#A6A6A6' : undefined,
        attAbsenFlag: isHoliday
          ? 'LIB'
          : initialEntry?.attAbsenFlag === 'LIB'
          ? 'H'
          : initialEntry?.attAbsenFlag,
        customValues: mergedCustomValues,
        createdAt: initialEntry?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
      const shouldClose = await onSave(entry);
      if (shouldClose) {
        onClose();
      }
    } catch {
      setError('Gagal menyimpan ke IndexedDB. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-modal-title"
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2
              id="activity-modal-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              {initialEntry ? 'Edit Activity' : 'Tambah Activity'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Akun: {initialEntry?.pic || defaultPicName || 'Akun Saya'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Row 1: Tanggal & Hari */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-7">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Tanggal
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                required
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Hari
              </label>
              <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
                {dayName}
              </div>
            </div>
          </div>

          {/* Row 2: Jam */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Jam Kerja ({formatDurationShort(durationMinutes)})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setTimeTouched(true);
                  setStartTime(e.target.value);
                }}
                aria-label="Jam mulai"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <span className="text-slate-400 text-xs font-medium">s/d</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setTimeTouched(true);
                  setEndTime(e.target.value);
                }}
                aria-label="Jam selesai"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Flag Hari Libur (LIB) */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-100/60 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={isHoliday}
              onChange={(e) => {
                const next = e.target.checked;
                setHolidayTouched(true);
                setIsHoliday(next);
                if (!timeTouched) {
                  if (next) {
                    setStartTime('08:00');
                    setEndTime('17:00');
                  } else {
                    setStartTime(initialEntry?.startTime || '08:30');
                    setEndTime(initialEntry?.endTime || '10:30');
                  }
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <div className="flex-1 min-w-0 text-xs">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                <span>Tandai sebagai Hari Libur (LIB)</span>
                <span
                  className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-900 border border-slate-300"
                  style={{ backgroundColor: '#A6A6A6' }}
                >
                  #A6A6A6
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Ditampilkan dengan warna baris <span className="font-mono">#A6A6A6</span> pada hasil ekspor (08:00 - 17:00). Pada halaman Timesheet hanya tampil jika terdapat isi activity.
              </p>
            </div>
          </label>

          {sameDateExisting && (
            <div
              className={`p-3 rounded-lg border text-xs leading-relaxed ${
                sameDateExisting.activity.trim()
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-blue-200 bg-blue-50 text-blue-900'
              }`}
            >
              {sameDateExisting.activity.trim() ? (
                <>
                  Tanggal ini sudah memiliki aktivitas tersimpan. Saat menekan{' '}
                  <span className="font-semibold">Simpan</span>, Anda akan diminta konfirmasi apakah ingin menggabungkan (merge) aktivitasnya.
                </>
              ) : sameDateExisting.isHoliday ? (
                <>
                  Tanggal ini ditandai sebagai <span className="font-semibold">Hari Libur (LIB)</span> dengan jam{' '}
                  <span className="font-mono font-semibold">08:00 - 17:00</span> dan warna baris{' '}
                  <span className="font-mono font-semibold">#A6A6A6</span>. Menambahkan aktivitas akan menampilkan tanggal ini di Timesheet.
                </>
              ) : (
                <>
                  Tanggal ini sudah memiliki data check-in/out DigiHC (
                  <span className="font-mono font-semibold">
                    {sameDateExisting.startTime || '-'} s/d {sameDateExisting.endTime || 'Belum Check-Out'}
                  </span>
                  ). Isi aktivitas akan digabungkan ke tanggal ini.
                </>
              )}
            </div>
          )}

          {/* Activity + Text Formatting Toolbar */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Activity{' '}
                {isHoliday ? (
                  <span className="text-[11px] font-normal text-slate-400">
                    (opsional untuk hari libur)
                  </span>
                ) : (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <span className="text-[11px] text-slate-400">
                Format teks & daftar poin
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600">
              {/* Formatting Toolbar */}
              <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setActivityFormat((prev) => ({ ...prev, bold: !prev.bold }))
                  }
                  title="Tebal (Bold)"
                  aria-label="Tebal"
                  className={`p-1.5 rounded text-xs transition-colors ${
                    activityFormat.bold
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActivityFormat((prev) => ({ ...prev, italic: !prev.italic }))
                  }
                  title="Miring (Italic)"
                  aria-label="Miring"
                  className={`p-1.5 rounded text-xs transition-colors ${
                    activityFormat.italic
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>

                <span className="h-4 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

                {(
                  [
                    { value: 'left', icon: AlignLeft, label: 'Rata Kiri' },
                    { value: 'center', icon: AlignCenter, label: 'Rata Tengah' },
                    { value: 'right', icon: AlignRight, label: 'Rata Kanan' },
                  ] as { value: ColumnAlign; icon: typeof AlignLeft; label: string }[]
                ).map((item) => {
                  const Icon = item.icon;
                  const active = (activityFormat.align ?? 'left') === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setActivityFormat((prev) => ({ ...prev, align: item.value }))
                      }
                      title={item.label}
                      aria-label={item.label}
                      className={`p-1.5 rounded text-xs transition-colors ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}

                <span className="h-4 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

                <button
                  type="button"
                  onClick={() => applyListFormatting('bullet')}
                  title="Jadikan daftar poin (•)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-slate-200/70 transition-colors"
                >
                  <List className="h-3.5 w-3.5" />
                  <span>Point</span>
                </button>

                <button
                  type="button"
                  onClick={() => applyListFormatting('number')}
                  title="Jadikan daftar bernomor (1. 2. 3.)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-slate-200/70 transition-colors"
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  <span>Nomor</span>
                </button>

                <button
                  type="button"
                  onClick={handleCycleCase}
                  title="Ubah format huruf (Kapital Awal / HURUF BESAR / huruf kecil)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-slate-200/70 transition-colors"
                >
                  <CaseSensitive className="h-3.5 w-3.5" />
                  <span>Aa</span>
                </button>
              </div>

              <textarea
                ref={activityRef}
                rows={4}
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                onKeyDown={handleActivityKeyDown}
                placeholder="Tulis aktivitas kerja hari ini... (klik Point untuk membuat daftar bullet)"
                style={{
                  textAlign: activityFormat.align ?? 'left',
                  fontWeight: activityFormat.bold ? 700 : 400,
                  fontStyle: activityFormat.italic ? 'italic' : 'normal',
                }}
                className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none resize-y"
                required
              />
            </div>
          </div>

          {/* Detail Tambahan & Manual Key-Value Details */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowExtras((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              {showExtras ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span>Detail tambahan &amp; key kustom (opsional)</span>
            </button>

            {showExtras && (
              <div className="mt-3 pt-3 border-t border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      placeholder="Opsional"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Project Code
                    </label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Opsional"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Aplikasi Berdampak
                    </label>
                    <input
                      type="text"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      placeholder="Opsional"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {customFields.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {customFields.map((cf) => (
                      <div key={cf.key}>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {cf.label} ({cf.vendorNames[0]})
                        </label>
                        <input
                          type="text"
                          value={templateCustomValues[cf.key] ?? ''}
                          onChange={(e) =>
                            setTemplateCustomValues((prev) => ({
                              ...prev,
                              [cf.key]: e.target.value,
                            }))
                          }
                          placeholder={`Isi ${cf.label.toLowerCase()}`}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual Custom Key-Value Details */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div>
                    <div className="text-xs font-semibold text-slate-700">
                      Tambah Detail Lain (Input Key Manual)
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Masukkan nama key beserta nilainya, atau klik <span className="font-medium text-slate-600">Simpan Key</span> agar key selalu tersedia saat tambah activity baru.
                    </p>
                  </div>

                  {savedCustomKeys.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-500">
                        Key Opsional Tersimpan ({savedCustomKeys.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {savedCustomKeys.map((savedKey) => {
                          const alreadyInRows = manualDetails.some(
                            (r) =>
                              r.key.trim().toLowerCase() === savedKey.trim().toLowerCase()
                          );
                          return (
                            <div
                              key={savedKey}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (!alreadyInRows) {
                                    setManualDetails((prev) => [
                                      ...prev,
                                      {
                                        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                        key: savedKey,
                                        value: '',
                                      },
                                    ]);
                                  }
                                }}
                                title={
                                  alreadyInRows
                                    ? 'Key sudah aktif di form ini'
                                    : 'Tampilkan kembali di form'
                                }
                                className={`font-medium ${
                                  alreadyInRows
                                    ? 'text-slate-700 cursor-default'
                                    : 'text-blue-600 hover:underline'
                                }`}
                              >
                                {savedKey}
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveCustomKey(savedKey)}
                                title={`Hapus "${savedKey}" dari key tersimpan`}
                                aria-label={`Hapus key tersimpan ${savedKey}`}
                                className="p-0.5 rounded text-slate-400 hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {manualDetails.length > 0 && (
                    <div className="space-y-2">
                      {manualDetails.map((row) => {
                        const rowKeyTrimmed = row.key.trim();
                        const isSavedKey =
                          Boolean(rowKeyTrimmed) &&
                          savedKeyLowerSet.has(rowKeyTrimmed.toLowerCase());
                        return (
                          <div key={row.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={row.key}
                              onChange={(e) =>
                                setManualDetails((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, key: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Nama key..."
                              className="w-2/5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                            />
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) =>
                                setManualDetails((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, value: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Isi nilai detail (opsional)..."
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                            />
                            {rowKeyTrimmed &&
                              (isSavedKey ? (
                                <span
                                  title="Key sudah tersimpan untuk activity berikutnya"
                                  className="p-1.5 rounded-lg text-blue-600 bg-blue-50"
                                >
                                  <BookmarkCheck className="h-3.5 w-3.5" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onSaveCustomKey(rowKeyTrimmed)}
                                  title="Simpan key ini agar muncul saat tambah activity"
                                  aria-label={`Simpan key ${rowKeyTrimmed}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 whitespace-nowrap"
                                >
                                  <BookmarkPlus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Simpan Key</span>
                                </button>
                              ))}
                            <button
                              type="button"
                              onClick={() =>
                                setManualDetails((prev) =>
                                  prev.filter((r) => r.id !== row.id)
                                )
                              }
                              title="Hapus dari activity ini"
                              aria-label={`Hapus detail ${row.key}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={newKeyInput}
                      onChange={(e) => setNewKeyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddManualDetail();
                        }
                      }}
                      placeholder="Key baru (misal: Lokasi)"
                      className="sm:w-1/3 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs focus:bg-white focus:outline-none focus:border-blue-600"
                    />
                    <input
                      type="text"
                      value={newValueInput}
                      onChange={(e) => setNewValueInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddManualDetail();
                        }
                      }}
                      placeholder="Nilai detail (opsional)..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs focus:bg-white focus:outline-none focus:border-blue-600"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleAddManualDetail}
                        disabled={!newKeyInput.trim()}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Tambah</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAndInsertKey}
                        disabled={!newKeyInput.trim()}
                        title="Simpan key ke daftar permanen agar selalu tersedia saat tambah activity"
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        <span>Simpan Key</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : initialEntry ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
