import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export const TOUR_STORAGE_KEY = 'timesheetly_template_guide_seen_v1';

export interface TemplateTourControllers {
  goToActivitiesView: () => void;
  openImportModal: (tab: 'json' | 'digihc') => void;
  closeImportModal: () => void;
  openExportModal: () => void;
  closeExportModal: () => void;
}

function waitForRender(callback: () => void, delayMs = 90) {
  window.setTimeout(() => {
    requestAnimationFrame(callback);
  }, delayMs);
}

export function startTemplateGenerationTour(
  controllers: TemplateTourControllers
): Driver {
  controllers.closeImportModal();
  controllers.closeExportModal();
  controllers.goToActivitiesView();

  let activeDriver: Driver | null = null;

  const steps: DriveStep[] = [
    {
      element: '[data-tour="copy-prompt"]',
      popover: {
        title: '1. Copy Prompt Aktivitas',
        description:
          'Mulai dengan klik tombol "Copy Prompt", lalu jalankan prompt tersebut di root folder project Anda untuk mengekstrak daftar pekerjaan ke dalam format JSON.',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="import-btn"]',
      popover: {
        title: '2. Buka Menu Impor',
        description:
          'Setelah menyiapkan hasil JSON aktivitas dan laporan absensi DigiHC, klik tombol "Impor" untuk memasukkannya ke Timesheet.',
        side: 'bottom',
        align: 'end',
        onNextClick: (_el, _step, opts) => {
          controllers.openImportModal('json');
          waitForRender(() => {
            opts.driver.moveNext();
          });
        },
      },
    },
    {
      element: '[data-tour="import-tab-json"]',
      waitForElement: 1200,
      popover: {
        title: '3. Impor Aktivitas (JSON)',
        description:
          'Pada tab "Aktivitas (JSON)", tempelkan output JSON dari prompt (atau pilih file JSON) lalu klik "Impor Aktivitas".',
        side: 'bottom',
        align: 'start',
        onPrevClick: (_el, _step, opts) => {
          controllers.closeImportModal();
          waitForRender(() => {
            opts.driver.movePrevious();
          });
        },
        onNextClick: (_el, _step, opts) => {
          controllers.openImportModal('digihc');
          waitForRender(() => {
            opts.driver.moveNext();
          });
        },
      },
    },
    {
      element: '[data-tour="import-tab-digihc"]',
      waitForElement: 1200,
      popover: {
        title: '4. Impor Check-In/Out DigiHC',
        description:
          'Lanjutkan ke tab "Check-In/Out DigiHC" untuk mengunggah file PDF Laporan Kehadiran atau JSON DigiHC agar jam masuk, jam pulang, dan hari libur (LIB) otomatis terpasang.',
        side: 'bottom',
        align: 'start',
        onPrevClick: (_el, _step, opts) => {
          controllers.openImportModal('json');
          waitForRender(() => {
            opts.driver.movePrevious();
          });
        },
        onNextClick: (_el, _step, opts) => {
          controllers.closeImportModal();
          waitForRender(() => {
            opts.driver.moveNext();
          });
        },
      },
    },
    {
      element: () =>
        document.querySelector('[data-tour="select-all-toggle"]') ??
        document.querySelector('[data-tour="activities-table-card"]') ??
        document.body,
      popover: {
        title: '5. Pilih Toggle Semua Aktivitas',
        description:
          'Setelah data aktivitas & DigiHC muncul di tabel, centang toggle "Pilih Semua" di pojok kiri atas header tabel untuk memilih seluruh aktivitas yang akan diekspor.',
        side: 'bottom',
        align: 'start',
        onPrevClick: (_el, _step, opts) => {
          controllers.openImportModal('digihc');
          waitForRender(() => {
            opts.driver.movePrevious();
          });
        },
      },
    },
    {
      element: '[data-tour="export-btn"]',
      popover: {
        title: '6. Klik Tombol Ekspor',
        description:
          'Setelah aktivitas dipilih, klik tombol "Ekspor" untuk memilih template vendor dan men-generate dokumen laporan.',
        side: 'bottom',
        align: 'end',
        onNextClick: (_el, _step, opts) => {
          controllers.openExportModal();
          waitForRender(() => {
            opts.driver.moveNext();
          });
        },
      },
    },
    {
      element: '[data-tour="export-vendor-list"]',
      waitForElement: 1200,
      popover: {
        title: '7. Pilih Template Vendor',
        description:
          'Pilih template vendor yang sesuai (MII, SDD, atau NTT Data) lalu sesuaikan nama file laporan jika diperlukan.',
        side: 'bottom',
        align: 'start',
        onPrevClick: (_el, _step, opts) => {
          controllers.closeExportModal();
          waitForRender(() => {
            opts.driver.movePrevious();
          });
        },
      },
    },
    {
      element: '[data-tour="export-download-pdf"]',
      waitForElement: 1200,
      popover: {
        title: '8. Save as PDF',
        description:
          'Terakhir, klik "Download PDF" untuk langsung menyimpan laporan sebagai file PDF satu halaman (atau klik "Simpan" bila ingin mengedit sel terlebih dahulu di Pratinjau).',
        side: 'top',
        align: 'end',
      },
    },
  ];

  activeDriver = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayOpacity: 0.45,
    stagePadding: 6,
    stageRadius: 8,
    popoverOffset: 10,
    popoverClass: 'timesheetly-driver-popover',
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Lanjut',
    prevBtnText: 'Kembali',
    doneBtnText: 'Selesai',
    steps,
    onDestroyed: () => {
      controllers.closeImportModal();
      controllers.closeExportModal();
    },
  });

  waitForRender(() => {
    activeDriver?.drive(0);
  }, 80);

  return activeDriver;
}
