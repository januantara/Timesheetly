import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export const TOUR_STORAGE_KEY = 'timesheetly_template_guide_seen_v1';

export interface TemplateTourControllers {
  goToActivitiesView: () => void;
  openImportModal: (tab: 'json' | 'digihc') => void;
  closeImportModal: () => void;
  openExportModal: () => void;
  closeExportModal: () => void;
  setShowSamplePreview: (show: boolean) => void;
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
  controllers.setShowSamplePreview(false);
  controllers.goToActivitiesView();

  let activeDriver: Driver | null = null;

  const steps: DriveStep[] = [
    {
      element: '[data-tour="copy-prompt"]',
      popover: {
        title: '1. Copy Prompt Activity Recap',
        description:
          'Mulai dengan klik button Copy Prompt, lalu jalankan prompt tersebut di root folder project dengan AI yang Anda miliki untuk mengekstrak commit message yang akan dijadikan sebagai activity dalam timesheet ke dalam format JSON.',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="import-btn"]',
      popover: {
        title: '2. Buka Menu Impor',
        description:
          'Setelah prompt yang Anda jalankan menghasilkan output JSON, bukalah menu Impor untuk memasukkan aktivitas timesheet dari commit message yang pernah Anda push.',
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
        title: '3. Impor Aktivitas JSON',
        description:
          'Tab ini berfungsi untuk mengimpor aktivitas timesheet secara otomatis dari commit message Anda.',
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
        title: '4. Tab Check-In/Out DigiHC',
        description:
          'Tab ini adalah tab untuk mengimpor jam mulai kerja dan pulang dari jam yang tercatat di DigiHC. Anda dapat mengimpornya dengan mengunggah file PDF yang didapatkan dari DigiHC atau mengimpornya dari JSON response yang didapatkan di DigiHC (males bat).',
        side: 'bottom',
        align: 'start',
        onPrevClick: (_el, _step, opts) => {
          controllers.openImportModal('json');
          waitForRender(() => {
            opts.driver.movePrevious();
          });
        },
        onNextClick: (_el, _step, opts) => {
          controllers.setShowSamplePreview(true);
          controllers.closeImportModal();
          waitForRender(() => {
            opts.driver.moveNext();
          }, 110);
        },
      },
    },
    {
      element: '[data-tour="select-all-toggle"]',
      waitForElement: 1200,
      popover: {
        title: '5. Pilih Aktivitas',
        description:
          'Setelah data aktivitas dan DigiHC masuk ke tabel, aktifkan toggle Pilih Semua di pojok kiri atas header tabel (atau pilih baris tertentu) untuk menandai aktivitas yang akan diekspor.',
        side: 'bottom',
        align: 'start',
        onPrevClick: (_el, _step, opts) => {
          controllers.setShowSamplePreview(false);
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
          'Setelah aktivitas dipilih, klik tombol "Ekspor" untuk memilih template vendor dan men-generate file timesheet.',
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
          'Pilih template vendor yang sesuai (MII, SDD, atau NTT Data), lalu sesuaikan nama file laporan jika diperlukan. Anda juga bisa menambahkan template di menu Template Vendor bila vendor Anda belum ada di sini.',
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
          'Terakhir, klik "Download PDF" untuk menyimpan laporan sebagai file PDF satu halaman (atau klik "Simpan" bila ingin mengedit sel terlebih dahulu di Pratinjau).',
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
      controllers.setShowSamplePreview(false);
    },
  });

  waitForRender(() => {
    activeDriver?.drive(0);
  }, 80);

  return activeDriver;
}
