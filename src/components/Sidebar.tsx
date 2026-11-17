import { useState } from 'react';
import {
  ClipboardList,
  Database,
  FileSpreadsheet,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useLanguage } from '../lib/i18n';
import { ASSET_PATHS } from '../lib/seedData';
import { ensureSheetTemplate } from '../lib/sheetTemplate';
import type { AppView, VendorProfile } from '../types';

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  activityCount: number;
  vendorCount: number;
  savedExportCount: number;
  activeVendor: VendorProfile | undefined;
  onOpenBackup: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  currentView,
  onNavigate,
  activityCount,
  vendorCount,
  savedExportCount,
  activeVendor,
  onOpenBackup,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [logoError, setLogoError] = useState(false);
  const { t } = useLanguage();

  const navItems: {
    id: AppView;
    label: string;
    icon: typeof ClipboardList;
    count?: number;
  }[] = [
    {
      id: 'activities',
      label: t('Timesheet', 'Timesheet'),
      icon: ClipboardList,
      count: activityCount,
    },
    {
      id: 'vendors',
      label: t('Vendor Templates', 'Template Vendor'),
      icon: Layers,
      count: vendorCount,
    },
    {
      id: 'export',
      label: t('Preview & Export', 'Pratinjau & Ekspor'),
      icon: FileSpreadsheet,
      count: savedExportCount,
    },
  ];

  const renderSidebarContent = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200">
      <div>
        <div
          className={`flex items-center h-16 border-b border-slate-200 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              {!logoError ? (
                <img
                  src={ASSET_PATHS.appLogo}
                  alt="Timesheetly Logo"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-display font-bold text-sm">
                  TL
                </div>
              )}
              <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap truncate">
                Timesheetly
              </span>
            </div>
          )}

          {/* Desktop collapse/expand toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={
              isCollapsed
                ? t('Expand sidebar', 'Lebarkan sidebar')
                : t('Collapse sidebar', 'Kecilkan sidebar')
            }
            aria-label={
              isCollapsed
                ? t('Expand sidebar', 'Lebarkan sidebar')
                : t('Collapse sidebar', 'Kecilkan sidebar')
            }
            className="hidden lg:inline-flex p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          {/* Mobile close */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            aria-label={t('Close navigation', 'Tutup navigasi')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-2.5 space-y-1" aria-label={t('Main Menu', 'Menu Utama')}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={isCollapsed ? item.label : undefined}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isCollapsed
                    ? 'justify-center p-2.5'
                    : 'justify-between px-3 py-2.5'
                } ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!isCollapsed && typeof item.count === 'number' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-blue-700 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {activeVendor &&
          (() => {
            const tpl = ensureSheetTemplate(activeVendor);
            const logoUrl = tpl.images[0]?.dataUrl || activeVendor.logoDataUrl;
            if (isCollapsed) {
              return (
                <div
                  className="mx-2.5 mt-3 p-1.5 rounded-lg border border-slate-200 bg-slate-50 flex justify-center"
                  title={`${t('Active vendor', 'Vendor aktif')}: ${activeVendor.vendorName}`}
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={activeVendor.vendorName}
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 rounded object-contain bg-white"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded bg-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                      {activeVendor.vendorName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div className="mx-2.5 mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="text-xs font-medium text-slate-500 mb-2">
                  {t('Active Vendor', 'Vendor Aktif')}
                </div>
                <div className="flex items-center gap-2.5">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={activeVendor.vendorName}
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 rounded border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded border border-slate-200 bg-white flex items-center justify-center text-xs font-semibold text-slate-500 shrink-0">
                      {activeVendor.vendorName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {activeVendor.vendorName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {tpl.colWidths.length} {t('cols', 'kolom')} × {tpl.rowHeights.length}{' '}
                      {t('rows', 'baris')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      <div className="p-2.5 border-t border-slate-200 space-y-2">
        <button
          type="button"
          title={isCollapsed ? t('Data & Backup', 'Data & Cadangan') : undefined}
          onClick={() => {
            onOpenBackup();
            onCloseMobile();
          }}
          className={`w-full flex items-center rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap ${
            isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
          }`}
        >
          <Database className="h-4 w-4 text-slate-400 shrink-0" />
          {!isCollapsed && <span>{t('Data & Backup', 'Data & Cadangan')}</span>}
        </button>
        {!isCollapsed && (
          <div className="px-3 text-[11px] text-slate-500 font-medium">
            Copyright © {new Date().getFullYear()} by Januantara
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`no-print hidden lg:block shrink-0 h-screen sticky top-0 transition-[width] duration-150 ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {renderSidebarContent(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <aside className="relative w-64 max-w-[82vw] h-full z-10 shadow-xl">
            {renderSidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
