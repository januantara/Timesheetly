import type {
  ActivityEntry,
  AppSettings,
  BackupPayload,
  SavedExportReport,
  VendorProfile,
} from '../types';
import { getActiveLanguage, pickLang } from './i18n';
import {
  getDefaultActiveVendorId,
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
      reject(
        request.error ??
          new Error(
            pickLang(
              getActiveLanguage(),
              'Failed to open IndexedDB database.',
              'Gagal membuka database IndexedDB.'
            )
          )
      );
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
        req.onerror = () =>
          reject(
            req.error ??
              new Error(
                pickLang(
                  getActiveLanguage(),
                  `Failed to read store ${storeName}.`,
                  `Gagal membaca data ${storeName}.`
                )
              )
          );
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
        tx.onerror = () =>
          reject(
            tx.error ??
              new Error(
                pickLang(
                  getActiveLanguage(),
                  `Failed to save to store ${storeName}.`,
                  `Gagal menyimpan ke ${storeName}.`
                )
              )
          );
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
        tx.onerror = () =>
          reject(
            tx.error ??
              new Error(
                pickLang(
                  getActiveLanguage(),
                  `Failed to delete from store ${storeName}.`,
                  `Gagal menghapus dari ${storeName}.`
                )
              )
          );
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
        req.onerror = () =>
          reject(
            req.error ??
              new Error(
                pickLang(
                  getActiveLanguage(),
                  `Failed to fetch record ${key}.`,
                  `Gagal mengambil data ${key}.`
                )
              )
          );
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
        tx.onerror = () =>
          reject(
            tx.error ??
              new Error(
                pickLang(
                  getActiveLanguage(),
                  `Failed to re-seed store ${storeName}.`,
                  `Gagal memperbarui data awal ${storeName}.`
                )
              )
          );
      })
  );
}

