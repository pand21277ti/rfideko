# Sistem Desain: Industrial Sharp Architecture

Dokumentasi arsitektur desain antarmuka, token visual, spesifikasi geometri, dan kelas CSS bersama untuk aplikasi Smart RFID Attendance & Monitoring System.

---

## 1. Filosofi & Arah Desain (Industrial Sharp)

Sistem desain **Industrial Sharp** dirancang untuk platform operasional sekolah berdensitas data tinggi yang mengutamakan ketegasan, efisiensi ruang, konsistensi struktural, dan keterbacaan cepat.

### Prinsip Utama:
1. **Ketegasan Geometri**: Menghilangkan sudut melengkung berlebih (`rounded-2xl`, `rounded-3xl`). Semua kontainer struktural, kartu metrik, modal, dan tabel menggunakan radius **4px (`rounded`)** atau **6px (`rounded-md`)**.
2. **Kontras & Struktur Border 1px**: Setiap pemisah spasial ditegaskan melalui garis border 1px konsisten (`#334155` / `border-slate-700`) tanpa shadow blur yang mengaburkan batas data.
3. **Kepadatan Kompak (Compact Operations)**: Padding standar kontainer ditetapkan sebesar **16px** (atau 20-24px pada modal layar lebar), menghasilkan densitas informasi optimal tanpa pemborosan ruang vertikal.
4. **Disiplin Warna Bertujuan**: Menghilangkan warna acak (*candy colors*). Palet warna disatukan ke dalam **Deep Navy** sebagai latar belakang, **Slate** sebagai netral terstruktur, dan **Emerald** sebagai aksen primer serta status sukses.

---

## 2. Palet Token Warna (Color Tokens)

| Token | Nilai Hex | Tailwind Class | Penggunaan & Rationale |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#0B1120` | `bg-[#0B1120]` / `bg-slate-950` | Latar belakang kanvas aplikasi terluar |
| **Surface Deep Navy** | `#0F172A` | `bg-slate-900` | Latar belakang kartu kontainer, header, dan navbar |
| **Surface Elevate** | `#1E293B` | `bg-slate-800` | Baris tabel zebra, dropdown menu, toolbar filter |
| **Border Sharp** | `#334155` | `border-slate-700` | Garis tepi 1px di seluruh kartu, pemisah, dan input |
| **Border Active / Focus** | `#059669` / `#475569` | `border-emerald-600` / `border-slate-600` | Indikasi fokus input atau tombol aktif |
| **Text Primary** | `#F8FAFC` | `text-slate-100` / `text-white` | Judul, label penting, data sel utama |
| **Text Secondary** | `#94A3B8` | `text-slate-400` | Label pembantu, metadata kolom, caption |
| **Text Muted** | `#64748B` | `text-slate-500` | Placeholder input, ID sekunder, separator |
| **Accent Primary / Success**| `#10B981` | `text-emerald-400`, `bg-emerald-600` | Tombol primer, presensi tepat waktu, status aktif |
| **Accent Warning** | `#F59E0B` | `text-amber-400`, `border-amber-700/60` | Ambang batas telat, status peringatan |
| **Accent Critical / Danger** | `#EF4444` | `text-rose-400`, `border-rose-700/60` | Pelanggaran berat, tombol hapus, status alpa |

---

## 3. Aturan Geometri & Radius Sudut

Semua elemen aplikasi mematuhi hirarki radius sudut berikut:

```
[ Structural Containers & Modals ] -> 6px (rounded-md)
[ Cards, Filter Bars & Tables    ] -> 6px (rounded-md)
[ Form Inputs, Selects & Buttons ] -> 4px (rounded)
[ Badges, Chips & Tooltips       ] -> 4px (rounded)
[ Status Dots & Avatars Only     ] -> Full circle (rounded-full)
```

