import defaultVendorTemplatesJson from '../assets/defaultVendorTemplates.json';
import emptyStateDeskImg from '../assets/images/empty_state_desk_1794655656164.jpg';
import logoNusantaraImg from '../assets/images/logo_vendor_nusantara_1794655655772.jpg';
import logoCakrawalaImg from '../assets/images/logo_vendor_cakrawala_1794655656801.jpg';
import logoMandalaImg from '../assets/images/logo_vendor_mandala_1794655656753.jpg';
import profileDefaultImg from '../assets/images/profile-default.jpg';
import appLogoImg from '../assets/images/timesheetly_logo_1794796777711.jpg';
import type { ActivityEntry, VendorProfile } from '../types';

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

export const INITIAL_VENDOR_PROFILES: VendorProfile[] = (
  defaultVendorTemplatesJson as unknown as VendorProfile[]
).map((profile) => ({
  ...profile,
  logoDataUrl:
    profile.logoDataUrl === '/src/assets/images/logo_vendor_nusantara_1794655655772.jpg'
      ? logoNusantaraImg
      : profile.logoDataUrl,
  updatedAt: profile.updatedAt || new Date().toISOString(),
}));

export const INITIAL_ACTIVITIES: ActivityEntry[] = [];
