import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ensureSheetTemplate } from '../lib/sheetTemplate';
import {
  exportAllVendorTemplatesToJson,
  exportVendorTemplateToExcel,
  exportVendorTemplateToJson,
  importVendorTemplatesFromFile,
} from '../lib/templateTransfer';
import type { SheetTemplate, VendorProfile } from '../types';
import { ExcelSheetEditor } from './ExcelSheetEditor';

interface VendorTemplatesViewProps {
  vendorProfiles: VendorProfile[];
  activeVendorId: string;
  onSelectActiveVendor: (id: string) => Promise<void> | void;
  onSaveProfile: (profile: VendorProfile) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function VendorTemplatesView({
  vendorProfiles,
  activeVendorId,
  onSelectActiveVendor,
  onSaveProfile,
  onDeleteProfile,
  onNotify,
}: VendorTemplatesViewProps) {
  const selectedProfile =
    vendorProfiles.find((v) => v.id === activeVendorId) ?? vendorProfiles[0];

  const [draft, setDraft] = useState<VendorProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedProfile) {
      const cloned = structuredClone(selectedProfile);
      cloned.sheetTemplate = ensureSheetTemplate(cloned);
      setDraft(cloned);
      setDirty(false);
      setConfirmDelete(false);
      setEditingName(false);
      setDropdownOpen(false);
      setExportMenuOpen(false);
    }
  }, [selectedProfile?.id]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setExportMenuOpen(false);
      }
    };
    if (dropdownOpen || exportMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen, exportMenuOpen]);

  if (!draft || !draft.sheetTemplate) return null;

  const sheet = draft.sheetTemplate;
  const firstLogo = sheet.images[0]?.dataUrl || draft.logoDataUrl;

  const handleSheetChange = (updater: (prev: SheetTemplate) => SheetTemplate) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = ensureSheetTemplate(prev);
      return { ...prev, sheetTemplate: updater(current) };
    });
    setDirty(true);
  };

  const persistProfile = async (profileToSave: VendorProfile, showToast = true) => {
    if (!profileToSave.vendorName.trim()) {
      onNotify('error', 'Nama vendor wajib diisi.');
      return false;
    }
    setSaving(true);
    try {
      const updated: VendorProfile = {
        ...profileToSave,
        vendorName: profileToSave.vendorName.trim(),
        updatedAt: new Date().toISOString(),
      };
      await onSaveProfile(updated);
      setDraft(structuredClone(updated));
      setDirty(false);
      if (showToast) {
        onNotify('success', `Template ${updated.vendorName} disimpan.`);
      }
      return true;
    } catch {
      onNotify('error', 'Gagal menyimpan template.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchVendor = async (nextVendorId: string) => {
    setDropdownOpen(false);
    if (nextVendorId === draft.id) return;
    if (dirty) {
      await persistProfile(draft, false);
      onNotify('success', `Perubahan pada ${draft.vendorName} otomatis disimpan.`);
    }
    await onSelectActiveVendor(nextVendorId);
  };

  const handleCreateNewProfile = async () => {
    if (dirty) await persistProfile(draft, false);
    const newId = `vendor-${Date.now()}`;
    const blankSheet: SheetTemplate = {
      colWidths: [55, 110, 95, 120, 280],
      rowHeights: [34, 24, 16, 30, 36, 26, 26],
      cells: {
        '0,0': {
          value: 'LAPORAN AKTIVITAS HARIAN',
          style: { bold: true, fontSize: 14, align: 'left', textColor: '#0F172A' },
        },
        '1,0': {
          value: 'Periode: {{periode}}',
          style: { fontSize: 10, align: 'left', textColor: '#64748B' },
        },
        '3,0': {
          value: 'No',
          style: { bold: true, align: 'center', bgColor: '#1E3A8A', textColor: '#FFFFFF', border: true },
        },
        '3,1': {
          value: 'Tanggal',
          style: { bold: true, align: 'center', bgColor: '#1E3A8A', textColor: '#FFFFFF', border: true },
        },
        '3,2': {
          value: 'Hari',
          style: { bold: true, align: 'center', bgColor: '#1E3A8A', textColor: '#FFFFFF', border: true },
        },
        '3,3': {
          value: 'Jam',
          style: { bold: true, align: 'center', bgColor: '#1E3A8A', textColor: '#FFFFFF', border: true },
        },
        '3,4': {
          value: 'Activity',
          style: { bold: true, align: 'left', bgColor: '#1E3A8A', textColor: '#FFFFFF', border: true },
        },
        '4,0': { value: '{{no}}', style: { align: 'center', border: true } },
        '4,1': { value: '{{tanggal}}', style: { align: 'center', border: true } },
        '4,2': { value: '{{hari}}', style: { align: 'center', border: true } },
        '4,3': { value: '{{jam}}', style: { align: 'center', border: true } },
        '4,4': { value: '{{activity}}', style: { align: 'left', border: true } },
      },
      merges: [
        { startRow: 0, startCol: 0, endRow: 0, endCol: 4 },
        { startRow: 1, startCol: 0, endRow: 1, endCol: 4 },
      ],
      images: [],
      dataRowIndex: 4,
      dataRowIndices: [4],
    };

    const newProfile: VendorProfile = {
      id: newId,
      vendorName: `Vendor Baru ${vendorProfiles.length + 1}`,
      reportTitle: 'LAPORAN AKTIVITAS HARIAN',
      subtitle: '',
      logoDataUrl: '',
      logoPosition: 'left',
      headerBgColor: '#1E3A8A',
      headerTextColor: '#FFFFFF',
      paperOrientation: 'landscape',
      showSummaryRow: false,
      footerNotes: '',
      preparedByLabel: 'Disusun Oleh',
      approvedByLabel: 'Disetujui Oleh',
      columns: [],
      sheetTemplate: blankSheet,
      updatedAt: new Date().toISOString(),
    };
    await onSaveProfile(newProfile);
    await onSelectActiveVendor(newId);
    onNotify('success', 'Template vendor baru dibuat.');
  };

  const commitNameEdit = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      onNotify('error', 'Nama vendor tidak boleh kosong.');
      return;
    }
    if (trimmed !== draft.vendorName) {
      setDraft((prev) => (prev ? { ...prev, vendorName: trimmed } : prev));
      setDirty(true);
    }
    setEditingName(false);
  };

  const handleImportTemplateFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (dirty) {
        await persistProfile(draft, false);
      }
      const imported = await importVendorTemplatesFromFile(file, vendorProfiles);
      for (const profile of imported) {
        await onSaveProfile(profile);
      }
      if (imported[0]) {
        await onSelectActiveVendor(imported[0].id);
      }
      onNotify(
        'success',
        imported.length === 1
          ? `Template "${imported[0].vendorName}" berhasil diimpor.`
          : `${imported.length} template vendor berhasil diimpor.`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal mengimpor file template vendor.'
      );
    } finally {
      setImporting(false);
      if (importFileRef.current) {
        importFileRef.current.value = '';
      }
    }
  };

  const handleExportSingleJson = () => {
    setExportMenuOpen(false);
    exportVendorTemplateToJson(draft);
    onNotify('success', `Template "${draft.vendorName}" (.json) berhasil diekspor.`);
  };

  const handleExportSingleExcel = async () => {
    setExportMenuOpen(false);
    try {
      await exportVendorTemplateToExcel(draft);
      onNotify('success', `Template "${draft.vendorName}" (.xlsx) berhasil diekspor.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal mengekspor template ke Excel.'
      );
    }
  };

  const handleExportAllJson = () => {
    setExportMenuOpen(false);
    const list = vendorProfiles.map((v) => (v.id === draft.id ? draft : v));
    exportAllVendorTemplatesToJson(list);
    onNotify('success', `${list.length} template vendor (.json) berhasil diekspor.`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Compact Single-Row Clean Vendor Selector & Icon Actions */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Custom Styled Vendor Select Dropdown + Inline Rename Toggle + Add */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNameEdit();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                placeholder="Nama vendor..."
                autoFocus
                className="px-3 py-1.5 rounded-lg border border-blue-600 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-56 sm:w-64"
              />
              <button
                type="button"
                onClick={commitNameEdit}
                title="Terapkan nama"
                aria-label="Terapkan nama"
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                title="Batal"
                aria-label="Batal"
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Custom Styled Vendor Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="listbox"
                  className="inline-flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors max-w-[290px]"
                >
                  {firstLogo ? (
                    <img
                      src={firstLogo}
                      alt={draft.vendorName}
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 rounded-md border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-600 shrink-0">
                      {draft.vendorName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {draft.vendorName}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
                      dropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div
                    role="listbox"
                    aria-label="Daftar template vendor"
                    className="absolute left-0 top-full mt-1.5 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 space-y-0.5"
                  >
                    {vendorProfiles.map((vendor) => {
                      const isSelected = vendor.id === draft.id;
                      const tpl = ensureSheetTemplate(vendor);
                      const thumb = tpl.images[0]?.dataUrl || vendor.logoDataUrl;

                      return (
                        <button
                          key={vendor.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSwitchVendor(vendor.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={vendor.vendorName}
                              referrerPolicy="no-referrer"
                              className="h-8 w-8 rounded-md border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">
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
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {tpl.colWidths.length} kolom × {tpl.rowHeights.length} baris ·{' '}
                              {vendor.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}
                            </div>
                          </div>

                          {isSelected && (
                            <Check className="h-4 w-4 text-blue-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Icon-only Edit Vendor Name Trigger */}
              <button
                type="button"
                onClick={() => {
                  setNameInput(draft.vendorName);
                  setEditingName(true);
                  setDropdownOpen(false);
                }}
                title="Ubah nama vendor"
                aria-label="Ubah nama vendor"
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Add New Template */}
          <button
            type="button"
            onClick={handleCreateNewProfile}
            title="Tambah template vendor baru"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-blue-600" />
            <span>Tambah</span>
          </button>

          {/* Import Template (.json / .xlsx) */}
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            title="Impor template vendor dari file JSON atau Excel (.xlsx)"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>{importing ? 'Mengimpor...' : 'Impor'}</span>
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleImportTemplateFile}
            className="hidden"
          />

          {/* Export Template Dropdown (.json / .xlsx) */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              aria-expanded={exportMenuOpen}
              title="Ekspor template vendor"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Ekspor</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {exportMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 space-y-0.5">
                <button
                  type="button"
                  onClick={handleExportSingleJson}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileJson className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">
                      Ekspor Template Ini (.json)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Format lengkap siap impor ulang
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportSingleExcel}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">
                      Ekspor Template Ini (.xlsx)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Unduh struktur sheet sebagai Excel
                    </div>
                  </div>
                </button>

                {vendorProfiles.length > 1 && (
                  <button
                    type="button"
                    onClick={handleExportAllJson}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100 mt-1 pt-2 transition-colors"
                  >
                    <Download className="h-4 w-4 text-slate-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Ekspor Semua Template ({vendorProfiles.length})
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Gabung semua profil ke satu JSON
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Orientation + Icon-only Save & Delete */}
        <div className="flex items-center gap-2">
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
                className={`px-2.5 py-1.5 rounded-md font-medium capitalize transition-colors ${
                  draft.paperOrientation === ori
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ori}
              </button>
            ))}
          </div>

          {/* Icon-only Save Button */}
          <button
            type="button"
            onClick={() => persistProfile(draft, true)}
            disabled={saving}
            title={
              saving
                ? 'Menyimpan...'
                : dirty
                ? 'Simpan perubahan template'
                : 'Template tersimpan'
            }
            aria-label={dirty ? 'Simpan perubahan template' : 'Template tersimpan'}
            className={`relative p-2 rounded-lg border transition-colors ${
              dirty
                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Save className="h-4 w-4" />
            {dirty && (
              <span
                className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 border-2 border-white"
                aria-hidden="true"
              />
            )}
          </button>

          {/* Icon-only Delete Button with Compact Inline Confirmation */}
          {vendorProfiles.length > 1 &&
            (!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Hapus template vendor"
                aria-label="Hapus template vendor"
                className="p-2 rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <div className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg border border-red-200 bg-red-50">
                <span className="text-xs font-medium text-red-700 mr-0.5">Hapus?</span>
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteProfile(draft.id);
                    setConfirmDelete(false);
                  }}
                  title="Ya, hapus"
                  aria-label="Ya, hapus"
                  className="p-1 rounded bg-red-600 text-white hover:bg-red-700"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  title="Batal"
                  aria-label="Batal"
                  className="p-1 rounded bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* Full-Width Excel-Style Sheet Designer */}
      <ExcelSheetEditor
        sheet={sheet}
        mode="template"
        historyKey={draft.id}
        onChange={handleSheetChange}
        onNotify={onNotify}
      />
    </div>
  );
}
