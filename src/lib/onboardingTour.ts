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
        title: '1. Copy Prompt',
        description:
          'Klik Copy Prompt, lalu jalankan prompt tersebut di root folder project menggunakan AI untuk mengubah commit message ke format JSON timesheet',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="import-btn"]',
      popover: {
        title: '2. Klik button Import',
        description:
          'Setelah AI menghasilkan output JSON, klik button Import untuk untuk memasukkan daftar aktivitas dari <strong>commit message anda</strong>.',
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
        title: '3. Import Aktivitas JSON',
        description:
          'Gunakan tab ini untuk meng-import aktivitas timesheet secara otomatis dari data JSON <strong>commit message</strong>.',
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
          'Import jam masuk dan pulang kerja dengan mengunggah file PDF DigiHC atau memasukkan <strong>response</strong> JSON dari sistem DigiHC.',
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
          'Aktifkan toggle "Pilih Semua" di pojok kiri atas tabel (atau pilih baris tertentu) untuk menandai aktivitas yang akan di export.',
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
        title: '6. Klik Button Export',
        description:
          'Setelah aktivitas dipilih, klik button "Export" untuk memilih template vendor PDF timesheet anda.',
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
          'Pilih template vendor yang sesuai (MII, SDD, atau NTT Data) dan sesuaikan nama file laporan jika diperlukan. anda juga bisa menambahkan template baru pada menu vendor templates jika vendor ada belum ditambahkan.',
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
          'Klik "Download PDF" untuk menyimpan laporan dalam format PDF, atau klik "Simpan" untuk melakukan penyesuaian sel pada pratinjau.',
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
