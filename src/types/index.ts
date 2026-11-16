export type ActivityStatus = string;

export interface ActivityTextFormat {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ActivityEntry {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  project: string;
  category: string;
  activity: string;
  activityFormat?: ActivityTextFormat;
  remark: string;
  status: ActivityStatus;
  pic: string;
  isHoliday?: boolean;
  rowColor?: string;
  attAbsenFlag?: string;
  customValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type ColumnSourceType = 'field' | 'auto_index' | 'static_text' | 'custom';

export type CanonicalFieldKey =
  | 'date'
  | 'day'
  | 'timeRange'
  | 'startTime'
  | 'endTime'
  | 'duration'
  | 'project'
  | 'category'
  | 'activity'
  | 'remark'
  | 'status'
  | 'pic';

export type ColumnAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface ColumnConfig {
  id: string;
  sourceType: ColumnSourceType;
  sourceKey: string; // CanonicalFieldKey | custom field key | ''
  headerLabel: string;
  staticValue?: string;
  width: number; // Character width for Excel & proportional width for PDF
  align: ColumnAlign;
  visible: boolean;
}

export type LogoPosition = 'left' | 'center' | 'right';
export type PaperOrientation = 'portrait' | 'landscape';

export interface SheetCellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: ColumnAlign;
  verticalAlign?: VerticalAlign;
  bgColor?: string;
  textColor?: string;
  border?: boolean;
  borderWidth?: number;
  borderColor?: string;
  fontSize?: number;
}

export interface SheetCell {
  value: string;
  style?: SheetCellStyle;
}

export interface SheetMergeRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SheetImage {
  id: string;
  dataUrl: string;
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  label?: string;
}

export interface SheetTemplate {
  colWidths: number[];
  rowHeights: number[];
  cells: Record<string, SheetCell>;
  merges: SheetMergeRange[];
  images: SheetImage[];
  dataRowIndex: number | null;
  dataRowIndices?: number[];
}

export interface VendorProfile {
  id: string;
  vendorName: string;
  reportTitle: string;
  subtitle: string;
  logoDataUrl: string;
  logoPosition: LogoPosition;
  headerBgColor: string;
  headerTextColor: string;
  paperOrientation: PaperOrientation;
  showSummaryRow: boolean;
  footerNotes: string;
  preparedByLabel: string;
  approvedByLabel: string;
  columns: ColumnConfig[];
  sheetTemplate?: SheetTemplate;
  updatedAt: string;
}

export type DateFilterPreset = 'bulan_ini' | 'kustom';

export interface ActivityFilterState {
  search: string;
  datePreset: DateFilterPreset;
  startDate: string;
  endDate: string;
}

export type AppView = 'activities' | 'vendors' | 'export';

export type DateDisplayFormat =
  | 'yyyy-mm-dd'
  | 'dd/mm/yyyy'
  | 'dd-mm-yyyy'
  | 'mm/dd/yyyy'
  | 'dd MMM yyyy'
  | 'dd MMMM yyyy';

export type TimeDisplayFormat = 'HH:mm' | 'HH.mm' | 'hh:mm A';

export interface AppSettings {
  id: 'default';
  activeVendorId: string;
  defaultPicName: string;
  dateFormat?: DateDisplayFormat;
  timeFormat?: TimeDisplayFormat;
  savedCustomKeys?: string[];
  savedProfiles?: string[];
  isLoggedIn?: boolean;
  migrationVersion?: number;
}

export interface SavedExportReport {
  id: string;
  ownerAccount: string;
  title: string;
  vendorId: string;
  vendorName: string;
  paperOrientation: PaperOrientation;
  periodLabel: string;
  rowCount: number;
  sheet: SheetTemplate;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  activities: ActivityEntry[];
  vendorProfiles: VendorProfile[];
  savedExports?: SavedExportReport[];
  settings?: AppSettings;
}

export interface CanonicalFieldOption {
  key: CanonicalFieldKey;
  label: string;
  defaultWidth: number;
  defaultAlign: ColumnAlign;
  description: string;
}

export const CANONICAL_FIELD_OPTIONS: CanonicalFieldOption[] = [
  {
    key: 'date',
    label: 'Tanggal',
    defaultWidth: 14,
    defaultAlign: 'center',
    description: 'Tanggal aktivitas (YYYY-MM-DD)',
  },
  {
    key: 'day',
    label: 'Hari',
    defaultWidth: 12,
    defaultAlign: 'center',
    description: 'Nama hari otomatis dari tanggal (Senin, Selasa, dst.)',
  },
  {
    key: 'timeRange',
    label: 'Jam',
    defaultWidth: 15,
    defaultAlign: 'center',
    description: 'Rentang jam kerja (08:30 - 11:00)',
  },
  {
    key: 'startTime',
    label: 'Jam Mulai',
    defaultWidth: 12,
    defaultAlign: 'center',
    description: 'Waktu mulai aktivitas',
  },
  {
    key: 'endTime',
    label: 'Jam Selesai',
    defaultWidth: 12,
    defaultAlign: 'center',
    description: 'Waktu selesai aktivitas',
  },
  {
    key: 'duration',
    label: 'Durasi',
    defaultWidth: 12,
    defaultAlign: 'right',
    description: 'Lama pengerjaan dalam format jam:menit (02:00)',
  },
  {
    key: 'project',
    label: 'Project Name',
    defaultWidth: 22,
    defaultAlign: 'left',
    description: 'Nama project atau pekerjaan',
  },
  {
    key: 'category',
    label: 'Project Code',
    defaultWidth: 18,
    defaultAlign: 'left',
    description: 'Kode project (misal: PRJ-001, ERP-MIG)',
  },
  {
    key: 'activity',
    label: 'Deskripsi Aktivitas',
    defaultWidth: 34,
    defaultAlign: 'left',
    description: 'Uraian tugas atau pekerjaan yang dilakukan',
  },
  {
    key: 'remark',
    label: 'Remark / Catatan Hasil',
    defaultWidth: 36,
    defaultAlign: 'left',
    description: 'Catatan hasil, kendala, atau tindak lanjut',
  },
  {
    key: 'status',
    label: 'Aplikasi Berdampak',
    defaultWidth: 22,
    defaultAlign: 'left',
    description: 'Nama atau daftar aplikasi yang terdampak',
  },
  {
    key: 'pic',
    label: 'PIC / Pelaksana',
    defaultWidth: 18,
    defaultAlign: 'left',
    description: 'Nama penanggung jawab atau teknisi',
  },
];
