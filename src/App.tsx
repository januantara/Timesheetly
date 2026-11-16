import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut, Menu, Trash2 } from 'lucide-react';
import { ActivitiesView } from './components/ActivitiesView';
import { ActivityModal } from './components/ActivityModal';
import { BackupModal } from './components/BackupModal';
import { DeleteAccountModal } from './components/DeleteAccountModal';
import { ExportPreviewView } from './components/ExportPreviewView';
import { ExportVendorModal } from './components/ExportVendorModal';
import { ImportActivitiesModal } from './components/ImportActivitiesModal';
import {
  MergeActivityModal,
  type ActivityDateConflict,
} from './components/MergeActivityModal';
import { ProfileLoginView } from './components/ProfileLoginView';
import { Sidebar } from './components/Sidebar';
import { Toast, type ToastMessage } from './components/Toast';
import { VendorTemplatesView } from './components/VendorTemplatesView';
import { buildActivityExtractionPrompt } from './lib/activityImport';
import {
  deleteActivitiesBatch,
  deleteActivity,
  deleteSavedExport,
  deleteSavedExportsBatch,
  deleteVendorProfile,
  initializeAndLoadData,
  resetToSampleData,
  restoreFullBackup,
  saveActivitiesBatch,
  saveActivity,
  saveExportReport,
  saveSettings,
  saveVendorProfile,
  sortActivitiesAscending,
  sortSavedExportsDescending,
} from './lib/db';
import {
  HOLIDAY_ROW_COLOR,
  mergeActivityEntries,
  type DigiHcParsedRecord,
} from './lib/digihcImport';
import { calculateDurationMinutes, filterActivities } from './lib/formatters';
import { ASSET_PATHS, DEFAULT_PROFILE_NAME } from './lib/seedData';
import { buildLoopedSheetFromTemplate } from './lib/sheetTemplate';
import type {
  ActivityEntry,
  ActivityFilterState,
  AppSettings,
  AppView,
  BackupPayload,
  DateDisplayFormat,
  SavedExportReport,
  TimeDisplayFormat,
  VendorProfile,
} from './types';

function getAccountInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentView, setCurrentView] = useState<AppView>('activities');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [vendorProfiles, setVendorProfiles] = useState<VendorProfile[]>([]);
  const [savedExports, setSavedExports] = useState<SavedExportReport[]>([]);
  const [activeExportId, setActiveExportId] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings>({
    id: 'default',
    activeVendorId: '',
    defaultPicName: DEFAULT_PROFILE_NAME,
  });

  const [filter, setFilter] = useState<ActivityFilterState>({
    search: '',
    datePreset: 'bulan_ini',
    startDate: '',
    endDate: '',
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ActivityEntry | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingSingleMerge, setPendingSingleMerge] = useState<{
    existing: ActivityEntry;
    incoming: ActivityEntry;
    editingOriginalId?: string;
  } | null>(null);
  const [pendingBatchMerge, setPendingBatchMerge] = useState<{
    conflicts: ActivityDateConflict[];
    autoUpserts: ActivityEntry[];
    brandNew: ActivityEntry[];
  } | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState('');
  const [profileAvatarError, setProfileAvatarError] = useState(false);
  const [deleteTargetAccount, setDeleteTargetAccount] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const accountMenuRef = useRef<HTMLDivElement>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setToast({ id, type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4000);
  };

  useEffect(() => {
    let active = true;
    initializeAndLoadData()
      .then((data) => {
        if (!active) return;
        setActivities(data.activities);
        setVendorProfiles(data.vendorProfiles);
        setSavedExports(data.savedExports);
        setSettings(data.settings);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Gagal membuka database IndexedDB pada browser.'
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    if (accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen]);

  const normalizedActiveAccount = settings.defaultPicName.trim().toLowerCase();

  // Strict per-account activity & export isolation
  const ownActivities = useMemo(() => {
    if (!normalizedActiveAccount) return activities;
    return activities.filter(
      (item) => item.pic.trim().toLowerCase() === normalizedActiveAccount
    );
  }, [activities, normalizedActiveAccount]);

  const visibleOwnActivitiesCount = useMemo(
    () =>
      ownActivities.filter((item) => !item.isHoliday || item.activity.trim().length > 0)
        .length,
    [ownActivities]
  );

  const ownSavedExports = useMemo(() => {
    if (!normalizedActiveAccount) return savedExports;
    return savedExports.filter(
      (item) => item.ownerAccount.trim().toLowerCase() === normalizedActiveAccount
    );
  }, [savedExports, normalizedActiveAccount]);

  const activeDateFormat: DateDisplayFormat = settings.dateFormat ?? 'yyyy-mm-dd';
  const activeTimeFormat: TimeDisplayFormat = settings.timeFormat ?? 'HH:mm';

  const filteredActivities = useMemo(
    () =>
      filterActivities(
        activities,
        filter,
        settings.defaultPicName,
        activeDateFormat,
        activeTimeFormat
      ),
    [activities, filter, settings.defaultPicName, activeDateFormat, activeTimeFormat]
  );

  const exportFilteredActivities = useMemo(
    () =>
      filterActivities(
        activities,
        filter,
        settings.defaultPicName,
        activeDateFormat,
        activeTimeFormat,
        { includeEmptyHolidays: true }
      ),
    [activities, filter, settings.defaultPicName, activeDateFormat, activeTimeFormat]
  );

  const selectedActivities = useMemo(
    () => filteredActivities.filter((a) => selectedIds.has(a.id)),
    [filteredActivities, selectedIds]
  );

  const activitiesForExport = useMemo(() => {
    if (selectedActivities.length === 0) {
      return exportFilteredActivities;
    }

    const allVisibleSelected =
      filteredActivities.length > 0 &&
      selectedActivities.length === filteredActivities.length;

    if (allVisibleSelected) {
      return exportFilteredActivities;
    }

    const selectedDates = selectedActivities.map((a) => a.date).sort();
    const minDate = selectedDates[0];
    const maxDate = selectedDates[selectedDates.length - 1];
    const selectedIdSet = new Set(selectedActivities.map((a) => a.id));

    const hiddenHolidaysInSpan = exportFilteredActivities.filter(
      (item) =>
        !selectedIdSet.has(item.id) &&
        item.isHoliday &&
        !item.activity.trim() &&
        item.date >= minDate &&
        item.date <= maxDate
    );

    if (hiddenHolidaysInSpan.length === 0) {
      return selectedActivities;
    }

    return sortActivitiesAscending([
      ...selectedActivities,
      ...hiddenHolidaysInSpan,
    ]);
  }, [selectedActivities, filteredActivities, exportFilteredActivities]);

  const knownAccounts = useMemo(() => {
    const map = new Map<string, string>();
    const add = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) map.set(key, trimmed);
    };
    add(settings.defaultPicName);
    for (const p of settings.savedProfiles ?? []) add(p);
    for (const a of activities) add(a.pic);
    return Array.from(map.values());
  }, [activities, settings.defaultPicName, settings.savedProfiles]);

  const knownAccountSummaries = useMemo(
    () =>
      knownAccounts.map((name) => {
        const lower = name.trim().toLowerCase();
        const activityCount = activities.filter(
          (a) => a.pic.trim().toLowerCase() === lower
        ).length;
        return { name, activityCount };
      }),
    [knownAccounts, activities]
  );

  const isLoggedIn = settings.isLoggedIn !== false;

  const activeVendor = useMemo(
    () => vendorProfiles.find((v) => v.id === settings.activeVendorId) ?? vendorProfiles[0],
    [vendorProfiles, settings.activeVendorId]
  );

  const handleSelectDefaultVendor = async (vendorId: string) => {
    const nextSettings: AppSettings = { ...settings, activeVendorId: vendorId };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
  };

  const handleUpdateDisplayFormats = async (next: {
    dateFormat: DateDisplayFormat;
    timeFormat: TimeDisplayFormat;
  }) => {
    const nextSettings: AppSettings = {
      ...settings,
      dateFormat: next.dateFormat,
      timeFormat: next.timeFormat,
    };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    showNotify('success', `Format diperbarui (${next.dateFormat.toUpperCase()} · ${next.timeFormat}).`);
  };

  const savedCustomKeys = settings.savedCustomKeys ?? [];

  const handleSaveCustomKey = async (rawKey: string) => {
    const trimmed = rawKey.trim();
    if (!trimmed) return;
    const exists = savedCustomKeys.some(
      (k) => k.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      showNotify('success', `Key "${trimmed}" sudah tersimpan.`);
      return;
    }
    const nextKeys = [...savedCustomKeys, trimmed];
    const nextSettings: AppSettings = {
      ...settings,
      savedCustomKeys: nextKeys,
    };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    showNotify('success', `Key "${trimmed}" disimpan untuk tambah activity berikutnya.`);
  };

  const handleRemoveCustomKey = async (rawKey: string) => {
    const targetLower = rawKey.trim().toLowerCase();
    const nextKeys = savedCustomKeys.filter(
      (k) => k.trim().toLowerCase() !== targetLower
    );
    const nextSettings: AppSettings = {
      ...settings,
      savedCustomKeys: nextKeys,
    };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    showNotify('success', `Key "${rawKey}" dihapus dari daftar tersimpan.`);
  };

  const handleSwitchAccount = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const prevProfiles = settings.savedProfiles ?? [];
    const hasProfile = prevProfiles.some(
      (p) => p.trim().toLowerCase() === trimmed.toLowerCase()
    );
    const nextProfiles = hasProfile ? prevProfiles : [...prevProfiles, trimmed];
    const nextSettings: AppSettings = {
      ...settings,
      defaultPicName: trimmed,
      savedProfiles: nextProfiles,
      isLoggedIn: true,
    };
    setSettings(nextSettings);
    setSelectedIds(new Set());
    setActiveExportId('');
    setAccountMenuOpen(false);
    await saveSettings(nextSettings);
    showNotify('success', `Masuk ke profil ${trimmed}.`);
  };

  const handleLogout = async () => {
    const currentName = settings.defaultPicName.trim();
    const prevProfiles = settings.savedProfiles ?? [];
    const hasProfile =
      currentName &&
      prevProfiles.some((p) => p.trim().toLowerCase() === currentName.toLowerCase());
    const nextProfiles =
      currentName && !hasProfile ? [...prevProfiles, currentName] : prevProfiles;
    const nextSettings: AppSettings = {
      ...settings,
      savedProfiles: nextProfiles,
      isLoggedIn: false,
    };
    setSettings(nextSettings);
    setSelectedIds(new Set());
    setActiveExportId('');
    setAccountMenuOpen(false);
    setActivityModalOpen(false);
    setImportModalOpen(false);
    setExportModalOpen(false);
    setBackupModalOpen(false);
    setCurrentView('activities');
    await saveSettings(nextSettings);
    showNotify('success', `Berhasil logout dari profil ${currentName || 'aktif'}.`);
  };

  const handleRequestDeleteAccount = (accountName: string) => {
    const trimmed = accountName.trim();
    if (!trimmed) return;
    setAccountMenuOpen(false);
    setDeleteTargetAccount(trimmed);
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deleteTargetAccount || isDeletingAccount) return;
    const targetName = deleteTargetAccount.trim();
    const targetLower = targetName.toLowerCase();
    setIsDeletingAccount(true);

    try {
      const activityIdsToDelete = activities
        .filter((a) => a.pic.trim().toLowerCase() === targetLower)
        .map((a) => a.id);
      const exportIdsToDelete = savedExports
        .filter((e) => e.ownerAccount.trim().toLowerCase() === targetLower)
        .map((e) => e.id);

      const remainingAccounts = knownAccounts.filter(
        (acc) => acc.trim().toLowerCase() !== targetLower
      );
      const isDeletingActive =
        settings.defaultPicName.trim().toLowerCase() === targetLower;

      const nextSettings: AppSettings = {
        ...settings,
        defaultPicName: isDeletingActive
          ? (remainingAccounts[0] ?? '')
          : settings.defaultPicName,
        savedProfiles: remainingAccounts,
        isLoggedIn: isDeletingActive ? false : settings.isLoggedIn,
      };

      await Promise.all([
        deleteActivitiesBatch(activityIdsToDelete),
        deleteSavedExportsBatch(exportIdsToDelete),
        saveSettings(nextSettings),
      ]);

      const activityDeleteSet = new Set(activityIdsToDelete);
      const exportDeleteSet = new Set(exportIdsToDelete);

      setActivities((prev) => prev.filter((a) => !activityDeleteSet.has(a.id)));
      setSavedExports((prev) => prev.filter((e) => !exportDeleteSet.has(e.id)));
      setSettings(nextSettings);

      if (exportDeleteSet.has(activeExportId)) {
        setActiveExportId('');
      }
      if (isDeletingActive) {
        setSelectedIds(new Set());
        setActiveExportId('');
        setActivityModalOpen(false);
        setImportModalOpen(false);
        setExportModalOpen(false);
        setBackupModalOpen(false);
        setCurrentView('activities');
      }

      setDeleteTargetAccount(null);
      showNotify('success', `Akun "${targetName}" berhasil dihapus.`);
    } catch (err) {
      showNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal menghapus akun.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleSaveActivity = async (entry: ActivityEntry): Promise<boolean> => {
    // Enforce active account ownership when saving from current session
    const ownedEntry: ActivityEntry = {
      ...entry,
      pic: entry.pic.trim() || settings.defaultPicName,
    };

    const picLower = ownedEntry.pic.trim().toLowerCase();
    const existingSameDate = activities.find(
      (item) =>
        item.pic.trim().toLowerCase() === picLower &&
        item.date === ownedEntry.date &&
        item.id !== ownedEntry.id
    );

    if (existingSameDate) {
      if (existingSameDate.activity.trim() && ownedEntry.activity.trim()) {
        setPendingSingleMerge({
          existing: existingSameDate,
          incoming: ownedEntry,
          editingOriginalId: editingEntry?.id,
        });
        return false;
      }

      // Existing entry on that date has empty activity (e.g. DigiHC check-in/out or LIB placeholder), or incoming is an empty holiday flag: upsert cleanly
      const resolvedHoliday =
        ownedEntry.isHoliday !== undefined
          ? ownedEntry.isHoliday
          : existingSameDate.isHoliday;
      const upserted: ActivityEntry = {
        ...ownedEntry,
        id: existingSameDate.id,
        activity: ownedEntry.activity.trim() || existingSameDate.activity,
        remark: ownedEntry.activity.trim() || existingSameDate.remark,
        createdAt: existingSameDate.createdAt,
        isHoliday: resolvedHoliday || undefined,
        rowColor: resolvedHoliday ? HOLIDAY_ROW_COLOR : undefined,
        attAbsenFlag: resolvedHoliday
          ? 'LIB'
          : ownedEntry.attAbsenFlag ?? existingSameDate.attAbsenFlag,
      };
      await saveActivity(upserted);
      if (editingEntry && editingEntry.id !== existingSameDate.id) {
        await deleteActivity(editingEntry.id);
      }
      setActivities((prev) =>
        sortActivitiesAscending(
          prev
            .filter((item) => item.id !== editingEntry?.id || item.id === existingSameDate.id)
            .map((item) => (item.id === existingSameDate.id ? upserted : item))
        )
      );
      showNotify(
        'success',
        upserted.isHoliday && !upserted.activity.trim()
          ? 'Hari libur disimpan.'
          : 'Aktivitas timesheet disimpan (upsert) ke tanggal tersebut.'
      );
      return true;
    }

    await saveActivity(ownedEntry);
    setActivities((prev) => {
      const exists = prev.some((item) => item.id === ownedEntry.id);
      const next = exists
        ? prev.map((item) => (item.id === ownedEntry.id ? ownedEntry : item))
        : [...prev, ownedEntry];
      return sortActivitiesAscending(next);
    });
    if (ownedEntry.pic && ownedEntry.pic !== settings.defaultPicName) {
      const nextSettings: AppSettings = { ...settings, defaultPicName: ownedEntry.pic };
      setSettings(nextSettings);
      await saveSettings(nextSettings);
    }
    showNotify(
      'success',
      ownedEntry.isHoliday && !ownedEntry.activity.trim()
        ? 'Hari libur disimpan.'
        : 'Aktivitas timesheet disimpan ke IndexedDB.'
    );
    return true;
  };

  const handleResolveSingleMerge = async (mode: 'merge' | 'replace') => {
    if (!pendingSingleMerge || mergeBusy) return;
    setMergeBusy(true);
    try {
      const { existing, incoming, editingOriginalId } = pendingSingleMerge;
      const nowIso = new Date().toISOString();
      const finalEntry: ActivityEntry =
        mode === 'merge'
          ? mergeActivityEntries(existing, incoming)
          : {
              ...incoming,
              id: existing.id,
              createdAt: existing.createdAt,
              isHoliday: existing.isHoliday,
              rowColor: existing.rowColor,
              attAbsenFlag: existing.attAbsenFlag,
              updatedAt: nowIso,
            };

      await saveActivity(finalEntry);
      if (editingOriginalId && editingOriginalId !== existing.id) {
        await deleteActivity(editingOriginalId);
      }

      setActivities((prev) =>
        sortActivitiesAscending(
          prev
            .filter((item) => !editingOriginalId || item.id !== editingOriginalId || item.id === existing.id)
            .map((item) => (item.id === existing.id ? finalEntry : item))
        )
      );

      setPendingSingleMerge(null);
      setActivityModalOpen(false);
      setEditingEntry(null);
      showNotify(
        'success',
        mode === 'merge'
          ? `Aktivitas tanggal ${existing.date} berhasil di-merge.`
          : `Aktivitas tanggal ${existing.date} berhasil diperbarui.`
      );
    } catch {
      showNotify('error', 'Gagal menyimpan perubahan aktivitas.');
    } finally {
      setMergeBusy(false);
    }
  };

  const handleImportActivitiesBatch = async (
    entries: ActivityEntry[]
  ): Promise<boolean> => {
    const activePic = settings.defaultPicName.trim() || DEFAULT_PROFILE_NAME;
    const activePicLower = activePic.toLowerCase();

    // Deduplicate entries within the imported payload itself by date
    const dedupedByDate = new Map<string, ActivityEntry>();
    for (const rawEntry of entries) {
      const owned: ActivityEntry = {
        ...rawEntry,
        pic: rawEntry.pic.trim() || activePic,
      };
      const prevInBatch = dedupedByDate.get(owned.date);
      dedupedByDate.set(
        owned.date,
        prevInBatch ? mergeActivityEntries(prevInBatch, owned) : owned
      );
    }

    const existingByDate = new Map<string, ActivityEntry>();
    for (const item of activities) {
      if (item.pic.trim().toLowerCase() === activePicLower && !existingByDate.has(item.date)) {
        existingByDate.set(item.date, item);
      }
    }

    const conflicts: ActivityDateConflict[] = [];
    const autoUpserts: ActivityEntry[] = [];
    const brandNew: ActivityEntry[] = [];

    for (const incoming of dedupedByDate.values()) {
      const existing = existingByDate.get(incoming.date);
      if (!existing) {
        brandNew.push(incoming);
      } else if (!existing.activity.trim()) {
        autoUpserts.push(mergeActivityEntries(existing, incoming));
      } else {
        conflicts.push({ existing, incoming });
      }
    }

    if (conflicts.length > 0) {
      setPendingBatchMerge({ conflicts, autoUpserts, brandNew });
      return false;
    }

    const toPersist = [...autoUpserts, ...brandNew];
    if (toPersist.length > 0) {
      await saveActivitiesBatch(toPersist);
      const byId = new Map(toPersist.map((item) => [item.id, item]));
      setActivities((prev) =>
        sortActivitiesAscending([
          ...prev.filter((item) => !byId.has(item.id)),
          ...toPersist,
        ])
      );
    }
    showNotify(
      'success',
      `${toPersist.length} aktivitas berhasil disimpan ke IndexedDB.`
    );
    return true;
  };

  const handleResolveBatchMerge = async (mode: 'merge' | 'replace' | 'skip') => {
    if (!pendingBatchMerge || mergeBusy) return;
    setMergeBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { conflicts, autoUpserts, brandNew } = pendingBatchMerge;
      const resolvedConflicts: ActivityEntry[] =
        mode === 'skip'
          ? []
          : conflicts.map(({ existing, incoming }) =>
              mode === 'merge'
                ? mergeActivityEntries(existing, incoming)
                : {
                    ...incoming,
                    id: existing.id,
                    startTime: incoming.startTime || existing.startTime,
                    endTime: incoming.endTime || existing.endTime,
                    durationMinutes:
                      (incoming.startTime || existing.startTime) &&
                      (incoming.endTime || existing.endTime)
                        ? calculateDurationMinutes(
                            incoming.startTime || existing.startTime,
                            incoming.endTime || existing.endTime
                          )
                        : 0,
                    createdAt: existing.createdAt,
                    isHoliday: existing.isHoliday,
                    rowColor: existing.rowColor,
                    attAbsenFlag: existing.attAbsenFlag,
                    updatedAt: nowIso,
                  }
            );

      const toPersist = [...resolvedConflicts, ...autoUpserts, ...brandNew];
      if (toPersist.length > 0) {
        await saveActivitiesBatch(toPersist);
        const byId = new Map(toPersist.map((item) => [item.id, item]));
        setActivities((prev) =>
          sortActivitiesAscending([
            ...prev.filter((item) => !byId.has(item.id)),
            ...toPersist,
          ])
        );
      }

      setPendingBatchMerge(null);
      setImportModalOpen(false);
      showNotify(
        'success',
        toPersist.length > 0
          ? `${toPersist.length} aktivitas berhasil disimpan (upsert).`
          : 'Tidak ada aktivitas baru yang ditambahkan.'
      );
    } catch {
      showNotify('error', 'Gagal menyimpan hasil impor aktivitas.');
    } finally {
      setMergeBusy(false);
    }
  };

  const handleApplyDigiHcRecords = async (records: DigiHcParsedRecord[]) => {
    const activePic = settings.defaultPicName.trim() || DEFAULT_PROFILE_NAME;
    const activePicLower = activePic.toLowerCase();
    const nowIso = new Date().toISOString();

    const existingByDate = new Map<string, ActivityEntry>();
    for (const item of activities) {
      if (item.pic.trim().toLowerCase() === activePicLower && !existingByDate.has(item.date)) {
        existingByDate.set(item.date, item);
      }
    }

    const toPersist: ActivityEntry[] = [];
    records.forEach((rec, idx) => {
      const existing = existingByDate.get(rec.date);
      if (existing) {
        if (rec.isHoliday) {
          toPersist.push({
            ...existing,
            startTime: '08:00',
            endTime: '17:00',
            durationMinutes: calculateDurationMinutes('08:00', '17:00'),
            isHoliday: true,
            rowColor: HOLIDAY_ROW_COLOR,
            attAbsenFlag: 'LIB',
            updatedAt: nowIso,
          });
        } else {
          const nextStart = rec.startTime || existing.startTime;
          const nextEnd = rec.endTime || existing.endTime;
          const nextDur =
            nextStart && nextEnd ? calculateDurationMinutes(nextStart, nextEnd) : 0;
          toPersist.push({
            ...existing,
            startTime: nextStart,
            endTime: nextEnd,
            durationMinutes: nextDur,
            isHoliday: false,
            rowColor: undefined,
            attAbsenFlag: rec.attAbsenFlag,
            updatedAt: nowIso,
          });
        }
      } else {
        toPersist.push({
          id: `act-digihc-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          date: rec.date,
          startTime: rec.startTime,
          endTime: rec.endTime,
          durationMinutes: rec.durationMinutes,
          project: '',
          category: '',
          activity: '',
          remark: '',
          status: '',
          pic: activePic,
          isHoliday: rec.isHoliday || undefined,
          rowColor: rec.rowColor,
          attAbsenFlag: rec.attAbsenFlag,
          customValues: {},
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    });

    await saveActivitiesBatch(toPersist);
    const byId = new Map(toPersist.map((item) => [item.id, item]));
    setActivities((prev) =>
      sortActivitiesAscending([
        ...prev.filter((item) => !byId.has(item.id)),
        ...toPersist,
      ])
    );

    const holidayTotal = records.filter((r) => r.isHoliday).length;
    const workTotal = records.length - holidayTotal;
    showNotify(
      'success',
      `Data DigiHC diterapkan: ${workTotal} hari kerja dan ${holidayTotal} hari libur (LIB).`
    );
  };

  const handleCopyExtractionPrompt = async () => {
    const promptText = buildActivityExtractionPrompt({
      accountName: settings.defaultPicName,
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
    showNotify(
      'success',
      'Prompt disalin! Jalankan di root folder project lalu klik Impor untuk memasukkan hasilnya.'
    );
    setTimeout(() => setPromptCopied(false), 2200);
  };

  const handleDeleteActivity = async (id: string) => {
    await deleteActivity(id);
    setActivities((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showNotify('success', 'Aktivitas timesheet dihapus.');
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await deleteActivitiesBatch(ids);
    setActivities((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    showNotify('success', `${ids.length} aktivitas timesheet dihapus.`);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    const allSelected =
      filteredActivities.length > 0 &&
      filteredActivities.every((item) => selectedIds.has(item.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const item of filteredActivities) next.delete(item.id);
      } else {
        for (const item of filteredActivities) next.add(item.id);
      }
      return next;
    });
  };

  const handleSaveVendorProfile = async (profile: VendorProfile) => {
    await saveVendorProfile(profile);
    setVendorProfiles((prev) => {
      const exists = prev.some((v) => v.id === profile.id);
      return exists
        ? prev.map((v) => (v.id === profile.id ? profile : v))
        : [...prev, profile];
    });
    if (settings.activeVendorId !== profile.id) {
      await handleSelectDefaultVendor(profile.id);
    }
  };

  const handleDeleteVendorProfile = async (id: string) => {
    await deleteVendorProfile(id);
    const remaining = vendorProfiles.filter((v) => v.id !== id);
    setVendorProfiles(remaining);
    if (settings.activeVendorId === id && remaining[0]) {
      await handleSelectDefaultVendor(remaining[0].id);
    }
    showNotify('success', 'Profil vendor dihapus.');
  };

  const handleConfirmCreateExport = async ({
    vendor,
    title,
    periodLabel,
    preparedByName,
    approvedByName,
  }: {
    vendor: VendorProfile;
    title: string;
    periodLabel: string;
    preparedByName: string;
    approvedByName: string;
  }) => {
    const rowsToExport = activitiesForExport;
    const loopedSheet = buildLoopedSheetFromTemplate(vendor, rowsToExport, {
      periodLabel,
      preparedByName,
      approvedByName,
      dateFormat: activeDateFormat,
      timeFormat: activeTimeFormat,
    });

    const nowIso = new Date().toISOString();
    const newReport: SavedExportReport = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ownerAccount: settings.defaultPicName,
      title,
      vendorId: vendor.id,
      vendorName: vendor.vendorName,
      paperOrientation: vendor.paperOrientation,
      periodLabel,
      rowCount: rowsToExport.length,
      sheet: loopedSheet,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await saveExportReport(newReport);
    setSavedExports((prev) => sortSavedExportsDescending([newReport, ...prev]));
    setActiveExportId('');

    if (vendor.id !== settings.activeVendorId) {
      await handleSelectDefaultVendor(vendor.id);
    }

    setExportModalOpen(false);
    setCurrentView('export');
    showNotify('success', `Ekspor "${newReport.title}" disimpan ke Pratinjau.`);
  };

  const handleSaveEditedExport = async (updated: SavedExportReport) => {
    await saveExportReport(updated);
    setSavedExports((prev) =>
      sortSavedExportsDescending(
        prev.map((item) => (item.id === updated.id ? updated : item))
      )
    );
  };

  const handleDeleteSavedExport = async (id: string) => {
    await deleteSavedExport(id);
    setSavedExports((prev) => prev.filter((item) => item.id !== id));
    if (activeExportId === id) {
      setActiveExportId('');
    }
    showNotify('success', 'Riwayat hasil ekspor dihapus.');
  };

  const handleRestoreBackup = async (payload: BackupPayload) => {
    const data = await restoreFullBackup(payload);
    setActivities(data.activities);
    setVendorProfiles(data.vendorProfiles);
    setSavedExports(data.savedExports);
    setSettings(data.settings);
    setSelectedIds(new Set());
    setActiveExportId('');
  };

  const handleResetSample = async () => {
    const data = await resetToSampleData();
    setActivities(data.activities);
    setVendorProfiles(data.vendorProfiles);
    setSavedExports(data.savedExports);
    setSettings(data.settings);
    setSelectedIds(new Set());
    setActiveExportId('');
  };

  const viewTitleMap: Record<AppView, string> = {
    activities: 'Timesheet',
    vendors: 'Profil Template Vendor',
    export: 'Pratinjau & Ekspor Laporan',
  };

  const activitiesForExportModal = activitiesForExport;

  const deleteTargetStats = useMemo(() => {
    if (!deleteTargetAccount) {
      return { activityCount: 0, exportCount: 0, isActiveAccount: false };
    }
    const targetLower = deleteTargetAccount.trim().toLowerCase();
    return {
      activityCount: activities.filter(
        (a) => a.pic.trim().toLowerCase() === targetLower
      ).length,
      exportCount: savedExports.filter(
        (e) => e.ownerAccount.trim().toLowerCase() === targetLower
      ).length,
      isActiveAccount:
        isLoggedIn &&
        settings.defaultPicName.trim().toLowerCase() === targetLower,
    };
  }, [
    deleteTargetAccount,
    activities,
    savedExports,
    isLoggedIn,
    settings.defaultPicName,
  ]);

  if (!loading && !loadError && !isLoggedIn) {
    return (
      <>
        <ProfileLoginView
          accounts={knownAccountSummaries}
          lastAccountName={settings.defaultPicName}
          onLogin={handleSwitchAccount}
          onRequestDeleteAccount={handleRequestDeleteAccount}
        />
        <DeleteAccountModal
          open={Boolean(deleteTargetAccount)}
          accountName={deleteTargetAccount ?? ''}
          activityCount={deleteTargetStats.activityCount}
          exportCount={deleteTargetStats.exportCount}
          isActiveAccount={false}
          isDeleting={isDeletingAccount}
          onCancel={() => {
            if (!isDeletingAccount) setDeleteTargetAccount(null);
          }}
          onConfirm={handleConfirmDeleteAccount}
        />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'export') {
            setActiveExportId('');
          }
          setCurrentView(view);
        }}
        activityCount={visibleOwnActivitiesCount}
        vendorCount={vendorProfiles.length}
        savedExportCount={ownSavedExports.length}
        activeVendor={activeVendor}
        onOpenBackup={() => setBackupModalOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Navbar: Breadcrumb on Left + Active Account Profile on Right */}
        <header className="no-print sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-900 truncate">
              {viewTitleMap[currentView]}
            </h1>
          </div>

          {/* Account Profile Switcher */}
          <div className="relative shrink-0" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => {
                setAccountDraft(settings.defaultPicName);
                setAccountMenuOpen((v) => !v);
              }}
              className="inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
              aria-expanded={accountMenuOpen}
              aria-haspopup="true"
            >
              {!profileAvatarError ? (
                <img
                  src={ASSET_PATHS.profileDefault}
                  alt={settings.defaultPicName}
                  referrerPolicy="no-referrer"
                  onError={() => setProfileAvatarError(true)}
                  className="h-7 w-7 rounded-md border border-slate-200 bg-white object-cover shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-md bg-blue-600 text-white font-display text-xs font-bold flex items-center justify-center shrink-0">
                  {getAccountInitials(settings.defaultPicName)}
                </div>
              )}
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-slate-900 leading-tight max-w-[140px] truncate">
                  {settings.defaultPicName}
                </div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  Akun Pribadi
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            </button>

            {accountMenuOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3.5 space-y-3">
                <div className="pb-2.5 border-b border-slate-100">
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Profil Akun Aktif
                  </div>
                  <div className="mt-1 flex items-center gap-2.5">
                    {!profileAvatarError ? (
                      <img
                        src={ASSET_PATHS.profileDefault}
                        alt={settings.defaultPicName}
                        referrerPolicy="no-referrer"
                        onError={() => setProfileAvatarError(true)}
                        className="h-8 w-8 rounded-md border border-slate-200 bg-white object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-blue-600 text-white font-display text-xs font-bold flex items-center justify-center shrink-0">
                        {getAccountInitials(settings.defaultPicName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {settings.defaultPicName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {ownActivities.length} aktivitas tersimpan
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-500 mb-1.5">
                    Pilih Akun
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {knownAccounts.map((acc) => {
                      const isCurrent =
                        acc.trim().toLowerCase() === normalizedActiveAccount;
                      return (
                        <div key={acc} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSwitchAccount(acc)}
                            className={`flex-1 min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isCurrent
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              {!profileAvatarError ? (
                                <img
                                  src={ASSET_PATHS.profileDefault}
                                  alt={acc}
                                  referrerPolicy="no-referrer"
                                  onError={() => setProfileAvatarError(true)}
                                  className="h-5 w-5 rounded border border-slate-200 bg-white object-cover shrink-0"
                                />
                              ) : (
                                <span className="h-5 w-5 rounded bg-blue-600 text-white font-display text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {getAccountInitials(acc)}
                                </span>
                              )}
                              <span className="truncate">{acc}</span>
                            </span>
                            {isCurrent && <Check className="h-3.5 w-3.5 shrink-0" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRequestDeleteAccount(acc)}
                            title={`Hapus akun ${acc}`}
                            aria-label={`Hapus akun ${acc}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSwitchAccount(accountDraft);
                  }}
                  className="pt-2.5 border-t border-slate-100 space-y-1.5"
                >
                  <label className="block text-[11px] font-medium text-slate-500">
                    Masuk / Buat Akun Lain
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={accountDraft}
                      onChange={(e) => setAccountDraft(e.target.value)}
                      placeholder="Nama akun..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
                    >
                      Masuk
                    </button>
                  </div>
                </form>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-20 rounded-xl border border-slate-200 bg-white animate-pulse" />
              <div className="h-14 rounded-xl border border-slate-200 bg-white animate-pulse" />
              <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-white p-8 text-center max-w-lg mx-auto mt-12">
              <h2 className="font-display text-base font-semibold text-red-700">
                Gagal Membuka Database Lokal
              </h2>
              <p className="mt-2 text-sm text-slate-600">{loadError}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium"
              >
                Muat Ulang Halaman
              </button>
            </div>
          ) : currentView === 'activities' ? (
            <ActivitiesView
              ownActivitiesCount={visibleOwnActivitiesCount}
              exportableCount={exportFilteredActivities.length}
              selectedExportCount={activitiesForExport.length}
              filteredActivities={filteredActivities}
              filter={filter}
              onFilterChange={setFilter}
              activeAccountName={settings.defaultPicName}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAllFiltered={handleToggleSelectAllFiltered}
              onClearSelection={() => setSelectedIds(new Set())}
              onAddNew={() => {
                setEditingEntry(null);
                setActivityModalOpen(true);
              }}
              onEdit={(entry) => {
                setEditingEntry(entry);
                setActivityModalOpen(true);
              }}
              onDelete={handleDeleteActivity}
              onDeleteSelected={handleDeleteSelected}
              onOpenExportModal={() => setExportModalOpen(true)}
              onCopyPrompt={handleCopyExtractionPrompt}
              promptCopied={promptCopied}
              onOpenImportModal={() => setImportModalOpen(true)}
              dateFormat={activeDateFormat}
              timeFormat={activeTimeFormat}
              onChangeFormats={handleUpdateDisplayFormats}
            />
          ) : currentView === 'vendors' ? (
            <VendorTemplatesView
              vendorProfiles={vendorProfiles}
              activeVendorId={activeVendor?.id ?? ''}
              onSelectActiveVendor={handleSelectDefaultVendor}
              onSaveProfile={handleSaveVendorProfile}
              onDeleteProfile={handleDeleteVendorProfile}
              onNotify={showNotify}
            />
          ) : (
            <ExportPreviewView
              savedExports={ownSavedExports}
              activeExportId={activeExportId}
              onSelectExport={setActiveExportId}
              onSaveEditedExport={handleSaveEditedExport}
              onDeleteSavedExport={handleDeleteSavedExport}
              onGoToActivities={() => setCurrentView('activities')}
              activeAccountName={settings.defaultPicName}
              onNotify={showNotify}
            />
          )}
        </main>

        <footer className="no-print px-4 sm:px-6 py-3.5 border-t border-slate-200/80 bg-white/70 text-center text-xs text-slate-500">
          Copyright © {new Date().getFullYear()} by Januantara
        </footer>
      </div>

      <ActivityModal
        open={activityModalOpen}
        initialEntry={editingEntry}
        existingActivities={ownActivities}
        defaultPicName={settings.defaultPicName}
        dateFormat={activeDateFormat}
        vendorProfiles={vendorProfiles}
        savedCustomKeys={savedCustomKeys}
        onSaveCustomKey={handleSaveCustomKey}
        onRemoveCustomKey={handleRemoveCustomKey}
        onClose={() => {
          setActivityModalOpen(false);
          setEditingEntry(null);
        }}
        onSave={handleSaveActivity}
      />

      <ImportActivitiesModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        activeAccountName={settings.defaultPicName}
        filter={filter}
        savedCustomKeys={savedCustomKeys}
        existingActivities={ownActivities}
        dateFormat={activeDateFormat}
        timeFormat={activeTimeFormat}
        onImportEntries={handleImportActivitiesBatch}
        onApplyDigiHc={handleApplyDigiHcRecords}
        onNotify={showNotify}
      />

      <MergeActivityModal
        open={Boolean(pendingSingleMerge || pendingBatchMerge)}
        conflicts={
          pendingSingleMerge
            ? [
                {
                  existing: pendingSingleMerge.existing,
                  incoming: pendingSingleMerge.incoming,
                },
              ]
            : pendingBatchMerge?.conflicts ?? []
        }
        autoUpsertCount={pendingBatchMerge?.autoUpserts.length ?? 0}
        newCount={pendingBatchMerge?.brandNew.length ?? 0}
        dateFormat={activeDateFormat}
        timeFormat={activeTimeFormat}
        busy={mergeBusy}
        onMerge={() => {
          if (pendingSingleMerge) {
            return handleResolveSingleMerge('merge');
          }
          return handleResolveBatchMerge('merge');
        }}
        onReplace={() => {
          if (pendingSingleMerge) {
            return handleResolveSingleMerge('replace');
          }
          return handleResolveBatchMerge('replace');
        }}
        onSkipConflicts={
          pendingBatchMerge ? () => handleResolveBatchMerge('skip') : undefined
        }
        onCancel={() => {
          if (mergeBusy) return;
          setPendingSingleMerge(null);
          setPendingBatchMerge(null);
        }}
      />

      <ExportVendorModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        vendorProfiles={vendorProfiles}
        defaultVendorId={settings.activeVendorId || vendorProfiles[0]?.id || ''}
        activitiesToExport={activitiesForExportModal}
        activeAccountName={settings.defaultPicName}
        dateFormat={activeDateFormat}
        timeFormat={activeTimeFormat}
        onSelectDefaultVendor={handleSelectDefaultVendor}
        onSaveToPreview={handleConfirmCreateExport}
        onNotify={showNotify}
      />

      <BackupModal
        open={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        activities={activities}
        vendorProfiles={vendorProfiles}
        savedExports={savedExports}
        settings={settings}
        onRestoreBackup={handleRestoreBackup}
        onResetSample={handleResetSample}
        onNotify={showNotify}
      />

      <DeleteAccountModal
        open={Boolean(deleteTargetAccount)}
        accountName={deleteTargetAccount ?? ''}
        activityCount={deleteTargetStats.activityCount}
        exportCount={deleteTargetStats.exportCount}
        isActiveAccount={deleteTargetStats.isActiveAccount}
        isDeleting={isDeletingAccount}
        onCancel={() => {
          if (!isDeletingAccount) setDeleteTargetAccount(null);
        }}
        onConfirm={handleConfirmDeleteAccount}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
