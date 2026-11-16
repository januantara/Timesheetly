import type {
  ActivityEntry,
  AppSettings,
  BackupPayload,
  SavedExportReport,
  VendorProfile,
} from '../types';
import {
  DEFAULT_PROFILE_NAME,
  INITIAL_ACTIVITIES,
  INITIAL_VENDOR_PROFILES,
} from './seedData';

const DB_NAME = 'CatatKerjaIndexedDB';
const DB_VERSION = 2;

const STORE_ACTIVITIES = 'activities';
const STORE_VENDORS = 'vendor_profiles';
const STORE_SETTINGS = 'app_settings';
const STORE_EXPORTS = 'saved_exports';

let dbInstance: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_ACTIVITIES)) {
        const activityStore = db.createObjectStore(STORE_ACTIVITIES, { keyPath: 'id' });
        activityStore.createIndex('date', 'date', { unique: false });
        activityStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_VENDORS)) {
        db.createObjectStore(STORE_VENDORS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_EXPORTS)) {
        const exportsStore = db.createObjectStore(STORE_EXPORTS, { keyPath: 'id' });
        exportsStore.createIndex('ownerAccount', 'ownerAccount', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Gagal membuka database IndexedDB.'));
    };
  });
}

function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as T[]) ?? []);
        req.onerror = () => reject(req.error ?? new Error(`Gagal membaca store ${storeName}.`));
      })
  );
}

function putInStore<T>(storeName: string, value: T): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error(`Gagal menyimpan ke store ${storeName}.`));
      })
  );
}

function deleteFromStore(storeName: string, key: string): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error(`Gagal menghapus dari store ${storeName}.`));
      })
  );
}

function getFromStore<T>(storeName: string, key: string): Promise<T | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error ?? new Error(`Gagal mengambil data ${key}.`));
      })
  );
}

function clearAndSeedStore<T>(storeName: string, items: T[]): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error(`Gagal mengisi ulang store ${storeName}.`));
      })
  );
}

export function sortSavedExportsDescending(items: SavedExportReport[]): SavedExportReport[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const CURRENT_MIGRATION_VERSION = 4;

function removeSheetColumn(sheet: NonNullable<VendorProfile['sheetTemplate']>, colToRemove: number) {
  if (sheet.colWidths.length <= 1) return sheet;
  const colWidths = sheet.colWidths.filter((_, idx) => idx !== colToRemove);
  const cells: typeof sheet.cells = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (Number.isNaN(r) || Number.isNaN(c) || c === colToRemove) continue;
    const nextC = c > colToRemove ? c - 1 : c;
    cells[`${r},${nextC}`] = cell;
  }
  const merges = sheet.merges
    .map((m) => {
      if (m.endCol < colToRemove) return m;
      if (m.startCol > colToRemove) {
        return { ...m, startCol: m.startCol - 1, endCol: m.endCol - 1 };
      }
      // Merge spans colToRemove
      const nextEnd = Math.max(m.startCol, m.endCol - 1);
      return { ...m, endCol: nextEnd };
    })
    .filter((m) => m.endRow > m.startRow || m.endCol > m.startCol);

  return {
    ...sheet,
    colWidths,
    cells,
    merges,
  };
}

