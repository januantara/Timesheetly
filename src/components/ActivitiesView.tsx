import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  formatDateByPattern,
  formatDurationDecimalHours,
  formatTimeByPattern,
  formatTimeRangeByPattern,
  getIndonesianDayName,
} from '../lib/formatters';
import { ASSET_PATHS } from '../lib/seedData';
import type {
  ActivityEntry,
  ActivityFilterState,
  DateDisplayFormat,
  DateFilterPreset,
  TimeDisplayFormat,
} from '../types';
import { DateRangePicker } from './DateRangePicker';

interface ActivitiesViewProps {
  ownActivitiesCount: number;
  exportableCount?: number;
  selectedExportCount?: number;
  filteredActivities: ActivityEntry[];
  filter: ActivityFilterState;
  onFilterChange: (next: ActivityFilterState) => void;
  activeAccountName: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onAddNew: () => void;
  onEdit: (entry: ActivityEntry) => void;
  onDelete: (id: string) => Promise<void>;
  onDeleteSelected: () => Promise<void>;
  onOpenExportModal: () => void;
  onCopyPrompt: () => Promise<void> | void;
  promptCopied?: boolean;
  onOpenImportModal: () => void;
  onOpenDigiHcModal: () => void;
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
  onChangeFormats: (next: {
    dateFormat: DateDisplayFormat;
    timeFormat: TimeDisplayFormat;
  }) => void;
}

