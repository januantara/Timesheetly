import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Clock,
  FileText,
  FileUp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  HOLIDAY_ROW_COLOR,
  parseDigiHcAttendancePdf,
  parseDigiHcAttendanceText,
  type DigiHcParsedRecord,
  type DigiHcParseResult,
} from '../lib/digihcImport';
import {
  formatDateByPattern,
  formatDurationHHMM,
  formatTimeByPattern,
  getIndonesianDayName,
} from '../lib/formatters';
import type {
  ActivityEntry,
  DateDisplayFormat,
  TimeDisplayFormat,
} from '../types';

interface DigiHcImportModalProps {
  open: boolean;
  onClose: () => void;
  activeAccountName: string;
  existingActivities: ActivityEntry[];
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
  onApplyDigiHc: (records: DigiHcParsedRecord[]) => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function DigiHcImportModal({
  open,
  onClose,
  activeAccountName,
  existingActivities,
  dateFormat,
  timeFormat,
  onApplyDigiHc,
  onNotify,
}: DigiHcImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawInput, setRawInput] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfResult, setPdfResult] = useState<DigiHcParseResult | null>(null);
  const [applying, setApplying] = useState(false);

  const existingByDate = useMemo(() => {
    const map = new Map<string, ActivityEntry>();
    for (const item of existingActivities) {
      if (!map.has(item.date)) {
        map.set(item.date, item);
      }
    }
    return map;
  }, [existingActivities]);

  const parsedPreview = useMemo(() => {
    if (pdfResult) {
      return {
        ok: true as const,
        error: '',
        source: 'pdf' as const,
        ...pdfResult,
      };
    }
    if (pdfError) {
      return {
        ok: false as const,
        error: pdfError,
        source: 'pdf' as const,
        records: [] as DigiHcParsedRecord[],
        warnings: [] as string[],
        skippedCount: 0,
        holidayCount: 0,
        workDayCount: 0,
      };
    }
    if (!rawInput.trim()) {
      return {
        ok: false as const,
        error: '',
        source: 'json' as const,
        records: [] as DigiHcParsedRecord[],
        warnings: [] as string[],
        skippedCount: 0,
        holidayCount: 0,
        workDayCount: 0,
      };
    }
    try {
      const res = parseDigiHcAttendanceText(rawInput);
      return {
        ok: true as const,
        error: '',
        source: 'json' as const,
        ...res,
      };
    } catch (err) {
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal membaca respons JSON DigiHC.',
        source: 'json' as const,
        records: [] as DigiHcParsedRecord[],
        warnings: [] as string[],
        skippedCount: 0,
        holidayCount: 0,
        workDayCount: 0,
      };
    }
  }, [rawInput, pdfResult, pdfError]);

  if (!open) return null;

  const clearPdfState = () => {
    setPdfFileName('');
    setPdfError('');
    setPdfResult(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      setRawInput('');
      setPdfFileName(file.name);
      setPdfError('');
      setPdfResult(null);
      setPdfParsing(true);
      try {
        const res = await parseDigiHcAttendancePdf(file);
        setPdfResult(res);
      } catch (err) {
        setPdfError(
          err instanceof Error
            ? err.message
            : 'Gagal memparsing file PDF DigiHC.'
        );
      } finally {
        setPdfParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    try {
      clearPdfState();
      const text = await file.text();
      setRawInput(text);
    } catch {
      onNotify('error', 'Gagal membaca file yang dipilih.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmApply = async () => {
    if (!parsedPreview.ok || parsedPreview.records.length === 0 || applying) return;
    setApplying(true);
    try {
      await onApplyDigiHc(parsedPreview.records);
      setRawInput('');
      clearPdfState();
      onClose();
    } catch {
      onNotify('error', 'Gagal menerapkan data absensi DigiHC ke IndexedDB.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="digihc-modal-title"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="digihc-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                Masukan Check-In &amp; Check-Out dari DigiHC
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Unggah file PDF Laporan Kehadiran DigiHC atau tempel response JSON absensi
              </p>
            </div>
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

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 leading-relaxed max-w-xl">
              Tanggal yang sudah memiliki aktivitas akan otomatis diperbarui jam check-in/out-nya (upsert). Hari dengan keterangan{' '}
              <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">
                LIB
              </code>{' '}
              diatur <span className="font-medium text-slate-800">08:00 - 17:00</span>, warna baris{' '}
              <span
                className="inline-block px-1.5 py-0.5 rounded font-mono text-[11px] text-slate-900 font-semibold"
                style={{ backgroundColor: HOLIDAY_ROW_COLOR }}
              >
                #A6A6A6
              </span>
              , dan disembunyikan dari halaman Timesheet kecuali ada aktivitas pada hari tersebut (tetap tampil saat ekspor).
            </div>

            <div className="shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pdfParsing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>{pdfParsing ? 'Membaca PDF...' : 'Pilih File PDF / JSON'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.json,.txt,application/pdf,application/json,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {pdfFileName && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 text-xs">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {pdfFileName}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {pdfParsing
                      ? 'Sedang memparsing isi tabel PDF DigiHC...'
                      : pdfResult
                      ? `${pdfResult.pageCount ?? 1} halaman · ${pdfResult.records.length} baris kehadiran berhasil diparsing`
                      : 'Gagal membaca isi PDF'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={clearPdfState}
                className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-white transition-colors shrink-0"
                title="Hapus file PDF"
                aria-label="Hapus file PDF"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="digihc-json-textarea"
                className="block text-xs font-semibold text-slate-700"
              >
                Atau Tempel Response JSON DigiHC
              </label>
              {rawInput.trim() && (
                <button
                  type="button"
                  onClick={() => setRawInput('')}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  Bersihkan
                </button>
              )}
            </div>
            <textarea
              id="digihc-json-textarea"
              rows={5}
              value={rawInput}
              onChange={(e) => {
                if (pdfFileName || pdfResult || pdfError) {
                  clearPdfState();
                }
                setRawInput(e.target.value);
              }}
              placeholder={`Pilih file PDF Laporan Kehadiran DigiHC di atas, atau tempel JSON di sini...\n[\n  {\n    "attAbsenFlag": "H",\n    "periodeHari": "09-11-2026",\n    "jamCheckIn": "07:49:25",\n    "jamCheckOut": "21:25:49"\n  }\n]`}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          {(rawInput.trim() || pdfError) && !parsedPreview.ok && parsedPreview.error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{parsedPreview.error}</span>
            </div>
          )}

          {parsedPreview.ok && parsedPreview.warnings.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
              <div className="font-semibold">
                {parsedPreview.skippedCount} baris dilewati:
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                {parsedPreview.warnings.slice(0, 4).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedPreview.ok && parsedPreview.records.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800">
                  Pratinjau Absensi DigiHC ({parsedPreview.records.length} hari:{' '}
                  {parsedPreview.workDayCount} masuk, {parsedPreview.holidayCount} libur)
                </span>
                <span className="text-[11px] text-slate-500">
                  Akun: <span className="font-medium text-slate-700">{activeAccountName}</span>
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Tanggal</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Hari</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Flag</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Check-In</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Check-Out</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Durasi</th>
                      <th className="py-2 px-3 font-semibold whitespace-nowrap">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {parsedPreview.records.map((rec) => {
                      const existing = existingByDate.get(rec.date);
                      const hasExistingActivity = Boolean(existing?.activity.trim());
                      const rowBg = rec.isHoliday ? HOLIDAY_ROW_COLOR : undefined;

                      let statusNote = 'Hari baru (tampil di Timesheet)';
                      if (rec.isHoliday) {
                        statusNote = hasExistingActivity
                          ? 'Libur ada aktivitas (tampil + warna #A6A6A6)'
                          : 'Libur tanpa aktivitas (hanya tampil saat ekspor)';
                      } else if (existing) {
                        statusNote = 'Upsert jam ke aktivitas yang ada';
                      }

                      return (
                        <tr
                          key={rec.date}
                          style={rowBg ? { backgroundColor: rowBg } : undefined}
                          className={!rowBg ? 'hover:bg-slate-50/60' : undefined}
                        >
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-900 font-medium">
                            {formatDateByPattern(rec.date, dateFormat)}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap text-slate-800">
                            {getIndonesianDayName(rec.date)}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                                rec.isHoliday
                                  ? 'bg-slate-800 text-white'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {rec.attAbsenFlag}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-900">
                            {rec.startTime
                              ? formatTimeByPattern(rec.startTime, timeFormat)
                              : '-'}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-900">
                            {rec.endTime
                              ? formatTimeByPattern(rec.endTime, timeFormat)
                              : existing?.endTime
                              ? `${formatTimeByPattern(existing.endTime, timeFormat)} (tetap)`
                              : 'Belum Check-Out'}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-900">
                            {rec.startTime && rec.endTime
                              ? formatDurationHHMM(rec.durationMinutes)
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-800">
                            {statusNote}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirmApply}
            disabled={
              !parsedPreview.ok ||
              parsedPreview.records.length === 0 ||
              applying ||
              pdfParsing
            }
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            <span>
              {applying
                ? 'Menyimpan...'
                : parsedPreview.ok && parsedPreview.records.length > 0
                ? `Terapkan (${parsedPreview.records.length} Hari)`
                : 'Terapkan Check-In/Out'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