export function sortSavedExportsDescending(items: SavedExportReport[]): SavedExportReport[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const CURRENT_MIGRATION_VERSION = 8;

const LEGACY_STARTER_VENDOR_NAMES = new Map<string, string>([
  ['vendor-nusantara', 'pt nusantara infrastruktur'],
  ['vendor-cakrawala', 'pt cakrawala solusi digital'],
  ['vendor-mandala', 'cv mandala logistik terpadu'],
]);

function migrateDefaultVendorsV5(
  vendors: VendorProfile[],
  settings: AppSettings
): { vendors: VendorProfile[]; settings: AppSettings } {
  const retained = vendors.filter((v) => {
    const legacyName = LEGACY_STARTER_VENDOR_NAMES.get(v.id);
    if (!legacyName) return true;
    return v.vendorName.trim().toLowerCase() !== legacyName;
  });

  const existingIds = new Set(retained.map((v) => v.id));
  const existingNames = new Set(retained.map((v) => v.vendorName.trim().toLowerCase()));

  const additions: VendorProfile[] = [];
  for (const def of INITIAL_VENDOR_PROFILES) {
    const defName = def.vendorName.trim().toLowerCase();
    if (!existingIds.has(def.id) && !existingNames.has(defName)) {
      additions.push(structuredClone(def));
      existingIds.add(def.id);
      existingNames.add(defName);
    }
  }

  const nextVendors = [...additions, ...retained];
  const hasActive = nextVendors.some((v) => v.id === settings.activeVendorId);
  const nextSettings: AppSettings = hasActive
    ? settings
    : { ...settings, activeVendorId: getDefaultActiveVendorId(nextVendors) };

  return { vendors: nextVendors, settings: nextSettings };
}

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

  const loopRanges = Array.isArray(sheet.loopRanges)
    ? sheet.loopRanges
        .filter((lr) => !(lr.startCol === colToRemove && lr.endCol === colToRemove))
        .map((lr) => ({
          ...lr,
          startCol: lr.startCol > colToRemove ? lr.startCol - 1 : lr.startCol,
          endCol: lr.endCol >= colToRemove ? lr.endCol - 1 : lr.endCol,
        }))
        .filter((lr) => lr.endCol >= lr.startCol)
    : undefined;

  return {
    ...sheet,
    colWidths,
    cells,
    merges,
    ...(loopRanges !== undefined ? { loopRanges } : {}),
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
  const legacyStatuses = new Set(['selesai', 'proses', 'tertunda']);

  return activities.map((act) => {
    const nextCustom = { ...(act.customValues ?? {}) };
    if ('no_tiket' in nextCustom) {
      delete nextCustom.no_tiket;
    }

    const normalizedStatus = (act.status ?? '').trim().toLowerCase();
    const nextStatus = legacyStatuses.has(normalizedStatus) ? '' : act.status;

    return {
      ...act,
      status: nextStatus,
      customValues: nextCustom,
    };
  });
}

const LEGACY_DUMMY_SEED_IDS = new Set([
  'act-1',
  'act-2',
  'act-3',
  'act-4',
  'act-5',
]);

const LEGACY_DUMMY_SEED_PROJECTS = new Set([
  'Pemeliharaan Gedung Graha',
  'Core ERP Migrasi',
  'Audit Perangkat Cikarang',
  'Upgrade Fiber Gedung Graha',
]);

function migrateRemoveDummySeedV6(
  activities: ActivityEntry[],
  exportsList: SavedExportReport[],
  settings: AppSettings
): {
  activities: ActivityEntry[];
  settings: AppSettings;
} {
  const nextActivities = activities.filter(
    (act) =>
      !(
        LEGACY_DUMMY_SEED_IDS.has(act.id) &&
        LEGACY_DUMMY_SEED_PROJECTS.has(act.project)
      )
  );

  const taraHasActivities = nextActivities.some(
    (act) => act.pic.trim().toLowerCase() === 'tara'
  );
  const taraHasExports = exportsList.some(
    (exp) => exp.ownerAccount.trim().toLowerCase() === 'tara'
  );

  if (!taraHasActivities && !taraHasExports) {
    const nextProfiles = (settings.savedProfiles ?? []).filter(
      (p) => p.trim().toLowerCase() !== 'tara'
    );
    const isTaraActive =
      (settings.defaultPicName ?? '').trim().toLowerCase() === 'tara';
    const nextDefault = isTaraActive
      ? (nextProfiles[0] ?? '')
      : settings.defaultPicName;
    const nextLoggedIn =
      isTaraActive && !nextDefault ? false : settings.isLoggedIn;

    return {
      activities: nextActivities,
      settings: {
        ...settings,
        defaultPicName: nextDefault,
        savedProfiles: nextProfiles,
        isLoggedIn: nextLoggedIn,
      },
    };
  }

  return {
    activities: nextActivities,
    settings,
  };
}

function migrateDefaultVendorsV7(
  vendors: VendorProfile[],
  settings: AppSettings
): { vendors: VendorProfile[]; settings: AppSettings } {
  const defaultIds = new Set(INITIAL_VENDOR_PROFILES.map((v) => v.id));
  const customVendors = vendors.filter((v) => !defaultIds.has(v.id));
  const nextVendors = [
    ...INITIAL_VENDOR_PROFILES.map((v) => structuredClone(v)),
    ...customVendors,
  ];
  const hasActive = nextVendors.some((v) => v.id === settings.activeVendorId);
  const nextSettings: AppSettings = hasActive
    ? settings
    : { ...settings, activeVendorId: getDefaultActiveVendorId(nextVendors) };

  return { vendors: nextVendors, settings: nextSettings };
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

  // Seed default vendor templates only on very first launch; require user to enter username first
  if (!settings && vendors.length === 0 && activities.length === 0) {
    vendors = INITIAL_VENDOR_PROFILES;
    activities = INITIAL_ACTIVITIES;
    settings = {
      id: 'default',
      activeVendorId: getDefaultActiveVendorId(vendors),
      defaultPicName: '',
      savedProfiles: [],
      isLoggedIn: false,
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
        activeVendorId: getDefaultActiveVendorId(vendors),
        defaultPicName: '',
        savedProfiles: [],
        isLoggedIn: false,
      };
      await putInStore(STORE_SETTINGS, settings);
    }

    const prevVersion = settings.migrationVersion ?? 0;
    if (prevVersion < CURRENT_MIGRATION_VERSION) {
      if (prevVersion < 3) {
        vendors = migrateLegacyVendors(vendors);
        activities = migrateLegacyActivities(activities);
      }
      if (prevVersion < 5) {
        const migratedVendors = migrateDefaultVendorsV5(vendors, settings);
        vendors = migratedVendors.vendors;
        settings = migratedVendors.settings;
      }
      if (prevVersion < 6) {
        const cleaned = migrateRemoveDummySeedV6(
          activities,
          savedExports,
          settings
        );
        activities = cleaned.activities;
        settings = cleaned.settings;
      }
      if (prevVersion < 7) {
        const updatedVendors = migrateDefaultVendorsV7(vendors, settings);
        vendors = updatedVendors.vendors;
        settings = updatedVendors.settings;
      }
      if (prevVersion < 8) {
        const preferredVendorId = getDefaultActiveVendorId(vendors);
        const currentActiveId = settings.activeVendorId;
        if (
          preferredVendorId &&
          (!currentActiveId ||
            currentActiveId === 'vendor-1794799030334-0-ttf4' ||
            !vendors.some((v) => v.id === currentActiveId))
        ) {
          settings = {
            ...settings,
            activeVendorId: preferredVendorId,
          };
        }
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
    activities: sortActivitiesAscending(activities),
    vendorProfiles: vendors,
    savedExports: sortSavedExportsDescending(savedExports),
    settings,
  };
}

export function sortActivitiesAscending(items: ActivityEntry[]): ActivityEntry[] {
  return [...items].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = a.startTime.localeCompare(b.startTime);
    if (timeDiff !== 0) return timeDiff;
    return a.createdAt.localeCompare(b.createdAt);
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
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error(
            pickLang(
              getActiveLanguage(),
              'Failed to save activity batch.',
              'Gagal menyimpan daftar aktivitas.'
            )
          )
      );
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
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error(
            pickLang(
              getActiveLanguage(),
              'Failed to delete selected activities.',
              'Gagal menghapus aktivitas terpilih.'
            )
          )
      );
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
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error(
            pickLang(
              getActiveLanguage(),
              'Failed to delete selected export history.',
              'Gagal menghapus riwayat ekspor terpilih.'
            )
          )
      );
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
    activeVendorId: getDefaultActiveVendorId(vendorProfiles),
    defaultPicName: '',
    savedProfiles: [],
    isLoggedIn: false,
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
    activities: sortActivitiesAscending(activities),
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
    activeVendorId: getDefaultActiveVendorId(INITIAL_VENDOR_PROFILES),
    defaultPicName: '',
    savedProfiles: [],
    isLoggedIn: false,
    migrationVersion: CURRENT_MIGRATION_VERSION,
  };

  await Promise.all([
    clearAndSeedStore(STORE_ACTIVITIES, INITIAL_ACTIVITIES),
    clearAndSeedStore(STORE_VENDORS, INITIAL_VENDOR_PROFILES),
    clearAndSeedStore(STORE_EXPORTS, []),
    putInStore(STORE_SETTINGS, settings),
  ]);

  return {
    activities: sortActivitiesAscending(INITIAL_ACTIVITIES),
    vendorProfiles: INITIAL_VENDOR_PROFILES,
    savedExports: [],
    settings,
  };
}