- **Dilarang**: Penggunaan `rounded-2xl`, `rounded-3xl`, atau `rounded-xl` pada kontainer data, modal, dan tabel.
- **Pengecualian `rounded-full`**: Hanya diizinkan untuk avatar foto wajah lingkaran dan titik indikator status denyut (`w-2 h-2 rounded-full`).

---

## 4. Tipografi & Skala Teks

Satu font keluarga seragam di seluruh aplikasi: **Plus Jakarta Sans** (fallback: `system-ui`, `sans-serif`).

| Level | Ukuran & Line-Height | Weight | Karakteristik & Penggunaan |
| :--- | :--- | :--- | :--- |
| **Micro Caption** | `10px` / `14px` | 700 (Bold) | Tag status kecil, singkatan gerbang, badge role |
| **Helper / Header Col** | `11px` / `16px` | 700 (Bold) | Header kolom tabel (uppercase), label input |
| **Body / Input / Row** | `13px` / `20px` | 500 (Medium) | Teks sel tabel, isi input, tombol navigasi |
| **Section Title** | `15px` / `22px` | 700 (Bold) | Judul kartu metrik, heading panel, modal subtitle |
| **Page Title** | `20px` / `28px` | 800 (ExtraBold) | Judul halaman/tab dashboard utama |
| **Metric Stat Number** | `24px` - `28px` | 800 (ExtraBold) | Angka KPI rekapitulasi, angka durasi keterlambatan |

### Disiplin Angka Monospasi:
Seluruh data numerik (NISN, NIP, RFID UID, jam presensi, jumlah siswa, persentase) **wajib** menggunakan kelas `tabular-nums font-mono` untuk menghindari pergeseran visual saat data bertambah atau diperbarui realtime.

---

## 5. Kelas CSS Shared (Tailwind Utility Components)

Definisi kelas komponen seragam di `src/index.css`:

```css
@layer components {
  /* Kontainer Kartu Standar */
  .card-container {
    padding: 16px;
    background-color: #0f172a; /* slate-900 */
    border: 1px solid #334155; /* slate-700 */
    border-radius: 6px;        /* 6px industrial sharp */
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.2);
  }

  /* Kontainer Kartu Ringkas / Sub-komponen */
  .card-container-compact {
    padding: 12px;
    background-color: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
  }

  /* Pembungkus Dialog Modal */
  .modal-dialog-container {
    background-color: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 20px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
  }

  /* Pembungkus Tabel Responsif */
  .table-container-sharp {
    border: 1px solid #334155;
    border-radius: 6px;
    overflow: hidden;
    background-color: #0f172a;
  }

  /* Input & Select Standar */
  .input-control-sharp {
    height: 38px;
    padding: 8px 12px;
    background-color: #0b1120;
    border: 1px solid #334155;
    border-radius: 4px;
    font-size: 13px;
    color: #f8fafc;
    transition: border-color 0.15s ease-in-out;
  }
  .input-control-sharp:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 1px #10b981;
  }

  /* Tombol Aksi Primer */
  .btn-primary-sharp {
    height: 38px;
    padding: 8px 16px;
    background-color: #059669;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    border-radius: 4px;
    border: 1px solid #10b981;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background-color 0.15s ease-in-out;
    cursor: pointer;
  }
  .btn-primary-sharp:hover {
    background-color: #047857;
  }

  /* Tombol Aksi Sekunder / Netral */
  .btn-secondary-sharp {
    height: 38px;
    padding: 8px 16px;
    background-color: #1e293b;
    color: #e2e8f0;
    font-size: 13px;
    font-weight: 600;
    border-radius: 4px;
    border: 1px solid #334155;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s ease-in-out;
    cursor: pointer;
  }
  .btn-secondary-sharp:hover {
    background-color: #334155;
    color: #ffffff;
  }

  /* Badge / Label Indikator Ringkas */
  .badge-sharp {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid transparent;
    line-height: 1.2;
  }
}
```

---

## 6. Spesifikasi Komponen Menyeluruh

