import defaultVendorTemplatesJson from '../assets/defaultVendorTemplates.json';
import emptyStateDeskImg from '../assets/images/empty_state_desk_1794655656164.jpg';
import logoNusantaraImg from '../assets/images/logo_vendor_nusantara_1794655655772.jpg';
import logoCakrawalaImg from '../assets/images/logo_vendor_cakrawala_1794655656801.jpg';
import logoMandalaImg from '../assets/images/logo_vendor_mandala_1794655656753.jpg';
import profileDefaultImg from '../assets/images/profile-default.jpg';
import appLogoImg from '../assets/images/timesheetly_logo_1794796777711.jpg';
import type { ActivityEntry, VendorProfile } from '../types';

export const DEFAULT_PROFILE_NAME = 'Tara';

export const ASSET_PATHS = {
  emptyStateDesk: emptyStateDeskImg,
  logoNusantara: logoNusantaraImg,
  logoCakrawala: logoCakrawalaImg,
  logoMandala: logoMandalaImg,
  profileDefault: profileDefaultImg,
  appLogo: appLogoImg,
};

export interface StarterLogoPreset {
  id: string;
  label: string;
  url: string;
}

export const STARTER_LOGO_PRESETS: StarterLogoPreset[] = [
  {
    id: 'nusantara',
    label: 'Nusantara Konstruksi',
    url: logoNusantaraImg,
  },
  {
    id: 'cakrawala',
    label: 'Cakrawala Digital',
    url: logoCakrawalaImg,
  },
  {
    id: 'mandala',
    label: 'Mandala Logistik',
    url: logoMandalaImg,
  },
];

function formatDateOffset(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const INITIAL_VENDOR_PROFILES: VendorProfile[] = (
  defaultVendorTemplatesJson as unknown as VendorProfile[]
).map((profile) => ({
  ...profile,
  updatedAt: profile.updatedAt || new Date().toISOString(),
}));

export const INITIAL_ACTIVITIES: ActivityEntry[] = [
  {
    id: 'act-1',
    date: formatDateOffset(0),
    startTime: '08:30',
    endTime: '10:30',
    durationMinutes: 120,
    project: 'Pemeliharaan Gedung Graha',
    category: 'PRJ-INFRA-01',
    activity: 'Inspeksi panel distribusi utama dan pengujian failover genset lantai basement.',
    remark: 'Tegangan stabil 220V/380V, transfer switch merespons dalam 4 detik tanpa alarm.',
    status: 'Sistem Kelistrikan & Genset',
    pic: DEFAULT_PROFILE_NAME,
    customValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-2',
    date: formatDateOffset(0),
    startTime: '11:00',
    endTime: '13:00',
    durationMinutes: 120,
    project: 'Core ERP Migrasi',
    category: 'PRJ-ERP-02',
    activity: 'Sinkronisasi endpoint webhook penerimaan barang dan validasi payload JSON vendor.',
    remark: 'Batch uji coba 150 transaksi berhasil masuk; masih menunggu penyesuaian timeout dari tim vendor.',
    status: 'Core ERP & Webhook API',
    pic: DEFAULT_PROFILE_NAME,
    customValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-3',
    date: formatDateOffset(-1),
    startTime: '09:00',
    endTime: '12:00',
    durationMinutes: 180,
    project: 'Audit Perangkat Cikarang',
    category: 'PRJ-WMS-03',
    activity: 'Kalibrasi 8 unit barcode scanner nirkabel dan pembaruan firmware terminal dock.',
    remark: '7 unit normal, 1 unit seri SN-884 baterai menggelembung dan diajukan penggantian suku cadang.',
    status: 'WMS Gudang & Scanner',
    pic: DEFAULT_PROFILE_NAME,
    customValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-4',
    date: formatDateOffset(-1),
    startTime: '13:30',
    endTime: '16:30',
    durationMinutes: 180,
    project: 'Upgrade Fiber Gedung Graha',
    category: 'PRJ-NET-04',
    activity: 'Terminasi ulang kabel patch FO rack lantai 4 dan pengukuran redaman OTDR.',
    remark: 'Redaman turun dari -24 dBm menjadi -17.2 dBm; koneksi uplink redundan kembali aktif.',
    status: 'Network Backbone',
    pic: DEFAULT_PROFILE_NAME,
    customValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-5',
    date: formatDateOffset(-2),
    startTime: '08:00',
    endTime: '11:30',
    durationMinutes: 210,
    project: 'Core ERP Migrasi',
    category: 'PRJ-ERP-02',
    activity: 'Pendampingan sesi UAT modul approval PO bersama tim operasional dan keuangan.',
    remark: 'Seluruh 12 skenario uji lulus; terdapat permintaan tambahan kolom nomor surat jalan pada laporan.',
    status: 'Modul Approval PO',
    pic: DEFAULT_PROFILE_NAME,
    customValues: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
