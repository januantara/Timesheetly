import { useEffect, useMemo, useState } from 'react';
import {
  BookmarkCheck,
  Check,
  FileCode2,
  FileDown,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import {
  downloadSheetHtmlReport,
  exportSheetToExcel,
  exportSheetToPdf,
} from '../lib/exporters';
import {
  buildDefaultTimesheetFilename,
  formatDateByPattern,
} from '../lib/formatters';
import {
  buildLoopedSheetFromTemplate,
  ensureSheetTemplate,
} from '../lib/sheetTemplate';
import type {
  ActivityEntry,
  DateDisplayFormat,
  TimeDisplayFormat,
  VendorProfile,
} from '../types';

interface ExportVendorModalProps {
  open: boolean;
  onClose: () => void;
  vendorProfiles: VendorProfile[];
  defaultVendorId: string;
  activitiesToExport: ActivityEntry[];
  activeAccountName: string;
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
  onSelectDefaultVendor: (vendorId: string) => Promise<void>;
  onSaveToPreview: (options: {
    vendor: VendorProfile;
    title: string;
    periodLabel: string;
    preparedByName: string;
    approvedByName: string;
  }) => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function ExportVendorModal({
  open,
  onClose,
  vendorProfiles,
  defaultVendorId,
  activitiesToExport,
  activeAccountName,
  dateFormat,
  timeFormat,
  onSelectDefaultVendor,
  onSaveToPreview,
  onNotify,
}: ExportVendorModalProps) {
  const [selectedVendorId, setSelectedVendorId] = useState(defaultVendorId);
  const [fileName, setFileName] = useState('');
  const [busyAction, setBusyAction] = useState<
    null | 'pdf' | 'html' | 'excel' | 'save'
  >(null);

  const autoPeriodLabel = useMemo(() => {
    if (activitiesToExport.length === 0) return '-';
    const dates = activitiesToExport.map((r) => r.date).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first === last
      ? formatDateByPattern(first, dateFormat)
      : `${formatDateByPattern(first, dateFormat)} - ${formatDateByPattern(
          last,
          dateFormat
        )}`;
  }, [activitiesToExport, dateFormat]);

  const defaultFileName = useMemo(
    () => buildDefaultTimesheetFilename(activeAccountName, activitiesToExport),
    [activeAccountName, activitiesToExport]
  );

  useEffect(() => {
    if (!open) return;
    const initialVendor =
      vendorProfiles.find((v) => v.id === defaultVendorId) ?? vendorProfiles[0];
    setSelectedVendorId(initialVendor?.id ?? '');
    setFileName(defaultFileName);
    setBusyAction(null);
  }, [open, defaultVendorId, vendorProfiles, defaultFileName]);

  if (!open) return null;

  const selectedVendor =
    vendorProfiles.find((v) => v.id === selectedVendorId) ?? vendorProfiles[0];

  const effectiveFileName = fileName.trim() || defaultFileName;

  const handleSelectVendor = (vendor: VendorProfile) => {
    setSelectedVendorId(vendor.id);
  };

  const buildSheet = (vendor: VendorProfile) =>
    buildLoopedSheetFromTemplate(vendor, activitiesToExport, {
      periodLabel: autoPeriodLabel,
      preparedByName: activeAccountName,
      approvedByName: '',
      dateFormat,
      timeFormat,
    });

  const syncChosenVendor = async (vendor: VendorProfile) => {
    if (vendor.id !== defaultVendorId) {
      await onSelectDefaultVendor(vendor.id);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedVendor || busyAction) return;
    setBusyAction('pdf');
    try {
      const sheet = buildSheet(selectedVendor);
      await exportSheetToPdf(
        sheet,
        effectiveFileName,
        selectedVendor.paperOrientation
      );
      await syncChosenVendor(selectedVendor);
      onNotify('success', `PDF "${effectiveFileName}" berhasil diunduh.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal membuat file PDF.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadHtml = async () => {
    if (!selectedVendor || busyAction) return;
    setBusyAction('html');
    try {
      const sheet = buildSheet(selectedVendor);
      await downloadSheetHtmlReport(
        sheet,
        effectiveFileName,
        selectedVendor.paperOrientation
      );
      await syncChosenVendor(selectedVendor);
      onNotify('success', `HTML "${effectiveFileName}" berhasil diunduh.`);
    } catch {
      onNotify('error', 'Gagal membuat file HTML.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadExcel = async () => {
    if (!selectedVendor || busyAction) return;
    setBusyAction('excel');
    try {
      const sheet = buildSheet(selectedVendor);
      await exportSheetToExcel(
        sheet,
        effectiveFileName,
        selectedVendor.vendorName,
        selectedVendor.paperOrientation,
        activeAccountName
      );
      await syncChosenVendor(selectedVendor);
      onNotify('success', `Excel (.xlsx) "${effectiveFileName}" berhasil diunduh.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal membuat file Excel.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor || busyAction) return;
    setBusyAction('save');
    try {
      await onSaveToPreview({
        vendor: selectedVendor,
        title: effectiveFileName,
        periodLabel: autoPeriodLabel,
        preparedByName: activeAccountName,
        approvedByName: '',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-vendor-modal-title"
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="export-vendor-modal-title"
              className="font-display text-base font-semibold text-slate-900"
            >
              Ekspor Laporan Aktivitas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {(() => {
                const holidayCount = activitiesToExport.filter((a) => a.isHoliday).length;
                return (
                  <>
                    {activitiesToExport.length} baris milik {activeAccountName}
                    {holidayCount > 0 ? ` (termasuk ${holidayCount} hari libur)` : ''} siap diekspor sesuai template vendor.
                  </>
                );
              })()}
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

        <form onSubmit={handleSave} className="overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Pilih Template Vendor
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {vendorProfiles.map((vendor) => {
                const isSelected = vendor.id === selectedVendor?.id;
                const tpl = ensureSheetTemplate(vendor);
                const thumb = tpl.images[0]?.dataUrl || vendor.logoDataUrl;

                return (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => handleSelectVendor(vendor)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={vendor.vendorName}
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 rounded border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                        {vendor.vendorName.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-xs font-semibold truncate ${
                          isSelected ? 'text-blue-900' : 'text-slate-900'
                        }`}
                      >
                        {vendor.vendorName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                        {tpl.colWidths.length} kolom ·{' '}
                        {vendor.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}
                      </div>
                    </div>

                    {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <label
              htmlFor="export-file-name-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              File Name
            </label>
            <input
              id="export-file-name-input"
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Masukkan nama file laporan..."
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              Batalkan
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={busyAction !== null || !selectedVendor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <FileDown className="h-3.5 w-3.5 text-slate-600" />
                <span>{busyAction === 'pdf' ? 'Membuat PDF...' : 'Download PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={busyAction !== null || !selectedVendor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <FileCode2 className="h-3.5 w-3.5 text-slate-600" />
                <span>{busyAction === 'html' ? 'Menyiapkan...' : 'HTML'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={busyAction !== null || !selectedVendor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>{busyAction === 'excel' ? 'Membuat Excel...' : 'Excel'}</span>
              </button>

              <button
                type="submit"
                disabled={busyAction !== null || !selectedVendor}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                <BookmarkCheck className="h-3.5 w-3.5" />
                <span>{busyAction === 'save' ? 'Menyimpan...' : 'Simpan'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