export function ActivitiesView({
  ownActivitiesCount,
  exportableCount,
  selectedExportCount,
  filteredActivities,
  filter,
  onFilterChange,
  activeAccountName,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllFiltered,
  onClearSelection,
  onAddNew,
  onEdit,
  onDelete,
  onDeleteSelected,
  onOpenExportModal,
  onCopyPrompt,
  promptCopied = false,
  onOpenImportModal,
  onOpenDigiHcModal,
  dateFormat,
  timeFormat,
  onChangeFormats,
}: ActivitiesViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const formatMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formatMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        formatMenuRef.current &&
        !formatMenuRef.current.contains(e.target as Node)
      ) {
        setFormatMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFormatMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [formatMenuOpen]);

  const totalMinutesFiltered = filteredActivities.reduce(
    (sum, item) => sum + (item.durationMinutes || 0),
    0
  );

  const allFilteredSelected =
    filteredActivities.length > 0 &&
    filteredActivities.every((item) => selectedIds.has(item.id));

  const datePresets: { value: DateFilterPreset; label: string }[] = [
    { value: 'bulan_ini', label: 'Bulan Ini' },
    { value: 'kustom', label: 'Pilih Date Range' },
  ];

  return (
    <div className="space-y-4">
      {/* Search & Two-Tab Date Filter */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
            placeholder="Cari tanggal, hari, jam, project, aplikasi, atau isi activity..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100">
            {datePresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onFilterChange({ ...filter, datePreset: preset.value })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter.datePreset === preset.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {filter.datePreset === 'kustom' && (
            <DateRangePicker
              startDate={filter.startDate}
              endDate={filter.endDate}
              dateFormat={dateFormat}
              onChange={(startDate, endDate) =>
                onFilterChange({ ...filter, startDate, endDate })
              }
            />
          )}

          <div ref={formatMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setFormatMenuOpen((v) => !v)}
              aria-expanded={formatMenuOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              title="Atur format tampilan tanggal dan jam"
            >
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span>Format Tgl &amp; Jam</span>
            </button>

            {formatMenuOpen && (
              <div className="absolute right-0 top-full mt-2 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-3.5 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Format Tanggal
                  </div>
                  <div className="space-y-1">
                    {DATE_FORMAT_OPTIONS.map((opt) => {
                      const active = dateFormat === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            onChangeFormats({
                              dateFormat: opt.value,
                              timeFormat,
                            })
                          }
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            active
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{opt.label}</span>
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                            <span>{opt.example}</span>
                            {active && <Check className="h-3.5 w-3.5 text-blue-600" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Format Jam
                  </div>
                  <div className="space-y-1">
                    {TIME_FORMAT_OPTIONS.map((opt) => {
                      const active = timeFormat === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            onChangeFormats({
                              dateFormat,
                              timeFormat: opt.value,
                            })
                          }
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            active
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{opt.label}</span>
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                            <span>{opt.example}</span>
                            {active && <Check className="h-3.5 w-3.5 text-blue-600" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table Card with Actions Directly Attached Above Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-white">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              <span className="font-semibold text-slate-900">{filteredActivities.length}</span> baris ·{' '}
              <span className="font-semibold text-slate-900">
                {formatDurationDecimalHours(totalMinutesFiltered)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onCopyPrompt}
                title="Salin prompt untuk mengekstrak tanggal & aktivitas dari folder project di root folder"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                {promptCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span>{promptCopied ? 'Prompt Disalin' : 'Copy Prompt'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenImportModal}
                title="Impor aktivitas dari output JSON prompt"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Impor</span>
              </button>

              <button
                type="button"
                onClick={onOpenDigiHcModal}
                title="Masukan data Check-In dan Check-Out dari DigiHC"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>Check-In/Out DigiHC</span>
              </button>

              <button
                type="button"
                onClick={onAddNew}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Aktivitas</span>
              </button>

              <button
                type="button"
                onClick={onOpenExportModal}
                disabled={(exportableCount ?? filteredActivities.length) === 0 && selectedIds.size === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>
                  {selectedIds.size > 0
                    ? `Ekspor (${selectedExportCount ?? selectedIds.size})`
                    : 'Ekspor'}
                </span>
              </button>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-slate-500 mr-auto">
                <span className="font-semibold text-slate-700">{selectedIds.size}</span> baris dipilih
              </span>
              <button
                type="button"
                onClick={onClearSelection}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap"
              >
                Batal Pilih
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 bg-red-50 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Hapus ({selectedIds.size})</span>
              </button>
            </div>
          )}
        </div>

        {filteredActivities.length === 0 ? (
          <div className="p-8 md:p-12 flex flex-col items-center text-center">
            {!imgError ? (
              <img
                src={ASSET_PATHS.emptyStateDesk}
                alt="Meja catatan aktivitas"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-60 h-44 object-cover rounded-lg border border-slate-200 mb-5"
              />
            ) : (
              <div className="w-60 h-44 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center mb-5 text-slate-400">
                <FileSpreadsheet className="h-9 w-9 mb-2" />
                <span className="text-xs font-medium">Catatan Activity</span>
              </div>
            )}

            <h3 className="font-display text-base font-semibold text-slate-900">
              {ownActivitiesCount === 0
                ? `Belum ada catatan untuk ${activeAccountName}`
                : 'Tidak ada data yang cocok'}
            </h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              {ownActivitiesCount === 0
                ? 'Tambah catatan aktivitas kerja pertama Anda agar siap diekspor ke template vendor.'
                : 'Coba ubah kata kunci pencarian atau sesuaikan rentang tanggal.'}
            </p>

            <div className="mt-5 flex items-center gap-3">
              {ownActivitiesCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      search: '',
                      datePreset: 'kustom',
                      startDate: '',
                      endDate: '',
                    })
                  }
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Tampilkan Semua Tanggal
                </button>
              )}
              <button
                type="button"
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Aktivitas</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={onToggleSelectAllFiltered}
                      aria-label="Pilih semua baris"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap w-32">Tanggal</th>
                  <th className="py-2.5 px-3 whitespace-nowrap w-28">Hari</th>
                  <th className="py-2.5 px-3 whitespace-nowrap w-36">Jam</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Activity</th>
                  <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredActivities.map((entry) => {
                  const checked = selectedIds.has(entry.id);
                  const dayName = getIndonesianDayName(entry.date);
                  const holidayBg =
                    entry.rowColor || (entry.isHoliday ? '#A6A6A6' : undefined);
                  const timeDisplay =
                    entry.startTime && !entry.endTime
                      ? `${formatTimeByPattern(entry.startTime, timeFormat)} - ...`
                      : formatTimeRangeByPattern(
                          entry.startTime,
                          entry.endTime,
                          timeFormat
                        ) || '-';

                  return (
                    <tr
                      key={entry.id}
                      style={holidayBg ? { backgroundColor: holidayBg } : undefined}
                      className={`transition-colors ${
                        holidayBg
                          ? ''
                          : checked
                          ? 'bg-blue-50/40 hover:bg-blue-50/60'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleSelect(entry.id)}
                          aria-label={`Pilih activity ${entry.date}`}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3 align-top font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {formatDateByPattern(entry.date, dateFormat)}
                      </td>
                      <td className="py-3 px-3 align-top text-xs font-medium text-slate-800 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <span>{dayName}</span>
                          {entry.isHoliday && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-white">
                              LIB
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                        {timeDisplay}
                      </td>
                      <td className="py-3 px-3 align-top text-sm text-slate-900 leading-snug">
                        {entry.activity.trim() ? (
                          <div
                            style={{
                              textAlign: entry.activityFormat?.align ?? 'left',
                              fontWeight: entry.activityFormat?.bold ? 700 : 400,
                              fontStyle: entry.activityFormat?.italic
                                ? 'italic'
                                : 'normal',
                            }}
                            className="whitespace-pre-wrap break-words"
                          >
                            {entry.activity}
                          </div>
                        ) : (
                          <div className="text-xs italic text-slate-400">
                            Belum ada isi activity (klik Edit untuk mengisi)
                          </div>
                        )}
                        {(entry.project?.trim() ||
                          entry.category?.trim() ||
                          entry.status?.trim() ||
                          Object.entries(entry.customValues ?? {}).some(
                            ([k, v]) => k.trim() && v.trim()
                          )) && (
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                            {entry.project?.trim() && (
                              <span>
                                <span className="font-medium text-slate-600">Project Name:</span>{' '}
                                {entry.project.trim()}
                              </span>
                            )}
                            {entry.category?.trim() && (
                              <span>
                                <span className="font-medium text-slate-600">Project Code:</span>{' '}
                                {entry.category.trim()}
                              </span>
                            )}
                            {entry.status?.trim() && (
                              <span>
                                <span className="font-medium text-slate-600">
                                  Aplikasi Berdampak:
                                </span>{' '}
                                {entry.status.trim()}
                              </span>
                            )}
                            {Object.entries(entry.customValues ?? {})
                              .filter(([k, v]) => k.trim() && v.trim())
                              .map(([k, v]) => (
                                <span key={k}>
                                  <span className="font-medium text-slate-600">{k}:</span>{' '}
                                  {v}
                                </span>
                              ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pl-3 pr-4 align-top text-right whitespace-nowrap">
                        {confirmDeleteId === entry.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDelete(entry.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEdit(entry)}
                              title="Edit activity"
                              className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              aria-label="Edit activity"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(entry.id)}
                              title="Hapus activity"
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              aria-label="Hapus activity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
