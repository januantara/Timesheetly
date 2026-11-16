import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  FileSpreadsheet,
  FileText,
  FileUp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  buildActivityExtractionPrompt,
  parseImportedActivitiesText,
} from '../lib/activityImport';
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
  formatTimeRangeByPattern,
  getIndonesianDayName,
} from '../lib/formatters';
import type {
  ActivityEntry,
  ActivityFilterState,
  DateDisplayFormat,
  TimeDisplayFormat,
} from '../types';

type ImportMode = 'json' | 'digihc';

interface ImportActivitiesModalProps {
  open: boolean;
  requestedTab?: ImportMode;
  onClose: () => void;
  activeAccountName: string;
  filter: ActivityFilterState;
  savedCustomKeys: string[];
  existingActivities: ActivityEntry[];
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
  onImportEntries: (entries: ActivityEntry[]) => Promise<boolean>;
  onApplyDigiHc: (records: DigiHcParsedRecord[]) => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function ImportActivitiesModal({
  open,
  requestedTab,
  onClose,
  activeAccountName,
  filter,
  savedCustomKeys,
  existingActivities,
  dateFormat,
  timeFormat,
  onImportEntries,
  onApplyDigiHc,
  onNotify,
}: ImportActivitiesModalProps) {
  const [activeTab, setActiveTab] = useState<ImportMode>('json');

  useEffect(() => {
    if (open && requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [open, requestedTab]);

  // JSON Activity import state
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [rawInput, setRawInput] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [importing, setImporting] = useState(false);

  // DigiHC import state
  const digiHcFileInputRef = useRef<HTMLInputElement>(null);
  const [digiHcRawInput, setDigiHcRawInput] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfResult, setPdfResult] = useState<DigiHcParseResult | null>(null);
  const [applyingDigiHc, setApplyingDigiHc] = useState(false);

  const existingByDate = useMemo(() => {
    const map = new Map<string, ActivityEntry>();
    for (const item of existingActivities) {
      if (!map.has(item.date)) {
        map.set(item.date, item);
      }
    }
    return map;
  }, [existingActivities]);

  const parsedJsonPreview = useMemo(() => {
    if (!rawInput.trim()) {
      return {
        ok: false as const,
        error: '',
        entries: [] as ActivityEntry[],
        warnings: [] as string[],
        skippedCount: 0,
      };
    }
    try {
      const res = parseImportedActivitiesText(rawInput, activeAccountName);
      return {
        ok: true as const,
        error: '',
        entries: res.entries,
        warnings: res.warnings,
        skippedCount: res.skippedCount,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Gagal membaca format JSON.',
        entries: [] as ActivityEntry[],
        warnings: [] as string[],
        skippedCount: 0,
      };
    }
  }, [rawInput, activeAccountName]);

  const parsedDigiHcPreview = useMemo(() => {
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
    if (!digiHcRawInput.trim()) {
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
      const res = parseDigiHcAttendanceText(digiHcRawInput);
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
  }, [digiHcRawInput, pdfResult, pdfError]);

  if (!open) return null;

  const clearPdfState = () => {
    setPdfFileName('');
    setPdfError('');
    setPdfResult(null);
  };

  const handleCopyPrompt = async () => {
    const promptText = buildActivityExtractionPrompt({
      accountName: activeAccountName,
      filter,
      savedCustomKeys,
    });
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = promptText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setPromptCopied(true);
    onNotify('success', 'Prompt ekstraksi folder project disalin ke clipboard.');
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawInput(text);
    } catch {
      onNotify('error', 'Gagal membaca file yang dipilih.');
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  const handleDigiHcFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      setDigiHcRawInput('');
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
        if (digiHcFileInputRef.current) digiHcFileInputRef.current.value = '';
      }
      return;
    }

    try {
      clearPdfState();
      const text = await file.text();
      setDigiHcRawInput(text);
    } catch {
      onNotify('error', 'Gagal membaca file yang dipilih.');
    } finally {
      if (digiHcFileInputRef.current) digiHcFileInputRef.current.value = '';
    }
  };

  const handleConfirmJsonImport = async () => {
    if (!parsedJsonPreview.ok || parsedJsonPreview.entries.length === 0) return;
    setImporting(true);
    try {
      const shouldClose = await onImportEntries(parsedJsonPreview.entries);
      if (shouldClose) {
        setRawInput('');
        onClose();
      }
    } catch {
      onNotify('error', 'Gagal menyimpan aktivitas impor ke IndexedDB.');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmDigiHcApply = async () => {
    if (
      !parsedDigiHcPreview.ok ||
      parsedDigiHcPreview.records.length === 0 ||
      applyingDigiHc
    ) {
      return;
    }
    setApplyingDigiHc(true);
    try {
      await onApplyDigiHc(parsedDigiHcPreview.records);
      setDigiHcRawInput('');
      clearPdfState();
      onClose();
    } catch {
      onNotify('error', 'Gagal menerapkan data absensi DigiHC ke IndexedDB.');
    } finally {
      setApplyingDigiHc(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-activities-title"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      >
        <div className="px-6 pt-4 pb-3 border-b border-slate-200 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="import-activities-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                Impor Data Timesheet
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Impor aktivitas kerja (JSON) atau data Check-In &amp; Check-Out dari DigiHC (PDF / JSON)
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

          {/* Mode Tabs */}
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/70">
            <button
              type="button"
              data-tour="import-tab-json"
              onClick={() => setActiveTab('json')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'json'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Aktivitas (JSON)</span>
            </button>
            <button
              type="button"
              data-tour="import-tab-digihc"
              onClick={() => setActiveTab('digihc')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'digihc'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Check-In/Out DigiHC</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'json' ? (
            <>
              {/* Prompt helper bar */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-blue-900 leading-relaxed max-w-lg">
                  Jalankan prompt di root folder project Anda, lalu tempelkan seluruh output JSON-nya ke kolom di bawah ini.
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap"
                  >
                    {promptCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{promptCopied ? 'Prompt Disalin' : 'Copy Prompt'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => jsonFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <FileUp className="h-3.5 w-3.5 text-slate-500" />
                    <span>Pilih File JSON</span>
                  </button>
                  <input
                    ref={jsonFileInputRef}
                    type="file"
                    accept=".json,.txt,application/json,text/plain"
                    onChange={handleJsonFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Paste JSON textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="import-json-textarea"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Output JSON Prompt
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
                  id="import-json-textarea"
                  rows={7}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={`Tempel output JSON dari prompt di sini...\n{\n  "activities": [\n    {\n      "date": "2026-11-15",\n      "activity": "• Mengerjakan fitur X"\n    }\n  ]\n}`}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              {rawInput.trim() && !parsedJsonPreview.ok && parsedJsonPreview.error && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parsedJsonPreview.error}</span>
                </div>
              )}

              {parsedJsonPreview.ok && parsedJsonPreview.warnings.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
                  <div className="font-semibold">
                    {parsedJsonPreview.skippedCount} baris dilewati karena tidak lengkap:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {parsedJsonPreview.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedJsonPreview.ok && parsedJsonPreview.entries.length > 0 && (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      Pratinjau Data Siap Impor ({parsedJsonPreview.entries.length} aktivitas)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Masuk ke akun: <span className="font-medium text-slate-700">{activeAccountName}</span>
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 sticky top-0">
                        <tr>
                          <th className="py-2 px-3 font-semibold whitespace-nowrap">Tanggal</th>
                          <th className="py-2 px-3 font-semibold whitespace-nowrap">Hari</th>
                          <th className="py-2 px-3 font-semibold whitespace-nowrap">Jam</th>
                          <th className="py-2 px-3 font-semibold whitespace-nowrap">Durasi</th>
                          <th className="py-2 px-3 font-semibold whitespace-nowrap">Project &amp; Activity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedJsonPreview.entries.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 align-top font-mono tabular-nums whitespace-nowrap text-slate-900">
                              {formatDateByPattern(item.date, dateFormat)}
                            </td>
                            <td className="py-2 px-3 align-top whitespace-nowrap text-slate-600">
                              {getIndonesianDayName(item.date)}
                            </td>
                            <td className="py-2 px-3 align-top font-mono tabular-nums whitespace-nowrap text-slate-600">
                              {item.startTime || item.endTime
                                ? formatTimeRangeByPattern(item.startTime, item.endTime, timeFormat)
                                : ''}
                            </td>
                            <td className="py-2 px-3 align-top font-mono tabular-nums whitespace-nowrap text-slate-700">
                              {item.startTime && item.endTime
                                ? formatDurationHHMM(item.durationMinutes)
                                : ''}
                            </td>
                            <td className="py-2 px-3 align-top text-slate-800">
                              {item.project && (
                                <div className="font-semibold text-slate-900 mb-0.5">
                                  {item.project}
                                  {item.category ? ` (${item.category})` : ''}
                                </div>
                              )}
                              <div className="whitespace-pre-wrap break-words text-slate-700">
                                {item.activity}
                              </div>
                              {item.status && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Aplikasi Berdampak: {item.status}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* DigiHC Upload Bar (no holiday explanation text) */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 leading-relaxed max-w-xl">
                  Unggah file PDF Laporan Kehadiran DigiHC atau pilih file JSON absensi. Jam check-in &amp; check-out akan otomatis di-upsert ke tanggal terkait.
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => digiHcFileInputRef.current?.click()}
                    disabled={pdfParsing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    <span>{pdfParsing ? 'Membaca PDF...' : 'Pilih File PDF / JSON'}</span>
                  </button>
                  <input
                    ref={digiHcFileInputRef}
                    type="file"
                    accept=".pdf,.json,.txt,application/pdf,application/json,text/plain"
                    onChange={handleDigiHcFileChange}
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
                  {digiHcRawInput.trim() && (
                    <button
                      type="button"
                      onClick={() => setDigiHcRawInput('')}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>
                <textarea
                  id="digihc-json-textarea"
                  rows={5}
                  value={digiHcRawInput}
                  onChange={(e) => {
                    if (pdfFileName || pdfResult || pdfError) {
                      clearPdfState();
                    }
                    setDigiHcRawInput(e.target.value);
                  }}
                  placeholder={`Pilih file PDF Laporan Kehadiran DigiHC di atas, atau tempel JSON di sini...\n[\n  {\n    "attAbsenFlag": "H",\n    "periodeHari": "09-11-2026",\n    "jamCheckIn": "07:49:25",\n    "jamCheckOut": "21:25:49"\n  }\n]`}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              {(digiHcRawInput.trim() || pdfError) &&
                !parsedDigiHcPreview.ok &&
                parsedDigiHcPreview.error && (
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 flex items-start gap-2 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{parsedDigiHcPreview.error}</span>
                  </div>
                )}

              {parsedDigiHcPreview.ok && parsedDigiHcPreview.warnings.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
                  <div className="font-semibold">
                    {parsedDigiHcPreview.skippedCount} baris dilewati:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {parsedDigiHcPreview.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedDigiHcPreview.ok && parsedDigiHcPreview.records.length > 0 && (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800">
                      Pratinjau Absensi DigiHC ({parsedDigiHcPreview.records.length} hari:{' '}
                      {parsedDigiHcPreview.workDayCount} masuk, {parsedDigiHcPreview.holidayCount} libur)
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
                        {parsedDigiHcPreview.records.map((rec) => {
                          const existing = existingByDate.get(rec.date);
                          const hasExistingActivity = Boolean(existing?.activity.trim());
                          const rowBg = rec.isHoliday ? HOLIDAY_ROW_COLOR : undefined;

                          let statusNote = 'Hari baru';
                          if (rec.isHoliday) {
                            statusNote = hasExistingActivity
                              ? 'Libur + aktivitas'
                              : 'Hari libur (LIB)';
                          } else if (existing) {
                            statusNote = 'Upsert jam kerja';
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
            </>
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

          {activeTab === 'json' ? (
            <button
              type="button"
              onClick={handleConfirmJsonImport}
              disabled={
                !parsedJsonPreview.ok ||
                parsedJsonPreview.entries.length === 0 ||
                importing
              }
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              <span>
                {importing
                  ? 'Mengimpor...'
                  : parsedJsonPreview.ok && parsedJsonPreview.entries.length > 0
                  ? `Impor ${parsedJsonPreview.entries.length} Aktivitas`
                  : 'Impor Aktivitas'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmDigiHcApply}
              disabled={
                !parsedDigiHcPreview.ok ||
                parsedDigiHcPreview.records.length === 0 ||
                applyingDigiHc ||
                pdfParsing
              }
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              <span>
                {applyingDigiHc
                  ? 'Menyimpan...'
                  : parsedDigiHcPreview.ok && parsedDigiHcPreview.records.length > 0
                  ? `Terapkan (${parsedDigiHcPreview.records.length} Hari)`
                  : 'Terapkan Check-In/Out'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