function migrateLegacyVendors(vendors: VendorProfile[]): VendorProfile[] {
  return vendors.map((vendor) => {
    const nextColumns = vendor.columns
      .filter(
        (col) =>
          !(col.sourceType === 'custom' && col.sourceKey === 'no_tiket') &&
          col.headerLabel.trim().toLowerCase() !== 'no. work order'
      )
      .map((col) => {
        const lbl = col.headerLabel.trim().toLowerCase();
        if (
          col.sourceKey === 'project' &&
          (lbl === 'lokasi / site' || lbl === 'proyek / site')
        ) {
          return { ...col, headerLabel: 'Project Name' };
        }
        if (
          col.sourceKey === 'category' &&
          (lbl === 'kategori' || lbl === 'workstream')
        ) {
          return { ...col, headerLabel: 'Project Code' };
        }
        if (
          col.sourceKey === 'status' &&
          (lbl === 'status' || lbl === 'progress' || lbl === 'kondisi')
        ) {
          return { ...col, headerLabel: 'Aplikasi Berdampak' };
        }
        return col;
      });

    let nextSheet = vendor.sheetTemplate ? structuredClone(vendor.sheetTemplate) : undefined;
    if (nextSheet) {
      // Find columns dedicated to No. Work Order / {{custom:no_tiket}}
      const colsToDrop: number[] = [];
      for (let c = 0; c < nextSheet.colWidths.length; c++) {
        let hasWo = false;
        for (let r = 0; r < nextSheet.rowHeights.length; r++) {
          const val = nextSheet.cells[`${r},${c}`]?.value?.trim() ?? '';
          if (
            /\{\{custom:no_tiket\}\}/i.test(val) ||
            val.toLowerCase() === 'no. work order'
          ) {
            hasWo = true;
            break;
          }
        }
        if (hasWo) colsToDrop.push(c);
      }
      for (let i = colsToDrop.length - 1; i >= 0; i--) {
        nextSheet = removeSheetColumn(nextSheet, colsToDrop[i]);
      }

      // Rename legacy cell labels & tokens
      for (const key of Object.keys(nextSheet.cells)) {
        const cell = nextSheet.cells[key];
        let val = cell.value;
        const trimmedLower = val.trim().toLowerCase();
        if (trimmedLower === 'lokasi / site' || trimmedLower === 'proyek / site') {
          val = 'Project Name';
        } else if (trimmedLower === 'kategori' || trimmedLower === 'workstream') {
          val = 'Project Code';
        } else if (
          trimmedLower === 'status' ||
          trimmedLower === 'progress' ||
          trimmedLower === 'kondisi'
        ) {
          val = 'Aplikasi Berdampak';
        }
        val = val
          .replace(/\{\{proyek\}\}/gi, '{{project_name}}')
          .replace(/\{\{kategori\}\}/gi, '{{project_code}}')
          .replace(/\{\{status\}\}/gi, '{{aplikasi_berdampak}}');

        if (val !== cell.value) {
          nextSheet.cells[key] = { ...cell, value: val };
        }
      }
    }

    return {
      ...vendor,
      columns: nextColumns,
      sheetTemplate: nextSheet,
    };
  });
}

function migrateLegacyActivities(activities: ActivityEntry[]): ActivityEntry[] {
  const seedById = new Map(INITIAL_ACTIVITIES.map((item) => [item.id, item]));
  const legacyStatuses = new Set(['selesai', 'proses', 'tertunda']);

  return activities.map((act) => {
    const nextCustom = { ...(act.customValues ?? {}) };
    if ('no_tiket' in nextCustom) {
      delete nextCustom.no_tiket;
    }

    let nextProject = act.project;
    let nextCategory = act.category;
    let nextStatus = act.status;

    const normalizedStatus = (act.status ?? '').trim().toLowerCase();
    if (legacyStatuses.has(normalizedStatus)) {
      const seedMatch = seedById.get(act.id);
      if (seedMatch) {
        nextProject = seedMatch.project;
        nextCategory = seedMatch.category;
        nextStatus = seedMatch.status;
      } else {
        nextStatus = '';
      }
    }

    return {
      ...act,
      project: nextProject,
      category: nextCategory,
      status: nextStatus,
      customValues: nextCustom,
    };
  });
}

function migrateLegacyDefaultProfile(
  activities: ActivityEntry[],
  exportsList: SavedExportReport[],
  settings: AppSettings
): {
  activities: ActivityEntry[];
  exportsList: SavedExportReport[];
  settings: AppSettings;
} {
  const seedIds = new Set(INITIAL_ACTIVITIES.map((item) => item.id));
  const nextActivities = activities.map((act) => {
    const picLower = (act.pic ?? '').trim().toLowerCase();
    if (
      picLower === 'raka pratama' ||
      (seedIds.has(act.id) && picLower === 'dina kusuma')
    ) {
      return { ...act, pic: DEFAULT_PROFILE_NAME };
    }
    return act;
  });

  const nextExports = exportsList.map((exp) => {
    const ownerLower = (exp.ownerAccount ?? '').trim().toLowerCase();
    if (ownerLower === 'raka pratama') {
      return { ...exp, ownerAccount: DEFAULT_PROFILE_NAME };
    }
    return exp;
  });

  const hasRemainingDina = nextActivities.some(
    (act) => act.pic.trim().toLowerCase() === 'dina kusuma'
  );

  const currentDefault = (settings.defaultPicName ?? '').trim();
  const nextDefaultPicName =
    !currentDefault || currentDefault.toLowerCase() === 'raka pratama'
      ? DEFAULT_PROFILE_NAME
      : currentDefault;

  const dedupedProfiles: string[] = [];
  const seen = new Set<string>();
  const addProfile = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (lower === 'raka pratama') {
      addProfile(DEFAULT_PROFILE_NAME);
      return;
    }
    if (lower === 'dina kusuma' && !hasRemainingDina) {
      return;
    }
    if (!seen.has(lower)) {
      seen.add(lower);
      dedupedProfiles.push(trimmed);
    }
  };

  addProfile(nextDefaultPicName);
  for (const p of settings.savedProfiles ?? []) {
    addProfile(p);
  }

  return {
    activities: nextActivities,
    exportsList: nextExports,
    settings: {
      ...settings,
      defaultPicName: nextDefaultPicName,
      savedProfiles: dedupedProfiles,
    },
  };
}