### A. Navbar & Header Navigasi
- Tinggi bilah navigasi: `56px` konsisten.
- Latar belakang: `bg-slate-900` dengan garis bawah pemisah `border-b border-slate-700`.
- Tombol navigasi tab: `h-9 px-3 rounded text-xs font-semibold`. Tab aktif menggunakan latar `bg-slate-800 text-white border border-slate-600`.
- Dropdown menu: Lebar `w-80`, `rounded-md`, border `border-slate-700`, latar `bg-slate-900`. Item baris single-line dengan `h-9 px-3 rounded hover:bg-slate-800`.

### B. Kartu Metrik KPI (Summary Row)
- Grid: 2 kolom (mobile), 4 kolom (desktop) dengan celah `gap-3` atau `gap-4`.
- Kontainer: Menggunakan `.card-container`.
- Header kartu: Label uppercase `text-[11px] font-bold text-slate-400` berdampingan dengan icon `w-4 h-4 text-slate-400`.
- Nilai metrik: `text-2xl font-extrabold text-white font-mono tabular-nums`.

### C. Baris Filter & Toolbar Kontrol
- Kontainer: Menggunakan `.card-container` dengan tata letak `flex flex-wrap items-center gap-3`.
- Seluruh elemen dropdown select dan input search menggunakan `.input-control-sharp`.
- Tinggi kontrol seragam: `38px` untuk select, input, dan tombol aksi (Export CSV/Excel).

### D. Tabel Data & Paginasi
- Kontainer: Menggunakan `.table-container-sharp`.
- Header tabel (`<thead>`): `bg-[#0B1120] text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-700`.
- Tinggi baris tabel: Compact `py-2.5 px-3.5` (sekitar `40px` per baris).
- Garis pemisah baris: `divide-y divide-slate-800`.
- Bar paginasi (`TablePagination`): Melekat di bawah tabel, tinggi `44px`, latar `bg-[#0B1120] border-t border-slate-700`, kontrol nomor halaman menggunakan `rounded` (4px).

### E. Dialog Modal
- Overlay: `bg-slate-950/80 backdrop-blur-xs`.
- Kotak dialog: Menggunakan `.modal-dialog-container` dengan lebar terkendali (`max-w-lg`, `max-w-2xl`, atau `max-w-4xl`).
- Header modal: Garis pemisah bawah `border-b border-slate-700 pb-3`, judul `text-base font-bold text-white`.
- Footer modal: Garis pemisah atas `border-t border-slate-700 pt-3 flex justify-end gap-2.5`.

---

## 7. Rencana Tahapan Migrasi Implementasi

1. **Langkah 1**: Registrasi CSS Utility Classes `.card-container`, `.modal-dialog-container`, `.table-container-sharp`, `.input-control-sharp`, `.btn-primary-sharp`, dan `.btn-secondary-sharp` pada `src/index.css`.
2. **Langkah 2**: Refactoring Navbar dan Header Dropdown pada `src/components/Navbar.tsx` dan `src/components/AdminDashboard.tsx`.
3. **Langkah 3**: Penerapan pada Kartu Metrik KPI, Toolbar Filter, dan Tabel di:
   - `src/components/AdminDashboard.tsx`
   - `src/components/StudentLateRecapReport.tsx`
   - `src/components/StudentDisciplineReport.tsx`
   - `src/components/TeacherManagement.tsx`
   - `src/components/TeacherReports.tsx`
   - `src/components/UserManagement.tsx`
4. **Langkah 4**: Normalisasi seluruh Modal Dialog (`MifareScannerModal`, `BulkImportModal`, `DayRolloverModal`, `LoginModal`, `OfflineSyncModal`, dll.).
5. **Langkah 5**: Audit akhir konsistensi radius (eliminasi `rounded-2xl` & `rounded-3xl` struktural) dan verifikasi kompilasi lint TypeScript.
