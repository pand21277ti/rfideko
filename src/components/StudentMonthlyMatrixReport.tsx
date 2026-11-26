import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Student, AttendanceRecord, SchoolSchedule } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { exportMonthlyMatrixToExcel, executePrintHtml } from '../lib/exportUtils';
import { 
  FileSpreadsheet, 
  Printer, 
  Search, 
  Calendar, 
  Eye,
  X,
  Check, 
  Info,
  School
} from 'lucide-react';

interface StudentMonthlyMatrixReportProps {
  students: Student[];
  records: AttendanceRecord[];
  classes: string[];
  schedule: SchoolSchedule;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const StudentMonthlyMatrixReport: React.FC<StudentMonthlyMatrixReportProps> = ({
  students,
  records,
  classes,
  schedule
}) => {
  const today = new Date();
  const [selectedClass, setSelectedClass] = useState<string>(classes.length > 0 ? classes[0] : 'ALL');
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [syncVersion, setSyncVersion] = useState<number>(0);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Subscribe to realtime attendance updates
  useEffect(() => {
    const unsub = AttendanceStorage.subscribeToSync(() => {
      setSyncVersion(v => v + 1);
    });
    return () => unsub();
  }, []);

  const activeRecords = useMemo(() => {
    return AttendanceStorage.getAttendanceRecords();
  }, [syncVersion, records]);

  // Keep selected class valid if classes list updates
  useEffect(() => {
    if (classes.length > 0 && selectedClass !== 'ALL' && !classes.includes(selectedClass)) {
      setSelectedClass(classes[0]);
    }
  }, [classes, selectedClass]);

  // Days in selected month
  const totalDays = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const daysArray = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => i + 1);
  }, [totalDays]);

  // Filter students by class and search query
  const filteredStudents = useMemo(() => {
    let list = students;
    if (selectedClass !== 'ALL') {
      list = list.filter(s => s.class === selectedClass);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) ||
        (s.nisn && s.nisn.toLowerCase().includes(q)) ||
        (s.nis && s.nis.toLowerCase().includes(q))
      );
    }
    // Sort alphabetically by student name
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [students, selectedClass, searchQuery]);

  // Month date boundary
  const currentY = today.getFullYear();
  const currentM = today.getMonth() + 1;
  const currentD = today.getDate();

  const monthName = MONTH_NAMES[selectedMonth - 1];

  const handleExportExcel = () => {
    exportMonthlyMatrixToExcel({
      students: filteredStudents,
      records: activeRecords,
      month: selectedMonth,
      year: selectedYear,
      className: selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass,
      schoolSchedule: schedule
    });
  };

  // Direct print execution via landscape iframe
  const handlePrintDocument = () => {
    setIsPrinting(true);
    const printContent = document.getElementById('matrix-printable-sheet');
    if (!printContent) {
      setIsPrinting(false);
      return;
    }

    const htmlDoc = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Rekap_Matriks_Bulanan_${selectedClass}_${monthName}_${selectedYear}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 8mm 6mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 2mm;
            font-size: 10px;
          }
          .header-box {
            border-bottom: 2px solid #000;
            padding-bottom: 6px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
          }
          th, td {
            border: 1px solid #000;
            padding: 3px 2px;
            text-align: center;
          }
          th {
            background-color: #f1f5f9 !important;
            font-weight: bold;
          }
          .text-left {
            text-align: left !important;
            padding-left: 6px !important;
          }
          .weekend-cell {
            background-color: #f8fafc !important;
            color: #64748b;
          }
          .present-cell {
            font-weight: bold;
            color: #000;
          }
          .absent-total-cell {
            background-color: #f1f5f9 !important;
            font-weight: bold;
          }
          .signatures-container {
            margin-top: 32px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
            font-size: 11px;
          }
          .signature-box {
            text-align: center;
            width: 260px;
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `;

    executePrintHtml(htmlDoc, `Rekap_Matriks_Bulanan_${selectedClass}_${monthName}_${selectedYear}`);
    setTimeout(() => {
      setIsPrinting(false);
    }, 800);
  };

  return (
    <div className="space-y-4">
      
      {/* FILTER & CONTROL TOOLBAR */}
      <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <span>Rekap Matriks Bulanan Per Kelas</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Tabel presensi kalender harian (tanggal 1 s.d. {totalDays}) dengan tanda centang rapi dan rekapitulasi total hari tidak masuk KBM.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Unduh Rekap Matriks Bulanan Format Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs rounded-lg border border-zinc-700/60 shadow-sm transition-colors cursor-pointer"
              title="Buka Pratinjau & Cetak Dokumen PDF (A4 Landscape)"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Print PDF</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-zinc-800/80">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
              Pilih Rombongan Belajar / Kelas:
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
            >
              <option value="ALL">Semua Kelas ({students.length} Siswa)</option>
              {classes.map(cls => {
                const count = students.filter(s => s.class === cls).length;
                return (
                  <option key={cls} value={cls}>
                    {cls} ({count} siswa)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
              Pilih Bulan:
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
              Tahun:
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
            >
              {[2024, 2025, 2026, 2027, 2028].map(yr => (
                <option key={yr} value={yr}>
                  Tahun {yr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
              Cari Nama / NISN:
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari siswa (Nama / NISN)..."
                className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>
        </div>
      </div>

      {/* MATRIX DOCUMENT CONTAINER ON SCREEN (MATCHING APPLICATION THEME) */}
      <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 shadow-lg overflow-x-auto">
        
        {/* Document Header on Screen */}
        <div className="mb-4 pb-3 border-b border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase w-20">KELAS</span>
              <span className="text-xs font-black text-emerald-400">: {selectedClass === 'ALL' ? 'SEMUA KELAS' : selectedClass.toUpperCase()}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase w-20">BULAN</span>
              <span className="text-xs font-bold text-white">: {monthName.toUpperCase()} {selectedYear}</span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-extrabold text-white tracking-wide uppercase">{schedule.schoolName || 'SMK EKONOMIKA'}</p>
            <p className="text-[11px] text-slate-400">Blangko Daftar Hadir Bulanan Peserta Didik</p>
          </div>
        </div>

        {/* Matrix Table on Screen */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-700/80 text-[11px] font-sans">
            <thead>
              {/* Row 1 Header */}
              <tr className="bg-slate-900 text-slate-200 font-bold uppercase border-b border-slate-700">
                <th rowSpan={2} className="border border-slate-700/80 px-1.5 py-2 text-center w-8 text-slate-300">
                  NO
                </th>
                <th rowSpan={2} className="border border-slate-700/80 px-2 py-2 text-center w-28 text-slate-300">
                  NISN
                </th>
                <th rowSpan={2} className="border border-slate-700/80 px-3 py-2 text-left min-w-[200px] text-slate-200">
                  NAMA PESERTA DIDIK
                </th>
                <th rowSpan={2} className="border border-slate-700/80 px-1.5 py-2 text-center w-10 text-slate-300">
                  L/P
                </th>
                <th colSpan={totalDays} className="border border-slate-700/80 px-2 py-1.5 text-center font-bold tracking-widest text-slate-300">
                  TANGGAL
                </th>
                <th rowSpan={2} className="border border-slate-700/80 px-2 py-2 text-center w-28 bg-slate-950/70 text-rose-300 leading-tight">
                  TOTAL HARI TIDAK MASUK
                </th>
              </tr>

              {/* Row 2 Header: Days 1..N */}
              <tr className="bg-slate-900/90 text-slate-300 text-[10px] font-bold">
                {daysArray.map(d => {
                  const dayOfWeek = new Date(selectedYear, selectedMonth - 1, d).getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return (
                    <th
                      key={`day-header-${d}`}
                      className={`border border-slate-700/80 px-1 py-1.5 text-center w-6 min-w-[22px] ${
                        isWeekend ? 'bg-slate-950 text-slate-500 font-semibold' : 'bg-slate-900/60 text-slate-200'
                      }`}
                      title={`Tanggal ${d} ${monthName} (${dayOfWeek === 0 ? 'Minggu' : dayOfWeek === 6 ? 'Sabtu' : 'Hari Sekolah'})`}
                    >
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={totalDays + 5}
                    className="border border-slate-700/80 py-10 text-center text-slate-400 font-medium"
                  >
                    Tidak ada data peserta didik pada kelas terpilih.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => {
                  const studentRecords = activeRecords.filter(r => 
                    (r.studentId === student.id || (r.nisn && r.nisn === student.nisn) || (student.nis && r.nis === student.nis)) &&
                    (r.userType === 'STUDENT' || !r.userType)
                  );

                  let absentDaysCount = 0;
                  const nisnDisplay = student.nisn || student.nis || '-';

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="border border-slate-700/70 px-1.5 py-1.5 text-center text-slate-400 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-700/70 px-2 py-1.5 text-center font-mono font-medium text-emerald-400 tabular-nums">
                        {nisnDisplay}
                      </td>
                      <td className="border border-slate-700/70 px-3 py-1.5 font-semibold text-white truncate uppercase">
                        {student.name}
                      </td>
                      <td className="border border-slate-700/70 px-1.5 py-1.5 text-center font-bold text-slate-300">
                        {student.gender || 'L'}
                      </td>

                      {/* Days columns 1..N */}
                      {daysArray.map(day => {
                        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayOfWeek = new Date(selectedYear, selectedMonth - 1, day).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        if (isWeekend) {
                          return (
                            <td
                              key={`cell-${student.id}-${day}`}
                              className="border border-slate-700/70 bg-slate-950/60 text-slate-600 text-center font-mono text-[10px]"
                            >
                              -
                            </td>
                          );
                        }

                        const hasAttended = studentRecords.some(r => 
                          r.dateFormatted === dateStr && 
                          (r.type === 'MASUK' || r.status === 'TEPAT_WAKTU' || r.status === 'TERLAMBAT' || r.status === 'PULANG_CEPAT')
                        );

                        const isPastOrToday = (selectedYear < currentY) || 
                          (selectedYear === currentY && selectedMonth < currentM) || 
                          (selectedYear === currentY && selectedMonth === currentM && day <= currentD);

                        if (hasAttended) {
                          return (
                            <td
                              key={`cell-${student.id}-${day}`}
                              className="border border-slate-700/70 text-center text-emerald-400 font-bold text-xs"
                              title={`${student.name} Hadir pada ${dateStr}`}
                            >
                              ✓
                            </td>
                          );
                        } else {
                          if (isPastOrToday) {
                            absentDaysCount++;
                          }
                          return (
                            <td
                              key={`cell-${student.id}-${day}`}
                              className="border border-slate-700/70 text-center"
                            >
                              {/* Empty cell if absent on active day */}
                            </td>
                          );
                        }
                      })}

                      {/* Total Hari Tidak Masuk Column */}
                      <td className="border border-slate-700/70 px-2 py-1.5 text-center font-mono font-bold tabular-nums bg-slate-950/40">
                        {absentDaysCount > 0 ? (
                          <span className={absentDaysCount >= 3 ? 'text-rose-400 font-black' : 'text-amber-300'}>
                            {absentDaysCount}
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Note: Signatures are explicitly removed from the on-screen dashboard view as requested */}
      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE PRINT PREVIEW MODAL (A4 LANDSCAPE PDF / PRINT EXPORT)         */}
      {/* ========================================================================= */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Top Bar */}
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Pratinjau Cetak Blangko Matriks Bulanan</span>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] rounded border border-blue-500/30 font-medium">
                      A4 Landscape
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Kelas: <strong className="text-slate-200">{selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass}</strong> • Bulan: <strong className="text-slate-200">{monthName} {selectedYear}</strong> • Total Siswa: <strong className="text-slate-200">{filteredStudents.length}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintDocument}
                  disabled={isPrinting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
                >
                  <Printer className={`w-4 h-4 ${isPrinting ? 'animate-spin' : ''}`} />
                  <span>{isPrinting ? 'Menyiapkan Dokumen...' : 'Cetak Dokumen Sekarang (Print / PDF)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Tutup Pratinjau"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Sheet Preview */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-950/70">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-400 px-1">
                <div className="flex items-center gap-1.5 text-amber-300">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Pratinjau lembar cetak otomatis putih bersih dengan garis tanda tangan manual basah:</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">Kertas: 297mm x 210mm (Landscape)</span>
              </div>

              {/* PRINTABLE SHEET CONTAINER (Used for both preview and hidden iframe print) */}
              <div 
                id="matrix-printable-sheet" 
                className="bg-white text-slate-950 p-6 sm:p-8 rounded shadow-lg overflow-x-auto font-sans"
              >
                {/* Header Document */}
                <div className="header-box mb-3 pb-2 border-b-2 border-slate-900 flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-bold text-slate-800 uppercase">
                      KELAS : <span className="text-slate-950 font-black">{selectedClass === 'ALL' ? 'SEMUA KELAS' : selectedClass.toUpperCase()}</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-800 uppercase">
                      BULAN : <span className="text-slate-950 font-black">{monthName.toUpperCase()} {selectedYear}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-black text-slate-900 tracking-wider uppercase">{schedule.schoolName || 'SMK EKONOMIKA DEPOK'}</p>
                    <p className="text-[10px] text-slate-600 font-medium">Blangko Daftar Hadir Bulanan Peserta Didik</p>
                  </div>
                </div>

                {/* Print Matrix Table */}
                <table className="w-full border-collapse border border-slate-900 text-[9.5px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-bold uppercase">
                      <th rowSpan={2} className="border border-slate-900 px-1.5 py-1 text-center w-7">
                        NO
                      </th>
                      <th rowSpan={2} className="border border-slate-900 px-2 py-1 text-center w-24">
                        NISN
                      </th>
                      <th rowSpan={2} className="border border-slate-900 px-2.5 py-1 text-left min-w-[180px]">
                        NAMA PESERTA DIDIK
                      </th>
                      <th rowSpan={2} className="border border-slate-900 px-1 py-1 text-center w-8">
                        L/P
                      </th>
                      <th colSpan={totalDays} className="border border-slate-900 px-1.5 py-1 text-center font-bold tracking-widest">
                        TANGGAL
                      </th>
                      <th rowSpan={2} className="border border-slate-900 px-1.5 py-1 text-center w-24 bg-slate-200/80 leading-tight">
                        TOTAL HARI TIDAK MASUK
                      </th>
                    </tr>

                    <tr className="bg-slate-50 text-slate-800 text-[9px] font-bold">
                      {daysArray.map(d => {
                        const dayOfWeek = new Date(selectedYear, selectedMonth - 1, d).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        return (
                          <th
                            key={`print-day-${d}`}
                            className={`border border-slate-900 px-0.5 py-1 text-center w-5 min-w-[20px] ${
                              isWeekend ? 'bg-slate-200/90 text-slate-700' : 'bg-white'
                            }`}
                          >
                            {d}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={totalDays + 5}
                          className="border border-slate-900 py-6 text-center text-slate-500 font-medium"
                        >
                          Tidak ada data peserta didik pada kelas terpilih.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student, idx) => {
                        const studentRecords = activeRecords.filter(r => 
                          (r.studentId === student.id || (r.nisn && r.nisn === student.nisn) || (student.nis && r.nis === student.nis)) &&
                          (r.userType === 'STUDENT' || !r.userType)
                        );

                        let absentDaysCount = 0;
                        const nisnDisplay = student.nisn || student.nis || '-';

                        return (
                          <tr key={`print-row-${student.id}`}>
                            <td className="border border-slate-900 px-1 py-1 text-center text-slate-800 tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="border border-slate-900 px-1.5 py-1 text-center font-mono font-medium text-slate-900 tabular-nums">
                              {nisnDisplay}
                            </td>
                            <td className="border border-slate-900 px-2 py-1 font-bold text-slate-900 truncate uppercase text-left">
                              {student.name}
                            </td>
                            <td className="border border-slate-900 px-1 py-1 text-center font-bold text-slate-800">
                              {student.gender || 'L'}
                            </td>

                            {/* Days columns 1..N */}
                            {daysArray.map(day => {
                              const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const dayOfWeek = new Date(selectedYear, selectedMonth - 1, day).getDay();
                              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                              if (isWeekend) {
                                return (
                                  <td
                                    key={`print-cell-${student.id}-${day}`}
                                    className="border border-slate-900 bg-slate-100 text-slate-500 text-center font-mono text-[9px]"
                                  >
                                    -
                                  </td>
                                );
                              }

                              const hasAttended = studentRecords.some(r => 
                                r.dateFormatted === dateStr && 
                                (r.type === 'MASUK' || r.status === 'TEPAT_WAKTU' || r.status === 'TERLAMBAT' || r.status === 'PULANG_CEPAT')
                              );

                              const isPastOrToday = (selectedYear < currentY) || 
                                (selectedYear === currentY && selectedMonth < currentM) || 
                                (selectedYear === currentY && selectedMonth === currentM && day <= currentD);

                              if (hasAttended) {
                                return (
                                  <td
                                    key={`print-cell-${student.id}-${day}`}
                                    className="border border-slate-900 text-center font-bold text-[11px] text-slate-950"
                                  >
                                    ✓
                                  </td>
                                );
                              } else {
                                if (isPastOrToday) {
                                  absentDaysCount++;
                                }
                                return (
                                  <td
                                    key={`print-cell-${student.id}-${day}`}
                                    className="border border-slate-900 text-center"
                                  >
                                    {/* Empty cell if absent on active day */}
                                  </td>
                                );
                              }
                            })}

                            {/* Total Hari Tidak Masuk Column */}
                            <td className="border border-slate-900 px-1.5 py-1 text-center font-mono font-bold text-slate-950 tabular-nums bg-slate-50">
                              {absentDaysCount > 0 ? absentDaysCount : '0'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* SIGNATURES SECTION: Specifically rendered on export / PDF print with blank dotted lines for manual wet signature */}
                <div className="signatures-container mt-8 pt-4 flex items-start justify-between text-xs text-slate-900">
                  {/* Left: Kepala Sekolah (Blank name and blank NIP as requested) */}
                  <div className="signature-box text-center w-64">
                    <p className="font-medium">Mengetahui,</p>
                    <p className="font-bold">Kepala Sekolah</p>
                    <div className="h-16" />
                    <p className="font-bold text-slate-900">( .................................................. )</p>
                    <p className="text-[10px] text-slate-700 font-mono mt-1">NIP. .........................................</p>
                  </div>

                  {/* Right: Wali Kelas / Guru Piket (Blank lines for manual wet signature) */}
                  <div className="signature-box text-center w-64">
                    <p className="font-medium">Kota Depok, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p className="font-bold">Wali Kelas / Guru Piket</p>
                    <div className="h-16" />
                    <p className="font-bold text-slate-900">( .................................................. )</p>
                    <p className="text-[10px] text-slate-700 font-mono mt-1">NIP / NUPTK. .........................................</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <p className="text-[11px] text-slate-400">
                Tip: Pada dialog cetak peramban, pilih orientasi <strong className="text-slate-200">Landscape (Mendatar)</strong> dan ukuran kertas <strong className="text-slate-200">A4</strong>.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handlePrintDocument}
                  disabled={isPrinting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Dokumen (Print / PDF)</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
