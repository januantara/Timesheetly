import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  ClipboardList,
  Clock,
  FileCode2,
  FileDown,
  FileSpreadsheet,
  Pencil,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import {
  downloadSheetHtmlReport,
  exportSheetToExcel,
  exportSheetToPdf,
  printReportToPdf,
} from '../lib/exporters';
import {
  buildDefaultTimesheetFilename,
  formatDateIndonesian,
} from '../lib/formatters';
import { getSheetCellDisplayValue } from '../lib/sheetFormulas';
import {
  cellKey,
  getCellSideBorder,
  getMergeCoveringCell,
} from '../lib/sheetTemplate';
import type { SavedExportReport, SheetTemplate } from '../types';
import { ExcelSheetEditor } from './ExcelSheetEditor';

interface ExportPreviewViewProps {
  savedExports: SavedExportReport[];
  activeExportId: string;
  onSelectExport: (id: string) => void;
  onSaveEditedExport: (report: SavedExportReport) => Promise<void>;
  onDeleteSavedExport: (id: string) => Promise<void>;
  onGoToActivities: () => void;
  activeAccountName: string;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

function formatSavedTimestamp(isoStr: string): string {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const datePart = formatDateIndonesian(isoStr.slice(0, 10));
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${datePart}, ${hh}:${mm}`;
}

export function ExportPreviewView({
  savedExports,
  activeExportId,
  onSelectExport,
  onSaveEditedExport,
  onDeleteSavedExport,
  onGoToActivities,
  activeAccountName,
  onNotify,
}: ExportPreviewViewProps) {
  const selectedReport = activeExportId
    ? savedExports.find((item) => item.id === activeExportId) ?? null
    : null;

  const [historySearch, setHistorySearch] = useState('');
  const [cardConfirmDeleteId, setCardConfirmDeleteId] = useState<string | null>(null);
  const [cardDownloadingKey, setCardDownloadingKey] = useState<string | null>(null);

  const [draft, setDraft] = useState<SavedExportReport | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBackUnsaved, setConfirmBackUnsaved] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);

  useEffect(() => {
    if (selectedReport) {
      setDraft(structuredClone(selectedReport));
      setDirty(false);
      setConfirmDelete(false);
      setConfirmBackUnsaved(false);
    } else {
      setDraft(null);
      setDirty(false);
      setConfirmBackUnsaved(false);
    }
  }, [selectedReport?.id, selectedReport?.updatedAt]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return savedExports;
    return savedExports.filter((item) =>
      [item.title, item.vendorName, item.periodLabel]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [savedExports, historySearch]);

  if (savedExports.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 md:p-14 flex flex-col items-center text-center">
        <div className="h-14 w-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 mb-4">
          <FileSpreadsheet className="h-7 w-7" />
        </div>
        <h2 className="font-display text-base font-semibold text-slate-900">
          Belum Ada Hasil Ekspor Tersimpan
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500">
          Klik tombol Ekspor pada halaman Timesheet lalu pilih Simpan agar hasil Excel muncul di daftar riwayat ini untuk diedit kembali.
        </p>
        <button
          type="button"
          onClick={onGoToActivities}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <ClipboardList className="h-4 w-4" />
          <span>Ke Timesheet</span>
        </button>
      </div>
    );
  }

  // Card List View: shown first before entering spreadsheet editor
  if (!selectedReport || !draft) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Daftar Riwayat Ekspor Tersimpan ({savedExports.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih salah satu kartu riwayat di bawah untuk membuka pratinjau, mengedit sel Excel, atau mengunduh ulang laporan.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Cari judul, vendor, atau periode..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              Tidak ada riwayat ekspor yang cocok dengan pencarian &ldquo;{historySearch}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => setHistorySearch('')}
              className="mt-3 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset Pencarian
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredHistory.map((item) => {
              const thumb = item.sheet.images[0]?.dataUrl;
              const isConfirmingDelete = cardConfirmDeleteId === item.id;
              const isDownloadingPdf = cardDownloadingKey === `${item.id}-pdf`;
              const isDownloadingExcel = cardDownloadingKey === `${item.id}-excel`;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={item.vendorName}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-1 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                          {item.vendorName.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onSelectExport(item.id)}
                          title={item.title}
                          className="w-full text-left font-display text-[13px] font-semibold text-slate-900 hover:text-blue-600 transition-colors line-clamp-2 overflow-hidden text-ellipsis [overflow-wrap:anywhere] leading-snug"
                        >
                          {item.title}
                        </button>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                          <span className="font-medium text-slate-700 truncate">
                            {item.vendorName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize shrink-0">
                            {item.paperOrientation}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>Periode</span>
                        </span>
                        <span className="font-mono text-[11px] font-medium text-slate-800 truncate">
                          {item.periodLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
                          <span>Data</span>
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-slate-800">
                          {item.rowCount} aktivitas · {item.sheet.colWidths.length} kolom
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>Disimpan</span>
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-slate-700">
                          {formatSavedTimestamp(item.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectExport(item.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={cardDownloadingKey !== null}
                        title="Unduh PDF"
                        aria-label={`Unduh PDF ${item.title}`}
                        onClick={async () => {
                          setCardDownloadingKey(`${item.id}-pdf`);
                          try {
                            await exportSheetToPdf(
                              item.sheet,
                              item.title,
                              item.paperOrientation
                            );
                            onNotify('success', `PDF "${item.title}" berhasil diunduh.`);
                          } catch {
                            onNotify('error', 'Gagal membuat file PDF.');
                          } finally {
                            setCardDownloadingKey(null);
                          }
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                      >
                        <FileDown
                          className={`h-3.5 w-3.5 ${
                            isDownloadingPdf ? 'animate-pulse text-blue-600' : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        disabled={cardDownloadingKey !== null}
                        title="Unduh Excel (.xlsx)"
                        aria-label={`Unduh Excel ${item.title}`}
                        onClick={async () => {
                          setCardDownloadingKey(`${item.id}-excel`);
                          try {
                            await exportSheetToExcel(
                              item.sheet,
                              item.title,
                              item.vendorName,
                              item.paperOrientation,
                              activeAccountName
                            );
                            onNotify(
                              'success',
                              `Excel (.xlsx) "${item.title}" berhasil diunduh.`
                            );
                          } catch {
                            onNotify('error', 'Gagal membuat file Excel.');
                          } finally {
                            setCardDownloadingKey(null);
                          }
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <FileSpreadsheet
                          className={`h-3.5 w-3.5 ${
                            isDownloadingExcel ? 'animate-pulse' : ''
                          }`}
                        />
                      </button>

                      {!isConfirmingDelete ? (
                        <button
                          type="button"
                          title="Hapus Riwayat"
                          aria-label={`Hapus ${item.title}`}
                          onClick={() => setCardConfirmDeleteId(item.id)}
                          className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 pl-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteSavedExport(item.id);
                              setCardConfirmDeleteId(null);
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-medium hover:bg-red-700"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setCardConfirmDeleteId(null)}
                            className="px-1.5 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50"
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const handleSheetChange = (updater: (prev: SheetTemplate) => SheetTemplate) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, sheet: updater(prev.sheet) };
    });
    setDirty(true);
  };

  const handleSave = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated: SavedExportReport = {
        ...draft,
        title:
          draft.title.trim() ||
          buildDefaultTimesheetFilename(activeAccountName, []),
        updatedAt: new Date().toISOString(),
      };
      await onSaveEditedExport(updated);
      setDraft(structuredClone(updated));
      setDirty(false);
      onNotify('success', 'Perubahan hasil ekspor disimpan ke IndexedDB.');
      return true;
    } catch {
      onNotify('error', 'Gagal menyimpan perubahan ekspor.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleBackToList = () => {
    if (dirty) {
      setConfirmBackUnsaved(true);
      return;
    }
    onSelectExport('');
  };

  const handleDownloadExcel = async () => {
    setExportingExcel(true);
    try {
      await exportSheetToExcel(
        draft.sheet,
        draft.title,
        draft.vendorName,
        draft.paperOrientation,
        activeAccountName
      );
      onNotify('success', `Excel (.xlsx) "${draft.title}" berhasil diunduh.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal membuat file Excel.'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const handleDownloadHtml = async () => {
    setExportingHtml(true);
    try {
      await downloadSheetHtmlReport(
        draft.sheet,
        draft.title,
        draft.paperOrientation
      );
      onNotify('success', 'File HTML berhasil diunduh.');
    } catch {
      onNotify('error', 'Gagal membuat file HTML.');
    } finally {
      setExportingHtml(false);
    }
  };

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      await exportSheetToPdf(
        draft.sheet,
        draft.title,
        draft.paperOrientation
      );
      onNotify('success', `PDF "${draft.title}" berhasil diunduh.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal membuat file PDF.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintPdf = async () => {
    setPrintingPdf(true);
    try {
      const outcome = await printReportToPdf(
        draft.sheet,
        draft.title,
        draft.paperOrientation
      );
      if (outcome === 'downloaded_pdf') {
        onNotify(
          'success',
          'Dialog cetak diblokir pratinjau; file PDF siap cetak langsung diunduh.'
        );
      }
    } catch {
      onNotify('error', 'Gagal memproses cetak laporan.');
    } finally {
      setPrintingPdf(false);
    }
  };

  const sumColWidths = Math.max(
    1,
    draft.sheet.colWidths.reduce((s, w) => s + (w || 100), 0)
  );
  const printablePageWidthPx = draft.paperOrientation === 'landscape' ? 1030 : 700;
  const printZoom =
    sumColWidths > printablePageWidthPx
      ? Number((printablePageWidthPx / sumColWidths).toFixed(4))
      : 1;

  return (
    <div className="space-y-4">
      {/* Top Bar: Back to History Cards + Save / Delete / Exports */}
      <div className="no-print rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleBackToList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Daftar Riwayat</span>
            </button>

            <span className="text-slate-300" aria-hidden="true">
              /
            </span>

            <span className="text-xs font-semibold text-slate-900 truncate">
              {draft.vendorName}
            </span>

            <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
              {draft.periodLabel} · {draft.rowCount} baris
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Hapus</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteSavedExport(draft.id);
                    setConfirmDelete(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 whitespace-nowrap"
                >
                  Yakin Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                dirty
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              <span>{saving ? 'Menyimpan...' : dirty ? 'Simpan Perubahan' : 'Tersimpan'}</span>
            </button>
          </div>
        </div>

        {confirmBackUnsaved && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-amber-900">
              Ada perubahan yang belum disimpan. Simpan terlebih dahulu sebelum kembali ke daftar riwayat?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const ok = await handleSave();
                  if (ok) onSelectExport('');
                }}
                className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Simpan & Kembali
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmBackUnsaved(false);
                  onSelectExport('');
                }}
                className="px-3 py-1 rounded-md border border-amber-300 bg-white text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Kembali Tanpa Simpan
              </button>
              <button
                type="button"
                onClick={() => setConfirmBackUnsaved(false)}
                className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-amber-100"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => {
                setDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev));
                setDirty(true);
              }}
              aria-label="Judul dokumen ekspor"
              placeholder="Judul dokumen ekspor"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 flex-1 min-w-[220px] max-w-md"
            />

            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 text-xs">
              {(['landscape', 'portrait'] as const).map((ori) => (
                <button
                  key={ori}
                  type="button"
                  onClick={() => {
                    setDraft((prev) =>
                      prev ? { ...prev, paperOrientation: ori } : prev
                    );
                    setDirty(true);
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium capitalize transition-colors ${
                    draft.paperOrientation === ori
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ori}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              disabled={exportingHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <FileCode2 className="h-3.5 w-3.5 text-slate-500" />
              <span>{exportingHtml ? 'Menyiapkan...' : 'Unduh HTML'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={printingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span>{printingPdf ? 'Menyiapkan Cetak...' : 'Cetak / Print'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <FileDown className="h-3.5 w-3.5 text-slate-600" />
              <span>{exportingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={exportingExcel}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{exportingExcel ? 'Membuat Excel...' : 'Unduh Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Screen View: Full Interactive Excel Editor for the Looped Sheet */}
      <div className="no-print">
        <ExcelSheetEditor
          sheet={draft.sheet}
          mode="report"
          historyKey={draft.id}
          onChange={handleSheetChange}
          onNotify={onNotify}
          maxHeightClass="max-h-[calc(100vh-380px)] min-h-[340px]"
        />
      </div>

      {/* Clean Print-Only Sheet Container for Browser Ctrl+P */}
      <div className="hidden print:block print-container">
        <div
          className="relative mx-auto bg-white"
          style={{ width: `${sumColWidths}px`, zoom: printZoom }}
        >
          <table
            className="border-collapse table-fixed"
            style={{ width: `${sumColWidths}px` }}
          >
            <colgroup>
              {draft.sheet.colWidths.map((w, idx) => (
                <col
                  key={idx}
                  style={{ width: `${(((w || 100) / sumColWidths) * 100).toFixed(4)}%` }}
                />
              ))}
            </colgroup>
            <tbody>
              {draft.sheet.rowHeights.map((h, r) => (
                <tr key={r} style={{ height: `${h || 24}px` }}>
                  {draft.sheet.colWidths.map((_, c) => {
                    const merge = getMergeCoveringCell(draft.sheet.merges, r, c);
                    if (merge && (merge.startRow !== r || merge.startCol !== c)) {
                      return null;
                    }
                    const colSpan = merge ? merge.endCol - merge.startCol + 1 : 1;
                    const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
                    let cellMinHeightPx = h || 24;
                    if (rowSpan > 1) {
                      cellMinHeightPx = 0;
                      for (
                        let sr = r;
                        sr < r + rowSpan && sr < draft.sheet.rowHeights.length;
                        sr++
                      ) {
                        cellMinHeightPx += draft.sheet.rowHeights[sr] || 24;
                      }
                    }
                    const cellData = draft.sheet.cells[cellKey(r, c)];
                    const st = cellData?.style;
                    const text = getSheetCellDisplayValue(draft.sheet, r, c);

                    const topB = getCellSideBorder(st, 'top');
                    const rightB = getCellSideBorder(st, 'right');
                    const bottomB = getCellSideBorder(st, 'bottom');
                    const leftB = getCellSideBorder(st, 'left');

                    return (
                      <td
                        key={c}
                        colSpan={colSpan}
                        rowSpan={rowSpan}
                        style={{
                          textAlign: st?.align ?? 'left',
                          verticalAlign: st?.verticalAlign ?? 'middle',
                          fontWeight: st?.bold ? 700 : 400,
                          fontStyle: st?.italic ? 'italic' : 'normal',
                          fontSize: `${st?.fontSize ?? 11}px`,
                          color: st?.textColor ?? '#0f172a',
                          backgroundColor: st?.bgColor || undefined,
                          borderTop: topB ? `${topB.width}px solid ${topB.color}` : 'none',
                          borderRight: rightB ? `${rightB.width}px solid ${rightB.color}` : 'none',
                          borderBottom: bottomB ? `${bottomB.width}px solid ${bottomB.color}` : 'none',
                          borderLeft: leftB ? `${leftB.width}px solid ${leftB.color}` : 'none',
                          height: `${cellMinHeightPx}px`,
                          boxSizing: 'border-box',
                        }}
                        className="px-2 py-1 whitespace-pre-line break-words"
                      >
                        {text || '\u00A0'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {draft.sheet.images.map((img) => (
            <img
              key={img.id}
              src={img.dataUrl}
              alt={img.label || draft.vendorName}
              style={{
                left: `${img.xPx}px`,
                top: `${img.yPx}px`,
                width: `${img.widthPx}px`,
                height: `${img.heightPx}px`,
              }}
              className="absolute object-contain pointer-events-none"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
