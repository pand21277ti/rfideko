import React, { useState, useMemo, useEffect } from 'react';
import { 
  Clock, 
  Download, 
  Search, 
  Filter, 
  AlertTriangle, 
  Users, 
  TrendingDown, 
  ShieldAlert, 
  Eye, 
  X, 
  Calendar, 
  Printer, 
  CheckCircle2, 
  FileSpreadsheet,
  ChevronRight,
  MapPin,
  Sparkles,
  ArrowUpDown,
  GraduationCap
} from 'lucide-react';
import { Student, AttendanceRecord, SchoolSchedule } from '../types';
import { TablePagination } from './TablePagination';
import { formatToDDMMYYYY } from '../lib/dateUtils';
import { executePrintHtml } from '../lib/exportUtils';

export interface LateRecordDetail {
  id: string;
  dateKey: string;
  dateFormatted: string;
  timeFormatted: string;
  deadlineTime: string;
  lateMinutes: number;
  gateName: string;
  notes?: string;
  isManualOverride?: boolean;
}

export interface StudentLateSummary {
  student: Student;
  lateCount: number;
  totalLateMinutes: number;
  averageLateMinutes: number;
  maxLateMinutes: number;
  latestLateDate: string;
  records: LateRecordDetail[];
}

interface StudentLateRecapReportProps {
  students: Student[];
  records: AttendanceRecord[];
  classes: string[];
  schedule: SchoolSchedule;
  onNavigateTab?: (tab: string) => void;
}

