import { AlertTriangle, GitMerge, RefreshCw, X } from 'lucide-react';
import { mergeActivityEntries } from '../lib/digihcImport';
import {
  formatDateByPattern,
  formatTimeRangeByPattern,
  getDayNameByLanguage,
} from '../lib/formatters';
import { useLanguage } from '../lib/i18n';
import type {
  ActivityEntry,
  DateDisplayFormat,
  TimeDisplayFormat,
} from '../types';

export interface ActivityDateConflict {
  existing: ActivityEntry;
  incoming: ActivityEntry;
}

interface MergeActivityModalProps {
  open: boolean;
  conflicts: ActivityDateConflict[];
  autoUpsertCount?: number;
  newCount?: number;
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
  busy?: boolean;
  onMerge: () => Promise<void> | void;
  onReplace: () => Promise<void> | void;
  onSkipConflicts?: () => Promise<void> | void;
  onCancel: () => void;
}

export function MergeActivityModal({
  open,
  conflicts,
  autoUpsertCount = 0,
  newCount = 0,
  dateFormat,
  timeFormat,
  busy = false,
  onMerge,
  onReplace,
  onSkipConflicts,
  onCancel,
}: MergeActivityModalProps) {
  const { lang, t } = useLanguage();

  if (!open || conflicts.length === 0) return null;

  const isSingle = conflicts.length === 1 && newCount === 0 && autoUpsertCount === 0;
  const firstDateLabel = formatDateByPattern(conflicts[0].existing.date, dateFormat);

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-activity-modal-title"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 shrink-0 bg-amber-50/60">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="merge-activity-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                {isSingle
                  ? t(
                      `Activity for ${firstDateLabel} Already Exists`,
                      `Aktivitas Tanggal ${firstDateLabel} Sudah Ada`
                    )
                  : t(
                      `${conflicts.length} Dates Already Have Activities`,
                      `${conflicts.length} Tanggal Sudah Memiliki Aktivitas`
                    )}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                {isSingle
                  ? t(
                      'To avoid duplicate rows on the same date, would you like to merge the new activity into the existing one?',
                      'Agar tidak ada baris ganda pada tanggal yang sama, apakah Anda ingin menggabungkan aktivitas baru ke aktivitas yang sudah ada?'
                    )
                  : t(
                      'The dates below already have activity entries. Choose whether to merge, replace existing entries, or skip conflicting dates.',
                      'Tanggal di bawah sudah memiliki aktivitas. Pilih apakah ingin menggabungkan, mengganti yang lama, atau melewati tanggal yang bentrok.'
                    )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white/80 disabled:opacity-40"
            aria-label={t('Close', 'Tutup')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {(newCount > 0 || autoUpsertCount > 0) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-900">
              {t(
                `In addition to the ${conflicts.length} conflicting dates below, `,
                `Selain ${conflicts.length} tanggal yang bentrok di bawah, `
              )}
              {newCount > 0 && (
                <span className="font-semibold">
                  {t(`${newCount} new dates`, `${newCount} tanggal baru`)}
                </span>
              )}
              {newCount > 0 && autoUpsertCount > 0 && t(' and ', ' dan ')}
              {autoUpsertCount > 0 && (
                <span className="font-semibold">
                  {t(
                    `${autoUpsertCount} empty check-in/out dates`,
                    `${autoUpsertCount} tanggal check-in/out kosong`
                  )}
                </span>
              )}{' '}
              {t('will be saved automatically.', 'akan disimpan secara otomatis.')}
            </div>
          )}

          <div className="space-y-3">
            {conflicts.map(({ existing, incoming }) => {
              const mergedPreview = mergeActivityEntries(existing, incoming);
              const formattedDate = formatDateByPattern(existing.date, dateFormat);
              const dayName = getDayNameByLanguage(existing.date, lang);

              return (
                <div
                  key={`${existing.id}-${existing.date}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden"
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900">
                        {formattedDate}
                      </span>
                      <span className="text-xs text-slate-500">({dayName})</span>
                      {existing.isHoliday && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#A6A6A6] text-slate-900">
                          {t('Holiday (LIB)', 'Libur (LIB)')}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {t('Merged time:', 'Jam gabungan:')}{' '}
                      <span className="font-semibold text-slate-800">
                        {formatTimeRangeByPattern(
                          mergedPreview.startTime,
                          mergedPreview.endTime,
                          timeFormat
                        ) || '-'}
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        <span>{t('Current Activity', 'Aktivitas Saat Ini')}</span>
                        <span className="font-mono normal-case text-slate-600">
                          {formatTimeRangeByPattern(
                            existing.startTime,
                            existing.endTime,
                            timeFormat
                          ) || '-'}
                        </span>
                      </div>
                      <div className="text-slate-800 whitespace-pre-wrap break-words leading-relaxed max-h-28 overflow-y-auto">
                        {existing.activity}
                      </div>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                        <span>{t('New Activity', 'Aktivitas Baru')}</span>
                        <span className="font-mono normal-case text-blue-700">
                          {formatTimeRangeByPattern(
                            incoming.startTime,
                            incoming.endTime,
                            timeFormat
                          ) || '-'}
                        </span>
                      </div>
                      <div className="text-slate-900 whitespace-pre-wrap break-words leading-relaxed max-h-28 overflow-y-auto">
                        {incoming.activity}
                      </div>
                    </div>
                  </div>

                  <div className="px-3.5 pb-3.5">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                      <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                        {t('Merged Preview', 'Pratinjau Gabungan')}
                      </div>
                      <div className="text-xs text-slate-900 whitespace-pre-wrap break-words leading-relaxed max-h-32 overflow-y-auto">
                        {mergedPreview.activity}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            {t('Cancel', 'Batal')}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {onSkipConflicts && (
              <button
                type="button"
                onClick={onSkipConflicts}
                disabled={busy}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                {t('Skip Conflicts', 'Lewati Bentrok')}
              </button>
            )}

            <button
              type="button"
              onClick={onReplace}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-xs sm:text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t('Replace Existing', 'Ganti yang Lama')}</span>
            </button>

            <button
              type="button"
              onClick={onMerge}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              <GitMerge className="h-3.5 w-3.5" />
              <span>
                {busy ? t('Saving...', 'Menyimpan...') : t('Merge', 'Gabungkan')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