export async function initializeAndLoadData(): Promise<{
  activities: ActivityEntry[];
  vendorProfiles: VendorProfile[];
  savedExports: SavedExportReport[];
  settings: AppSettings;
}> {
  const [existingSettings, existingVendors, existingActivities, existingExports] =
    await Promise.all([
      getFromStore<AppSettings>(STORE_SETTINGS, 'default'),
      getAllFromStore<VendorProfile>(STORE_VENDORS),
      getAllFromStore<ActivityEntry>(STORE_ACTIVITIES),
      getAllFromStore<SavedExportReport>(STORE_EXPORTS),
    ]);

  let vendors = existingVendors;
  let activities = existingActivities;
  let savedExports = existingExports;
  let settings = existingSettings;

  // Seed initial sample profiles and activities only on very first launch
  if (!settings && vendors.length === 0 && activities.length === 0) {
    vendors = INITIAL_VENDOR_PROFILES;
    activities = INITIAL_ACTIVITIES;
    settings = {
      id: 'default',
      activeVendorId: INITIAL_VENDOR_PROFILES[0].id,
      defaultPicName: DEFAULT_PROFILE_NAME,
      savedProfiles: [DEFAULT_PROFILE_NAME],
      migrationVersion: CURRENT_MIGRATION_VERSION,
    };

    await Promise.all([
      clearAndSeedStore(STORE_VENDORS, vendors),
      clearAndSeedStore(STORE_ACTIVITIES, activities),
      putInStore(STORE_SETTINGS, settings),
    ]);
  } else {
    if (vendors.length === 0) {
      vendors = INITIAL_VENDOR_PROFILES;
      await clearAndSeedStore(STORE_VENDORS, vendors);
    }
    if (!settings) {
      settings = {
        id: 'default',
        activeVendorId: vendors[0]?.id ?? '',
        defaultPicName: DEFAULT_PROFILE_NAME,
        savedProfiles: [DEFAULT_PROFILE_NAME],
      };
      await putInStore(STORE_SETTINGS, settings);
    }

    const prevVersion = settings.migrationVersion ?? 0;
    if (prevVersion < CURRENT_MIGRATION_VERSION) {
      if (prevVersion < 3) {
        vendors = migrateLegacyVendors(vendors);
        activities = migrateLegacyActivities(activities);
      }
      if (prevVersion < 4) {
        const migrated = migrateLegacyDefaultProfile(activities, savedExports, settings);
        activities = migrated.activities;
        savedExports = migrated.exportsList;
        settings = migrated.settings;
      }
      settings = {
        ...settings,
        migrationVersion: CURRENT_MIGRATION_VERSION,
      };
      await Promise.all([
        clearAndSeedStore(STORE_VENDORS, vendors),
        clearAndSeedStore(STORE_ACTIVITIES, activities),
        clearAndSeedStore(STORE_EXPORTS, savedExports),
        putInStore(STORE_SETTINGS, settings),
      ]);
    }
  }

  return {
    activities: sortActivitiesDescending(activities),
    vendorProfiles: vendors,
    savedExports: sortSavedExportsDescending(savedExports),
    settings,
  };
}