export const StudentLateRecapReport: React.FC<StudentLateRecapReportProps> = ({
  students,
  records,
  classes,
  schedule,
  onNavigateTab
}) => {
  // 1. FILTER STATES (3 Selects + 1 Search as requested)
  const [periodFilter, setPeriodFilter] = useState<'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all_time'>('this_month');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [thresholdFilter, setThresholdFilter] = useState<'min_3' | 'min_1' | 'min_5' | 'min_10' | 'all'>('min_1');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'count_desc' | 'count_asc' | 'duration_desc' | 'name_asc'>('count_desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Auto-reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [periodFilter, classFilter, thresholdFilter, searchQuery, sortBy]);

  // 2. MODAL STATE
  const [selectedStudent, setSelectedStudent] = useState<StudentLateSummary | null>(null);

  // Helper date calculations for Week / Month
  const dateRanges = useMemo(() => {
    const now = new Date();
    
    // Today
    const todayStr = now.toISOString().split('T')[0];
    
    // This week (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Last week (8-14 days ago)
    const fourteenDaysAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const eightDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // This month (1st of this month to today)
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    // Last month (1st of last month to last day of last month)
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    return {
      todayStr,
      sevenDaysAgo,
      fourteenDaysAgo,
      eightDaysAgo,
      firstOfThisMonth,
      firstOfLastMonth,
      lastOfLastMonth
    };
  }, []);

  // Filter records based on selected period
  const filteredRecords = useMemo(() => {
    return (records || []).filter(rec => {
      if (!rec) return false;
      // Only entry attendance records with status TERLAMBAT
      if (rec.type !== 'MASUK' || rec.status !== 'TERLAMBAT') return false;
      
      const recDate = rec.dateFormatted || (rec.timestamp ? rec.timestamp.split('T')[0] : '');
      if (!recDate) return false;

      switch (periodFilter) {
        case 'this_week':
          return recDate >= dateRanges.sevenDaysAgo && recDate <= dateRanges.todayStr;
        case 'last_week':
          return recDate >= dateRanges.fourteenDaysAgo && recDate <= dateRanges.eightDaysAgo;
        case 'this_month':
          return recDate >= dateRanges.firstOfThisMonth && recDate <= dateRanges.todayStr;
        case 'last_month':
          return recDate >= dateRanges.firstOfLastMonth && recDate <= dateRanges.lastOfLastMonth;
        case 'all_time':
        default:
          return true;
      }
    });
  }, [records, periodFilter, dateRanges]);

  // Aggregate late statistics per student
  const studentSummaries = useMemo<StudentLateSummary[]>(() => {
    // Map records by studentId or nisn
    const map = new Map<string, {
      student: Student;
      records: LateRecordDetail[];
      totalLateMinutes: number;
    }>();

    // Initialize all students if threshold is 'all', or initialize when encountered
    (students || []).forEach(st => {
      if (!st || !st.id) return;
      map.set(st.id, {
        student: st,
        records: [],
        totalLateMinutes: 0
      });
    });

    // Populate with filtered late records
    filteredRecords.forEach(rec => {
      let st = (students || []).find(s => s && (s.id === rec.studentId || (s.nisn && rec.nisn && s.nisn === rec.nisn)));
      if (!st && rec.studentName) {
        // Fallback virtual student if deleted from master
        st = {
          id: rec.studentId || `unknown-${rec.nisn || rec.id}`,
          name: rec.studentName,
          nisn: rec.nisn || '-',
          class: rec.studentClass || 'Umum',
          rfidUid: rec.rfidUid || '',
          gender: 'L'
        };
      }

      if (st) {
        let entry = map.get(st.id);
        if (!entry) {
          entry = { student: st, records: [], totalLateMinutes: 0 };
          map.set(st.id, entry);
        }

        // Calculate late duration in minutes
        let durationMinutes = Number(rec.lateMinutes);
        if (!durationMinutes || isNaN(durationMinutes) || durationMinutes <= 0) {
          // Estimate from deadline
          const deadline = schedule?.entryDeadlineTime || '06:30';
          const [dh, dm] = deadline.split(':').map(Number);
          const recTime = rec.timeFormatted || '07:00';
          const [th, tm] = recTime.split(':').map(Number);
          const diff = ((th || 0) * 60 + (tm || 0)) - ((dh || 0) * 60 + (dm || 0));
          durationMinutes = Math.max(1, diff);
        }

        const dateVal = rec.dateFormatted || (rec.timestamp ? rec.timestamp.split('T')[0] : '') || '-';
        const timeVal = rec.timeFormatted || (rec.timestamp && rec.timestamp.includes('T') ? rec.timestamp.split('T')[1].substring(0, 8) : '07:00');

        entry.records.push({
          id: rec.id || `late-${Math.random()}`,
          dateKey: dateVal,
          dateFormatted: dateVal,
          timeFormatted: timeVal,
          deadlineTime: schedule?.entryDeadlineTime || '06:30',
          lateMinutes: durationMinutes,
          gateName: rec.gateName || (rec.gateLocation === 'pintu_belakang' ? 'Pintu Belakang' : 'Pintu Depan'),
          notes: rec.notes,
          isManualOverride: rec.isManualOverride
        });

        entry.totalLateMinutes += durationMinutes;
      }
    });

    // Convert map to array and compute metrics
    const results: StudentLateSummary[] = [];

    map.forEach(val => {
      const lateCount = val.records.length;
      const totalLateMinutes = val.totalLateMinutes;
      const averageLateMinutes = lateCount > 0 ? Math.round(totalLateMinutes / lateCount) : 0;
      
      let maxLateMinutes = 0;
      let latestDate = '-';

      if (lateCount > 0) {
        // Sort individual records newest first safely
        val.records.sort((a, b) => (b.dateKey || b.dateFormatted || '').localeCompare(a.dateKey || a.dateFormatted || ''));
        maxLateMinutes = val.records.reduce((max, r) => Math.max(max, r.lateMinutes || 0), 0);
        latestDate = val.records[0]?.dateFormatted ? formatToDDMMYYYY(val.records[0].dateFormatted) : '-';
      }

      results.push({
        student: val.student,
        lateCount,
        totalLateMinutes,
        averageLateMinutes,
        maxLateMinutes,
        latestLateDate: latestDate,
        records: val.records
      });
    });

    return results;
  }, [students, filteredRecords, schedule]);

  // Apply filters: Class, Threshold, Search, Sort
  const filteredData = useMemo(() => {
    return studentSummaries.filter(item => {
      if (!item || !item.student) return false;
      // 1. Class filter
      if (classFilter !== 'ALL' && item.student.class !== classFilter) {
        return false;
      }

      // 2. Threshold filter
      if (thresholdFilter === 'min_3' && item.lateCount < 3) return false;
      if (thresholdFilter === 'min_5' && item.lateCount < 5) return false;
      if (thresholdFilter === 'min_10' && item.lateCount < 10) return false;
      if (thresholdFilter === 'min_1' && item.lateCount < 1) return false;

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (item.student.name || '').toLowerCase().includes(q);
        const nisMatch = item.student.nis ? item.student.nis.toLowerCase().includes(q) : false;
        const nisnMatch = item.student.nisn ? item.student.nisn.includes(q) : false;
        const classMatch = (item.student.class || '').toLowerCase().includes(q);
        if (!nameMatch && !nisMatch && !nisnMatch && !classMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'count_desc') return b.lateCount - a.lateCount || b.totalLateMinutes - a.totalLateMinutes;
      if (sortBy === 'count_asc') return a.lateCount - b.lateCount;
      if (sortBy === 'duration_desc') return b.totalLateMinutes - a.totalLateMinutes;
      if (sortBy === 'name_asc') return (a.student.name || '').localeCompare(b.student.name || '');
      return 0;
    });
  }, [studentSummaries, classFilter, thresholdFilter, searchQuery, sortBy]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Calculate Overall KPIs for the Cards
  const kpis = useMemo(() => {
    const studentsWithLate = studentSummaries.filter(s => s && s.lateCount > 0);
    const totalLateInstances = studentsWithLate.reduce((sum, s) => sum + (s.lateCount || 0), 0);
    const totalMinutesWasted = studentsWithLate.reduce((sum, s) => sum + (s.totalLateMinutes || 0), 0);
    const criticalThresholdCount = studentSummaries.filter(s => s && s.lateCount >= 3).length;

    const avgDuration = totalLateInstances > 0 ? Math.round(totalMinutesWasted / totalLateInstances) : 0;

    return {
      totalStudentsWithLate: studentsWithLate.length,
      totalLateInstances,
      totalMinutesWasted,
      criticalThresholdCount,
      avgDuration
    };
  }, [studentSummaries]);

  // EXPORT CSV HANDLER
  const handleExportCSV = () => {
    const periodLabel = 
      periodFilter === 'this_week' ? 'Minggu_Ini' :
      periodFilter === 'last_week' ? 'Minggu_Lalu' :
      periodFilter === 'this_month' ? 'Bulan_Ini' :
      periodFilter === 'last_month' ? 'Bulan_Lalu' : 'Semua_Waktu';

    const headers = [
      'No',
      'Nama Siswa',
      'NISN',
      'Kelas',
      'Frekuensi Terlambat (Kali)',
      'Akumulasi Durasi (Menit)',
      'Rata-rata Durasi (Menit)',
      'Terlambat Terlama (Menit)',
      'Terakhir Terlambat',
      'Kategori Pelanggaran'
    ];

    const rows = filteredData.map((item, idx) => {
      const category = 
        item.lateCount >= 5 ? 'Kritis (SP 1 / Panggilan Orang Tua)' :
        item.lateCount >= 3 ? 'Peringatan (> 3 Kali)' :
        item.lateCount >= 1 ? 'Peringatan Ringan' : 'Disiplin';

      const sName = (item.student?.name || 'Siswa').replace(/"/g, '""');
      const sNisn = item.student?.nisn || '-';
      const sClass = item.student?.class || '-';

      return [
        idx + 1,
        `"${sName}"`,
        `"${sNisn}"`,
        `"${sClass}"`,
        item.lateCount,
        item.totalLateMinutes,
        item.averageLateMinutes,
        item.maxLateMinutes,
        `"${item.latestLateDate}"`,
        `"${category}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekap_Keterlambatan_Siswa_${periodLabel}_${formatToDDMMYYYY(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // PRINT STUDENT NOTICE LETTER
  const handlePrintStudentNotice = (summary: StudentLateSummary) => {

    const rowsHtml = summary.records.map((r, i) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 6px 8px; text-align: center;">${i + 1}</td>
        <td style="padding: 6px 8px; font-family: monospace;">${formatToDDMMYYYY(r.dateFormatted)}</td>
        <td style="padding: 6px 8px; font-family: monospace; font-weight: bold; color: #b45309;">${r.timeFormatted} WIB</td>
        <td style="padding: 6px 8px; font-family: monospace; color: #475569;">${r.deadlineTime} WIB</td>
        <td style="padding: 6px 8px; font-family: monospace; font-weight: bold; color: #dc2626;">+${r.lateMinutes} Menit</td>
        <td style="padding: 6px 8px; color: #334155;">${r.gateName}</td>
        <td style="padding: 6px 8px; color: #64748b;">${r.notes || (r.isManualOverride ? 'Input Manual Piket' : 'Tap RFID Kiosk')}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Surat Informasi Keterlambatan - ${summary.student.name}</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; padding: 32px; color: #0f172a; line-height: 1.5; }
          .header { text-align: center; border-bottom: 3px double #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .school-title { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .school-sub { font-size: 12px; color: #475569; margin-top: 4px; }
          .notice-title { font-size: 14px; font-weight: 800; text-align: center; margin-bottom: 20px; text-transform: uppercase; text-decoration: underline; }
          .student-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 11px; font-weight: 700; border-bottom: 2px solid #cbd5e1; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; margin-top: 48px; text-align: center; font-size: 12px; }
          .sig-box { min-height: 70px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="school-title">SMK EKONOMIKA DEPOK</div>
          <div class="school-sub">SISTEM MONITORING PRESENSI & KEDISIPLINAN SISWA (SMART RFID SYSTEM)</div>
          <div class="school-sub">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat</div>
        </div>

        <div class="notice-title">REKAPITULASI CATATAN KETERLAMBATAN SISWA</div>

        <div class="student-info">
          <div><strong>Nama Siswa:</strong> ${summary.student.name}</div>
          <div><strong>NISN:</strong> ${summary.student.nisn || '-'}</div>
          <div><strong>Kelas / Rombel:</strong> ${summary.student.class}</div>
          <div><strong>Total Keterlambatan:</strong> <span style="color: #dc2626; font-weight: bold;">${summary.lateCount} Kali</span></div>
          <div><strong>Akumulasi Durasi:</strong> <span style="color: #dc2626; font-weight: bold;">${summary.totalLateMinutes} Menit</span></div>
          <div><strong>Rata-rata Terlambat:</strong> ${summary.averageLateMinutes} Menit / Kedatangan</div>
        </div>

        <p style="font-size: 12px; margin-bottom: 12px;">
          Berikut rincian riwayat data keterlambatan siswa yang tercatat secara real-time pada sistem gerbang RFID sekolah:
        </p>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">No</th>
              <th>Hari / Tanggal</th>
              <th>Waktu Tap</th>
              <th>Batas Masuk</th>
              <th>Durasi Terlambat</th>
              <th>Pintu Gerbang</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="signatures">
          <div>
            <p>Mengetahui,<br><strong>Guru Bimbingan Konseling / Piket</strong></p>
            <div class="sig-box"></div>
            <p>( .................................................... )</p>
          </div>
          <div>
            <p>Depok, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br><strong>Orang Tua / Wali Siswa</strong></p>
            <div class="sig-box"></div>
            <p>( .................................................... )</p>
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    executePrintHtml(html, `Surat Informasi Keterlambatan - ${summary.student.name}`);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">

      {/* 2. PAGE HEADER CONTAINER */}
      <div className="card-container flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                Rekap Keterlambatan Mingguan & Bulanan
              </h1>
              <span className="badge-sharp bg-amber-500/10 text-amber-300 border-amber-500/30">
                DISIPLIN SISWA
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Monitoring data keterlambatan siswa, frekuensi pelanggaran jam masuk, dan akumulasi durasi menit keterlambatan.
            </p>
          </div>
        </div>

        {/* Action Button: Export CSV */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="btn-primary-sharp"
            title="Download Rekap Keterlambatan dalam Format CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 3. KPI SUMMARY CARDS (Consistent 4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        
        {/* Card 1: Total Siswa Terlambat */}
        <div className="card-container flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Siswa Terlambat
            </span>
            <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
              {kpis.totalStudentsWithLate}
              <span className="text-xs font-normal text-slate-400 ml-1.5 font-sans">Siswa</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Dari total {students.length} siswa terdaftar
            </p>
          </div>
        </div>

        {/* Card 2: Total Frekuensi Terlambat */}
        <div className="card-container flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Kejadian Terlambat
            </span>
            <div className="w-8 h-8 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-rose-400 font-mono tabular-nums">
              {kpis.totalLateInstances}
              <span className="text-xs font-normal text-slate-400 ml-1.5 font-sans">Kali</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Pelanggaran batas jam masuk {schedule.entryDeadlineTime || '06:30'} WIB
            </p>
          </div>
        </div>

        {/* Card 3: Akumulasi Waktu Terbuang */}
        <div className="card-container flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Akumulasi Durasi
            </span>
            <div className="w-8 h-8 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-100 font-mono tabular-nums">
              {kpis.totalMinutesWasted}
              <span className="text-xs font-normal text-slate-400 ml-1.5 font-sans">Menit</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Rata-rata keterlambatan {kpis.avgDuration} menit/kejadian
            </p>
          </div>
        </div>

        {/* Card 4: Siswa Perlu Penanganan (> 3 Kali) */}
        <div className="card-container flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Ambang Batas &gt; 3 Kali
            </span>
            <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-amber-400 font-mono tabular-nums">
              {kpis.criticalThresholdCount}
              <span className="text-xs font-normal text-slate-400 ml-1.5 font-sans">Siswa</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Perlu perhatian dan pembinaan
            </p>
          </div>
        </div>

      </div>

      {/* 4. BARIS FILTER (3 Dropdown Selects + Search Box) */}
      <div className="card-container space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Select 1: Pilih Bulan/Minggu */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Pilih Bulan/Minggu
            </label>
            <div className="relative">
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as any)}
                className="input-control-sharp w-full pr-8 appearance-none cursor-pointer"
              >
                <option value="this_week">Minggu Ini (7 Hari Terakhir)</option>
                <option value="last_week">Minggu Lalu (Hari Ke 8-14)</option>
                <option value="this_month">Bulan Ini (November 2026)</option>
                <option value="last_month">Bulan Lalu (Oktober 2026)</option>
                <option value="all_time">Semua Waktu / Keseluruhan</option>
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Select 2: Pilih Kelas */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Pilih Kelas
            </label>
            <div className="relative">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="input-control-sharp w-full pr-8 appearance-none cursor-pointer"
              >
                <option value="ALL">Semua Kelas ({students.length} Siswa)</option>
                {classes.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Select 3: Ambang Batas Terlambat (> 3 Kali) */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Ambang Batas Terlambat
            </label>
            <div className="relative">
              <select
                value={thresholdFilter}
                onChange={(e) => setThresholdFilter(e.target.value as any)}
                className="input-control-sharp w-full pr-8 appearance-none cursor-pointer"
              >
                <option value="min_1">Minimal 1 Kali (Semua Pelanggar)</option>
                <option value="min_3">&gt; 3 Kali (Standar Pembinaan)</option>
                <option value="min_5">&gt; 5 Kali (Kategori Berat)</option>
                <option value="min_10">&gt; 10 Kali (Kategori Sangat Kritis)</option>
                <option value="all">Semua Siswa (Termasuk 0 Kali Terlambat)</option>
              </select>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Pencarian Cepat Nama / NISN */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Cari Nama / NISN
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atau NISN..."
                className="input-control-sharp w-full pl-9 pr-8"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Sorting Options & Result Count */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
          <div className="text-slate-400 font-medium">
            Menampilkan <strong className="text-white font-semibold font-mono tabular-nums">{filteredData.length}</strong> siswa berdasarkan filter aktif.
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px] font-semibold">Urutkan:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-700">
              <button
                type="button"
                onClick={() => setSortBy('count_desc')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  sortBy === 'count_desc' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Terlambat Terbanyak
              </button>
              <button
                type="button"
                onClick={() => setSortBy('duration_desc')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  sortBy === 'duration_desc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Durasi Terlama
              </button>
              <button
                type="button"
                onClick={() => setSortBy('name_asc')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  sortBy === 'name_asc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Nama (A-Z)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. TABEL DATA RESPENSIF (Columns: Nama Siswa, NISN, Kelas, Frekuensi Telat, Akumulasi Durasi, Aksi) */}
      <div className="table-container-sharp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
              <tr>
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">NISN</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4 text-center">Frekuensi Terlambat</th>
                <th className="py-3 px-4 text-right">Akumulasi Durasi</th>
                <th className="py-3 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                      <div className="w-10 h-10 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-500">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-white">Tidak Ada Data Keterlambatan</p>
                        <p className="text-xs text-slate-400">
                          {thresholdFilter === 'min_3' 
                            ? 'Tidak ada siswa yang terlambat melebihi 3 kali pada periode ini.' 
                            : 'Semua siswa hadir tepat waktu atau tidak ada siswa yang cocok dengan filter.'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => {
                  const isCritical = item.lateCount >= 5;
                  const isWarning = item.lateCount >= 3;
                  const rowIdx = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr 
                      key={item.student.id} 
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isWarning ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-3 px-4 text-center text-slate-500 font-mono tabular-nums">
                        {rowIdx}
                      </td>

                      {/* Nama Siswa */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded font-bold flex items-center justify-center text-xs shrink-0 border ${
                            item.student.gender === 'P'
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {item.student.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-white block truncate">
                              {item.student.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              ID: {item.student.rfidUid || '-'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* NIS & NISN */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-300 tabular-nums">
                        {item.student.nis ? (
                          <div>
                            <span className="text-white font-bold">{item.student.nis}</span>
                            <span className="block text-[10px] text-slate-400">NISN: {item.student.nisn || '-'}</span>
                          </div>
                        ) : (
                          item.student.nisn || '-'
                        )}
                      </td>

                      {/* Kelas */}
                      <td className="py-3 px-4">
                        <span className="badge-sharp bg-slate-800 text-slate-300 border-slate-700">
                          {item.student.class}
                        </span>
                      </td>

                      {/* Frekuensi Telat (Kali) */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-sm tabular-nums">
                          <span className={`badge-sharp ${
                            isCritical 
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                              : isWarning 
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                              : item.lateCount > 0
                              ? 'bg-slate-800 text-slate-300 border-slate-700'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {item.lateCount} kali
                          </span>
                          {isCritical ? (
                            <span className="text-[10px] text-rose-400 font-semibold hidden sm:inline">SP 1</span>
                          ) : isWarning ? (
                            <span className="text-[10px] text-amber-400 font-semibold hidden sm:inline">Panggilan</span>
                          ) : null}
                        </div>
                      </td>

                      {/* Akumulasi Durasi (Menit) */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-bold text-sm text-slate-100 tabular-nums">
                          {item.totalLateMinutes} <span className="text-xs font-normal text-slate-400">Mnt</span>
                        </div>
                        {item.totalLateMinutes >= 60 && (
                          <span className="text-[10px] text-slate-400 font-mono block">
                            ~{Math.floor(item.totalLateMinutes / 60)}j {item.totalLateMinutes % 60}m
                          </span>
                        )}
                      </td>

                      {/* Aksi: Tombol 'Detail' */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(item)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded text-xs font-semibold transition-all flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                          title="Lihat Rincian Riwayat Harian Keterlambatan"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={filteredData.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemName="siswa"
        />
      </div>

      {/* 6. MODAL DETAIL STATIS RIWAYAT HARIAN ANAK TERSEBUT */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="modal-dialog-container max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-100 p-0">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-700 flex items-center justify-between bg-slate-900 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded flex items-center justify-center text-sm font-bold border ${
                  selectedStudent.student.gender === 'P'
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {selectedStudent.student.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {selectedStudent.student.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    NISN: {selectedStudent.student.nisn || '-'} • Kelas: {selectedStudent.student.class}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Mini KPI Metrics */}
            <div className="p-3 sm:p-4 bg-slate-950/60 border-b border-slate-800 grid grid-cols-3 gap-2.5 shrink-0 text-center">
              <div className="card-container-compact text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Keterlambatan</span>
                <strong className="text-base sm:text-lg font-bold text-amber-400 font-mono tabular-nums block mt-0.5">
                  {selectedStudent.lateCount} Kali
                </strong>
              </div>
              <div className="card-container-compact text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Akumulasi Waktu</span>
                <strong className="text-base sm:text-lg font-bold text-rose-400 font-mono tabular-nums block mt-0.5">
                  {selectedStudent.totalLateMinutes} Menit
                </strong>
              </div>
              <div className="card-container-compact text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Rata-rata Terlambat</span>
                <strong className="text-base sm:text-lg font-bold text-slate-200 font-mono tabular-nums block mt-0.5">
                  ~{selectedStudent.averageLateMinutes} Menit
                </strong>
              </div>
            </div>

            {/* Modal Body: Riwayat Harian Anak */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase text-slate-300 tracking-wider">
                  Daftar Riwayat Kejadian Keterlambatan
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  Batas Sekolah: {schedule.entryDeadlineTime || '06:30'} WIB
                </span>
              </div>

              {selectedStudent.records.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded border border-slate-800">
                  <p className="text-xs">Tidak ada catatan keterlambatan pada periode ini.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedStudent.records.map((rec, i) => (
                    <div 
                      key={rec.id}
                      className="p-3 bg-slate-950/70 border border-slate-800 rounded flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded bg-slate-900 text-slate-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border border-slate-800">
                          {i + 1}
                        </span>
                        <div>
                          <strong className="text-white block font-medium">
                            {formatToDDMMYYYY(rec.dateFormatted)}
                          </strong>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-emerald-400" />
                            {rec.gateName}
                            {rec.isManualOverride && ' (Manual Piket)'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-rose-400 tabular-nums">
                          +{rec.lateMinutes} Menit
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Tap: {rec.timeFormatted} WIB
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-3 sm:p-4 border-t border-slate-700 bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handlePrintStudentNotice(selectedStudent)}
                className="btn-secondary-sharp"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>Cetak Lembar Peringatan</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="btn-secondary-sharp"
              >
                Tutup Rincian
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
