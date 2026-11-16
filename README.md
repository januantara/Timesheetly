<div align="center">
  <img src="src/assets/images/timesheetly_logo_1794796777711.jpg" alt="Timesheetly Logo" width="84" height="84" />
  <h1>Timesheetly</h1>
  <p>
    Aplikasi web manajemen <strong>Timesheet</strong> harian dan generator ekspor laporan berbasis <strong>Template Vendor</strong> (Excel, PDF, HTML) yang tersimpan sepenuhnya secara lokal di browser menggunakan <strong>IndexedDB</strong>.
  </p>
</div>

---

## Fitur Utama

### 1. Manajemen Timesheet Harian
- **Pencatatan Aktivitas Terstruktur**: Input Tanggal & Hari, Jam Mulai–Selesai beserta kalkulasi durasi otomatis format `HH:mm`, **Project Name**, **Project Code**, **Aplikasi Berdampak**, serta editor **Activity** dengan tombol pemformatan teks (termasuk daftar poin/bullet list).
- **Custom Key Opsional & Simpan Key**: Tambahkan detail tambahan secara dinamis dengan input key manual dan simpan key tersebut (*Simpan Key*) agar otomatis tersedia pada entri aktivitas berikutnya.
- **Format Tanggal & Waktu Fleksibel**: Pengaturan format tampilan tanggal (seperti `yyyy-mm-dd`, `dd/mm/yyyy`, `dd MMM yyyy`, dll.) dan format jam (`24 jam` / `12 jam`) yang tersinkronisasi antara tabel timesheet dan hasil ekspor.
- **Filter & Pencarian Cepat**: Pemilih rentang tanggal (*Date Range Picker*) dalam satu input kalender interaktif serta pencarian kata kunci lintas kolom.
- **Impor Aktivitas dari Git Commit**: Fitur **Salin Prompt** berbahasa Inggris untuk mengekstrak aktivitas langsung dari histori commit Git di folder project (berdasarkan `git config user.name` / `git config user.email` untuk commit yang sudah di-push) serta modal **Impor** JSON untuk memasukkan data tanggal & aktivitas secara massal.

### 2. Template Vendor & Spreadsheet Editor
- **Kustomisasi Template per Vendor**: Atur profil vendor lengkap dengan logo, orientasi kertas (*Portrait* / *Landscape*), dan editor grid spreadsheet visual (`ExcelSheetEditor`) dengan dukungan *merge cell*, lebar kolom, tinggi baris, warna, perataan, dan token placeholder dinamis (`{{tanggal}}`, `{{hari}}`, `{{jam}}`, `{{durasi}}`, `{{project_name}}`, `{{project_code}}`, `{{activity}}`, `{{aplikasi_berdampak}}`, `{{custom:...}}`, dll.).
- **Impor & Ekspor Template Vendor**: Bagikan atau cadangkan konfigurasi template vendor dalam format `.json` maupun `.xlsx`.

### 3. Pratinjau & Ekspor Laporan
- **Multi-Format Ekspor**: Unduh laporan siap kirim dalam format **Excel (`.xlsx`)**, **PDF (`.pdf`)**, atau **HTML (`.html`)**, atau simpan ke daftar **Pratinjau & Ekspor** untuk diedit ulang sebelum diunduh.
- **Penamaan Berkas Otomatis**: Format nama berkas bawaan mengikuti pola `Timesheet_[Nama]_[Month]-[Year]`.

### 4. Multi-Profil Lokal, Cadangan & Privasi
- **Penyimpanan Lokal IndexedDB**: Seluruh aktivitas, profil vendor, riwayat ekspor, dan pengaturan tersimpan secara lokal di browser tanpa bergantung pada server eksternal.
- **Manajemen Profil Akun**: Dukungan **Logout**, **Masuk / Buat Profil Baru**, peralihan antar akun dengan isolasi data per akun, serta penghapusan akun dengan dialog konfirmasi.
- **Cadangkan & Pulihkan**: Ekspor dan impor seluruh data aplikasi dalam format `.json` atau reset ke data contoh awal.

---

## Teknologi yang Digunakan

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React
- **Penyimpanan Lokal**: Browser IndexedDB API
- **Ekspor Dokumen**: ExcelJS (`.xlsx`), jsPDF & html2canvas-pro (`.pdf`)

---

## Struktur Proyek

```text
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── assets/images/          # Aset gambar default profil, logo vendor, dan logo aplikasi
    ├── types/                  # Definisi tipe TypeScript
    ├── lib/
    │   ├── db.ts               # Layer IndexedDB & migrasi skema lokal
    │   ├── seedData.ts         # Data awal profil default & template vendor bawaan
    │   ├── formatters.ts       # Pemformat tanggal, jam, durasi, filter, & nama file
    │   ├── sheetTemplate.ts    # Engine template spreadsheet & looping baris aktivitas
    │   ├── exporters.ts        # Generator file Excel (.xlsx), PDF (.pdf), & HTML
    │   ├── templateTransfer.ts # Impor & ekspor template vendor (.json / .xlsx)
    │   └── activityImport.ts   # Builder prompt ekstraksi Git & parser impor aktivitas JSON
    └── components/
        ├── Sidebar.tsx
        ├── ActivitiesView.tsx
        ├── ActivityModal.tsx
        ├── ImportActivitiesModal.tsx
        ├── DateRangePicker.tsx
        ├── VendorTemplatesView.tsx
        ├── ExcelSheetEditor.tsx
        ├── ExportVendorModal.tsx
        ├── ExportPreviewView.tsx
        ├── BackupModal.tsx
        ├── ProfileLoginView.tsx
        ├── DeleteAccountModal.tsx
        └── Toast.tsx
```

---

## Menjalankan Secara Lokal

### Prasyarat
- **Node.js** (disarankan versi 18 LTS atau lebih baru)
- **npm** (atau package manager yang kompatibel)

### Instalasi & Pengembangan

```bash
# 1. Clone repository
git clone <url-repository-anda>
cd <nama-folder-project>

# 2. Instal dependensi
npm install

# 3. Jalankan server pengembangan (port 3000)
npm run dev
```

Buka browser dan akses `http://localhost:3000`.

### Perintah Lainnya

```bash
# Pengecekan tipe TypeScript
npm run lint

# Build produksi ke folder dist/
npm run build

# Pratinjau hasil build produksi
npm run preview
```

---

## Lisensi & Hak Cipta

Copyright © 2026 by **Januantara**.