export function sortActivitiesDescending(items: ActivityEntry[]): ActivityEntry[] {
  return [...items].sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = b.startTime.localeCompare(a.startTime);
    if (timeDiff !== 0) return timeDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function saveActivity(entry: ActivityEntry): Promise<void> {
  await putInStore(STORE_ACTIVITIES, entry);
}

export async function saveActivitiesBatch(entries: ActivityEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIVITIES, 'readwrite');
    const store = tx.objectStore(STORE_ACTIVITIES);
    for (const entry of entries) {
      store.put(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menyimpan batch aktivitas.'));
  });
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteFromStore(STORE_ACTIVITIES, id);
}

export async function deleteActivitiesBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIVITIES, 'readwrite');
    const store = tx.objectStore(STORE_ACTIVITIES);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menghapus aktivitas terpilih.'));
  });
}

export async function saveVendorProfile(profile: VendorProfile): Promise<void> {
  await putInStore(STORE_VENDORS, profile);
}

export async function deleteVendorProfile(id: string): Promise<void> {
  await deleteFromStore(STORE_VENDORS, id);
}

export async function saveExportReport(report: SavedExportReport): Promise<void> {
  await putInStore(STORE_EXPORTS, report);
}

export async function deleteSavedExport(id: string): Promise<void> {
  await deleteFromStore(STORE_EXPORTS, id);
}

export async function deleteSavedExportsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EXPORTS, 'readwrite');
    const store = tx.objectStore(STORE_EXPORTS);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menghapus riwayat ekspor terpilih.'));
  });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await putInStore(STORE_SETTINGS, settings);
}

export async function restoreFullBackup(payload: BackupPayload): Promise<{
  activities: ActivityEntry[];
  vendorProfiles: VendorProfile[];
  savedExports: SavedExportReport[];
  settings: AppSettings;
}> {
  let activities = Array.isArray(payload.activities) ? payload.activities : [];
  let vendorProfiles =
    Array.isArray(payload.vendorProfiles) && payload.vendorProfiles.length > 0
      ? payload.vendorProfiles
      : INITIAL_VENDOR_PROFILES;
  const savedExports = Array.isArray(payload.savedExports) ? payload.savedExports : [];

  let settings: AppSettings = payload.settings ?? {
    id: 'default',
    activeVendorId: vendorProfiles[0].id,
    defaultPicName: DEFAULT_PROFILE_NAME,
    savedProfiles: [DEFAULT_PROFILE_NAME],
  };

  if ((settings.migrationVersion ?? 0) < CURRENT_MIGRATION_VERSION) {
    vendorProfiles = migrateLegacyVendors(vendorProfiles);
    activities = migrateLegacyActivities(activities);
    settings = {
      ...settings,
      migrationVersion: CURRENT_MIGRATION_VERSION,
    };
  }

  await Promise.all([
    clearAndSeedStore(STORE_ACTIVITIES, activities),
    clearAndSeedStore(STORE_VENDORS, vendorProfiles),
    clearAndSeedStore(STORE_EXPORTS, savedExports),
    putInStore(STORE_SETTINGS, settings),
  ]);

  return {
    activities: sortActivitiesDescending(activities),
    vendorProfiles,
    savedExports: sortSavedExportsDescending(savedExports),
    settings,
  };
}

export async function resetToSampleData(): Promise<{
  activities: ActivityEntry[];
  vendorProfiles: VendorProfile[];
  savedExports: SavedExportReport[];
  settings: AppSettings;
}> {
  const settings: AppSettings = {
    id: 'default',
    activeVendorId: INITIAL_VENDOR_PROFILES[0].id,
    defaultPicName: DEFAULT_PROFILE_NAME,
    savedProfiles: [DEFAULT_PROFILE_NAME],
    migrationVersion: CURRENT_MIGRATION_VERSION,
  };

  await Promise.all([
    clearAndSeedStore(STORE_ACTIVITIES, INITIAL_ACTIVITIES),
    clearAndSeedStore(STORE_VENDORS, INITIAL_VENDOR_PROFILES),
    clearAndSeedStore(STORE_EXPORTS, []),
    putInStore(STORE_SETTINGS, settings),
  ]);

  return {
    activities: sortActivitiesDescending(INITIAL_ACTIVITIES),
    vendorProfiles: INITIAL_VENDOR_PROFILES,
    savedExports: [],
    settings,
  };
}
