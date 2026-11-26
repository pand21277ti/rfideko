import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, SchoolSchedule, AttendanceRecord, PairedDailyAttendance, TeacherPeriodSummary } from '../types';
import { AttendanceStorage } from '../lib/storage';
import {
  exportTeacherAttendanceToExcel,
  exportTeacherAttendanceToCSV,
  printTeacherAttendanceReport,
  pairAttendanceRecords,
  aggregateTeacherPeriodAttendance,
  ExportFilterMeta
} from '../lib/exportUtils';
import { formatToDDMMYYYY } from '../lib/dateUtils';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  CalendarDays,
  CalendarRange,
  Search,
  Filter,
  Users,
  CheckCircle2,
  Clock,
  LogOut,
  Building2,
  RotateCcw,
  UserCheck,
  TrendingUp,
  Award
} from 'lucide-react';
import { TablePagination } from './TablePagination';

interface TeacherReportsProps {
  schedule: SchoolSchedule;
  showToast: (msg: string) => void;
  onNavigateTab: (tab: 'reports' | 'teacher_reports' | 'backup') => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const TeacherReports: React.FC<TeacherReportsProps> = ({
  schedule,
  showToast,
  onNavigateTab
}) => {
  const [teachers, setTeachers] = useState<Teacher[]>(() => AttendanceStorage.getTeachers());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => AttendanceStorage.getAttendanceRecords());

  useEffect(() => {
    const unsub = AttendanceStorage.subscribeToSync(() => {
      setTeachers(AttendanceStorage.getTeachers());
      setAttendanceRecords(AttendanceStorage.getAttendanceRecords());
    });
    return () => unsub();
  }, []);

  // Format Tampilan: 'daily_logs' (Log Per Baris) atau 'periodic_summary' (Rekapitulasi Periode Setara Siswa)
  const [reportViewFormat, setReportViewFormat] = useState<'daily_logs' | 'periodic_summary'>('daily_logs');

  // Period Selector Mode
  const [reportPeriodMode, setReportPeriodMode] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');

  // Daily Mode: Single Day
  const [reportDailyDate, setReportDailyDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Weekly Mode: Reference Date for Week
  const [reportWeeklyRefDate, setReportWeeklyRefDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Monthly Mode: Month & Year
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());

  // Custom Range Mode
  const [reportCustomStartDate, setReportCustomStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [reportCustomEndDate, setReportCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [gateFilter, setGateFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('time_desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Auto-reset page when period or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [reportPeriodMode, reportDailyDate, reportWeeklyRefDate, reportMonth, reportYear, reportCustomStartDate, reportCustomEndDate, searchTerm, gateFilter, statusFilter, sortBy, reportViewFormat]);

  // Calculate effective date bounds and labels
  const { effectiveStartDate, effectiveEndDate, periodTitleLabel, periodFilePrefix } = useMemo(() => {
    if (reportPeriodMode === 'daily') {
      const targetDate = reportDailyDate || new Date().toISOString().split('T')[0];
      return {
        effectiveStartDate: targetDate,
        effectiveEndDate: targetDate,
        periodTitleLabel: `Harian (${targetDate})`,
        periodFilePrefix: `Harian_Guru_${targetDate}`
      };
    }

    if (reportPeriodMode === 'weekly') {
      const ref = reportWeeklyRefDate ? new Date(reportWeeklyRefDate) : new Date();
      const day = ref.getDay(); // 0 = Sunday
      const diffToMonday = ref.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(ref.setDate(diffToMonday));
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);

      const startStr = monday.toISOString().split('T')[0];
      const endStr = saturday.toISOString().split('T')[0];

      return {
        effectiveStartDate: startStr,
        effectiveEndDate: endStr,
        periodTitleLabel: `Mingguan (${startStr} s/d ${endStr})`,
        periodFilePrefix: `Mingguan_Guru_${startStr}_sd_${endStr}`
      };
    }

    if (reportPeriodMode === 'monthly') {
      const startStr = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(reportYear, reportMonth, 0).getDate();
      const endStr = `${reportYear}-${String(reportMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      return {
        effectiveStartDate: startStr,
        effectiveEndDate: endStr,
        periodTitleLabel: `Bulanan (${MONTH_NAMES[reportMonth - 1]} ${reportYear})`,
        periodFilePrefix: `Bulanan_Guru_${reportYear}_${String(reportMonth).padStart(2, '0')}`
      };
    }

    // Custom
    const startStr = reportCustomStartDate || new Date().toISOString().split('T')[0];
    const endStr = reportCustomEndDate || new Date().toISOString().split('T')[0];
    return {
      effectiveStartDate: startStr,
      effectiveEndDate: endStr,
      periodTitleLabel: `Periode (${startStr} s/d ${endStr})`,
      periodFilePrefix: `Periode_Guru_${startStr}_sd_${endStr}`
    };
  }, [reportPeriodMode, reportDailyDate, reportWeeklyRefDate, reportMonth, reportYear, reportCustomStartDate, reportCustomEndDate]);

  // Filter raw records for teachers in date range
  const filteredTeacherRecords = useMemo(() => {
    return attendanceRecords.filter(r => {
      const isTeacher = r.userType === 'TEACHER' || !!r.teacherId || !!r.teacherName;
      if (!isTeacher) return false;

      const recDate = r.dateFormatted || (r.timestamp ? r.timestamp.split('T')[0] : '');
      if (effectiveStartDate && recDate < effectiveStartDate) return false;
      if (effectiveEndDate && recDate > effectiveEndDate) return false;

      if (gateFilter !== 'ALL' && r.gateLocation !== gateFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchesName = r.teacherName?.toLowerCase().includes(q);
        const matchesNip = r.nip?.toLowerCase().includes(q);
        const matchesPos = r.teacherPosition?.toLowerCase().includes(q);
        const matchesRfid = r.rfidUid?.toLowerCase().includes(q);
        if (!matchesName && !matchesNip && !matchesPos && !matchesRfid) return false;
      }

      return true;
    });
  }, [attendanceRecords, effectiveStartDate, effectiveEndDate, gateFilter, searchTerm]);

  // Paired daily summary for teachers (Tap Masuk + Tap Pulang)
  const pairedTeacherAttendance = useMemo(() => {
    const paired = pairAttendanceRecords(filteredTeacherRecords, 'TEACHER');

    const filteredByStatus = paired.filter(item => {
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'TEPAT_WAKTU') return item.entryStatus === 'TEPAT_WAKTU';
      if (statusFilter === 'TERLAMBAT') return item.entryStatus === 'TERLAMBAT';
      if (statusFilter === 'PULANG') return item.exitTime && item.exitTime !== 'Belum Pulang';
      return true;
    });

    return filteredByStatus.sort((a, b) => {
      if (sortBy === 'time_desc') {
        return (b.dateFormatted + (b.entryTime || '')).localeCompare(a.dateFormatted + (a.entryTime || ''));
      }
      if (sortBy === 'time_asc') {
        return (a.dateFormatted + (a.entryTime || '')).localeCompare(b.dateFormatted + (b.entryTime || ''));
      }
      if (sortBy === 'name_asc') {
        return (a.teacherName || '').localeCompare(b.teacherName || '');
      }
      if (sortBy === 'name_desc') {
        return (b.teacherName || '').localeCompare(a.teacherName || '');
      }
      return 0;
    });
  }, [filteredTeacherRecords, statusFilter, sortBy]);

  // Aggregate Periodic Summary for Teachers
  const periodicTeacherSummary = useMemo(() => {
    const aggregated = aggregateTeacherPeriodAttendance(filteredTeacherRecords, teachers);
    // Filter by search term if provided
    let list = aggregated.summaries;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(s => s.teacherName.toLowerCase().includes(q) || s.nip.toLowerCase().includes(q) || s.teacherPosition.toLowerCase().includes(q));
    }
    return {
      ...aggregated,
      summaries: list
    };
  }, [filteredTeacherRecords, teachers, searchTerm]);

  // Paginated items
  const paginatedDailyAttendance = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return pairedTeacherAttendance.slice(start, start + pageSize);
  }, [pairedTeacherAttendance, currentPage, pageSize]);

  const paginatedPeriodicAttendance = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return periodicTeacherSummary.summaries.slice(start, start + pageSize);
  }, [periodicTeacherSummary.summaries, currentPage, pageSize]);

  // Statistics calculation for the filtered period
  const stats = useMemo(() => {
    const totalTeachersCount = teachers.length;
    const presentCount = pairedTeacherAttendance.length;
    const onTimeCount = pairedTeacherAttendance.filter(p => p.entryStatus === 'TEPAT_WAKTU').length;
    const lateCount = pairedTeacherAttendance.filter(p => p.entryStatus === 'TERLAMBAT').length;
    const checkoutCount = pairedTeacherAttendance.filter(p => p.exitTime && p.exitTime !== 'Belum Pulang').length;

    return {
      totalTeachersCount,
      presentCount,
      onTimeCount,
      lateCount,
      checkoutCount
    };
  }, [teachers, pairedTeacherAttendance]);

  // Build FilterMeta for exports
  const getFilterMeta = (): ExportFilterMeta => ({
    schoolName: schedule.schoolName,
    periodLabel: periodTitleLabel,
    totalRecords: reportViewFormat === 'periodic_summary' ? periodicTeacherSummary.summaries.length : pairedTeacherAttendance.length,
    onTimeCount: stats.onTimeCount,
    lateCount: stats.lateCount,
    isPeriodMode: reportViewFormat === 'periodic_summary',
    customTeachers: teachers
  });

  // Handlers for Export
  const handleExportExcel = () => {
    const meta = getFilterMeta();
    exportTeacherAttendanceToExcel(
      pairedTeacherAttendance,
      `Rekap_Presensi_Guru_${periodFilePrefix}`,
      `Presensi Guru ${periodTitleLabel}`,
      meta
    );
    showToast(`Laporan Excel presensi guru (${reportViewFormat === 'periodic_summary' ? 'Format Periode' : 'Format Log'}) berhasil diunduh`);
  };

  const handleExportCSV = () => {
    const meta = getFilterMeta();
    exportTeacherAttendanceToCSV(
      pairedTeacherAttendance,
      `Rekap_Presensi_Guru_${periodFilePrefix}`,
      meta
    );
    showToast(`Laporan CSV presensi guru (${reportViewFormat === 'periodic_summary' ? 'Format Periode' : 'Format Log'}) berhasil diunduh`);
  };

  const handlePrint = () => {
    const meta = getFilterMeta();
    printTeacherAttendanceReport(
      pairedTeacherAttendance,
      schedule.schoolName,
      `Laporan Presensi Guru & PTK - ${periodTitleLabel}`,
      `Periode: ${periodTitleLabel}`,
      meta
    );
  };

  return (
    <div className="space-y-4 text-left">
      {/* Top Header & Export Buttons */}
      <div className="p-4 bg-[#0e1a38] border border-blue-900/30 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Rekap & Laporan Presensi Guru & Pegawai
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Laporan presensi lengkap dengan rincian jam tap masuk, jam tap pulang, persentase kehadiran, dan tingkat ketepatan waktu.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="btn-primary-sharp text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Download Laporan Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Ekspor Excel</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="btn-secondary-sharp text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Download Laporan CSV (Titik-koma ; Format Excel)"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="btn-secondary-sharp text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Cetak Laporan PDF Resmi"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak PDF</span>
          </button>
        </div>
      </div>

      {/* Period Selector & Format Switcher */}
      <div className="p-4 bg-[#0e1a38] border border-blue-900/30 rounded-xl space-y-4">
        {/* Toggle View Format: Rekap Log Harian vs Rekapitulasi Periode */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-900/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Format Laporan:</span>
            <div className="inline-flex rounded-md p-1 bg-[#070d1e] border border-blue-900/30">
              <button
                type="button"
                onClick={() => setReportViewFormat('daily_logs')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  reportViewFormat === 'daily_logs'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Rekap Log Harian (Per Tap)
              </button>
              <button
                type="button"
                onClick={() => setReportViewFormat('periodic_summary')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  reportViewFormat === 'periodic_summary'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Rekapitulasi Periode Guru (Setara Siswa)
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Periode: <strong className="text-white font-mono">{periodTitleLabel}</strong>
          </div>
        </div>

        {/* Period Mode Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setReportPeriodMode('daily')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              reportPeriodMode === 'daily'
                ? 'bg-blue-600 text-white'
                : 'bg-[#070d1e] text-slate-400 hover:text-white border border-blue-900/30'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Harian</span>
          </button>

          <button
            onClick={() => setReportPeriodMode('weekly')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              reportPeriodMode === 'weekly'
                ? 'bg-blue-600 text-white'
                : 'bg-[#070d1e] text-slate-400 hover:text-white border border-blue-900/30'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Mingguan</span>
          </button>

          <button
            onClick={() => setReportPeriodMode('monthly')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              reportPeriodMode === 'monthly'
                ? 'bg-blue-600 text-white'
                : 'bg-[#070d1e] text-slate-400 hover:text-white border border-blue-900/30'
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>Bulanan</span>
          </button>

          <button
            onClick={() => setReportPeriodMode('custom')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              reportPeriodMode === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-[#070d1e] text-slate-400 hover:text-white border border-blue-900/30'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Kustom Periode</span>
          </button>
        </div>

        {/* Date Inputs based on mode */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {reportPeriodMode === 'daily' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-300">Pilih Tanggal:</label>
              <input
                type="date"
                value={reportDailyDate}
                onChange={(e) => setReportDailyDate(e.target.value)}
                className="input-control-sharp font-mono text-xs"
              />
            </div>
          )}

          {reportPeriodMode === 'weekly' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-300">Pilih Hari dalam Minggu:</label>
              <input
                type="date"
                value={reportWeeklyRefDate}
                onChange={(e) => setReportWeeklyRefDate(e.target.value)}
                className="input-control-sharp font-mono text-xs"
              />
            </div>
          )}

          {reportPeriodMode === 'monthly' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-300">Bulan & Tahun:</label>
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(Number(e.target.value))}
                className="input-control-sharp text-xs"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                min="2020"
                max="2035"
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
                className="input-control-sharp w-20 font-mono text-xs"
              />
            </div>
          )}

          {reportPeriodMode === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-300">Dari:</label>
                <input
                  type="date"
                  value={reportCustomStartDate}
                  onChange={(e) => setReportCustomStartDate(e.target.value)}
                  className="input-control-sharp font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-300">Sampai:</label>
                <input
                  type="date"
                  value={reportCustomEndDate}
                  onChange={(e) => setReportCustomEndDate(e.target.value)}
                  className="input-control-sharp font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Filter controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Nama Guru, NIP, Jabatan..."
              className="w-full bg-[#070d1e] border border-blue-900/30 rounded pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#070d1e] border border-blue-900/30 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Status Kedisiplinan: Semua</option>
              <option value="TEPAT_WAKTU">Hadir Tepat Waktu</option>
              <option value="TERLAMBAT">Hadir Terlambat</option>
              <option value="PULANG">Sudah Tap Pulang</option>
            </select>
          </div>

          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-[#070d1e] border border-blue-900/30 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="time_desc">Waktu: Paling Baru</option>
              <option value="time_asc">Waktu: Paling Pagi</option>
              <option value="name_asc">Nama Guru A - Z</option>
              <option value="name_desc">Nama Guru Z - A</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-[#0e1a38] border border-blue-900/30">
          <div className="flex items-center justify-between text-slate-300 text-xs font-semibold mb-1">
            <span>Total Guru Terdaftar</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold font-mono text-white">{stats.totalTeachersCount}</p>
          <span className="text-[10px] text-slate-400">Guru & Tenaga Kependidikan</span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#0e1a38] border border-emerald-900/30">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold mb-1">
            <span>Hadir Tepat Waktu</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">{stats.onTimeCount}</p>
          <span className="text-[10px] text-slate-400">Presensi sebelum {schedule.entryDeadlineTime} WIB</span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#0e1a38] border border-amber-900/30">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold mb-1">
            <span>Hadir Terlambat</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold font-mono text-amber-400">{stats.lateCount}</p>
          <span className="text-[10px] text-slate-400">Tap setelah {schedule.entryDeadlineTime} WIB</span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#0e1a38] border border-blue-900/30">
          <div className="flex items-center justify-between text-sky-400 text-xs font-semibold mb-1">
            <span>Sudah Tap Pulang</span>
            <LogOut className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold font-mono text-sky-400">{stats.checkoutCount}</p>
          <span className="text-[10px] text-slate-400">Tap keluar sore</span>
        </div>
      </div>

      {/* VIEW FORMAT 1: REKAPITULASI PERIODE GURU (SETARA SISWA) */}
      {reportViewFormat === 'periodic_summary' ? (
        <div className="border border-blue-900/30 rounded-lg overflow-hidden bg-[#070d1e]">
          <div className="p-3.5 bg-[#0e1a38] border-b border-blue-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-2xs bg-blue-500" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Rekapitulasi Periode Guru ({periodicTeacherSummary.summaries.length} Guru & PTK)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Hari Efektif: <strong className="text-white">{periodicTeacherSummary.totalEffectiveDays} Hari</strong> | Rata-rata Masuk: <strong className="text-blue-300">{periodicTeacherSummary.collectiveAvgEntry}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0e1a38] text-slate-300 font-semibold uppercase tracking-wider border-b border-blue-900/30">
                <tr>
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3">NIP / NUPTK</th>
                  <th className="p-3">Nama Guru / PTK</th>
                  <th className="p-3">Jabatan / Mapel</th>
                  <th className="p-3 text-center text-emerald-400">Hadir</th>
                  <th className="p-3 text-center text-rose-400">Tidak Hadir</th>
                  <th className="p-3 text-center text-emerald-400">Tepat Waktu</th>
                  <th className="p-3 text-center text-amber-400">Terlambat</th>
                  <th className="p-3">Rata-rata Masuk</th>
                  <th className="p-3">Rata-rata Pulang</th>
                  <th className="p-3 text-center">% Kehadiran</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/20 text-slate-200">
                {periodicTeacherSummary.summaries.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-slate-500 font-medium">
                      Tidak ada data guru yang cocok dengan kriteria.
                    </td>
                  </tr>
                ) : (
                  paginatedPeriodicAttendance.map((item, idx) => {
                    const rowNum = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={item.teacherId} className="hover:bg-blue-900/10 transition-colors">
                        <td className="p-3 text-center text-slate-500 font-mono text-[11px]">{rowNum}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-300">{item.nip || '-'}</td>
                        <td className="p-3 font-semibold text-white">{item.teacherName}</td>
                        <td className="p-3 text-slate-300 text-[11px]">{item.teacherPosition || '-'}</td>
                        <td className="p-3 text-center font-bold text-emerald-400 font-mono">
                          {item.daysPresent} Hari
                        </td>
                        <td className={`p-3 text-center font-bold font-mono ${item.daysAbsent > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                          {item.daysAbsent} Hari
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-400">{item.onTimeCount}</td>
                        <td className={`p-3 text-center font-mono ${item.lateCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                          {item.lateCount}
                        </td>
                        <td className="p-3 font-mono text-slate-300 text-[11px]">{item.averageEntryTime}</td>
                        <td className="p-3 font-mono text-slate-300 text-[11px]">{item.averageExitTime}</td>
                        <td className="p-3 text-center font-bold font-mono text-white">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${item.attendancePercentage >= 90 ? 'bg-emerald-500/20 text-emerald-300' : item.attendancePercentage >= 75 ? 'bg-blue-500/20 text-blue-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {item.attendancePercentage}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-[11px] font-medium text-slate-300">{item.summaryStatus}</span>
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
            totalItems={periodicTeacherSummary.summaries.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="guru"
          />
        </div>
      ) : (
        /* VIEW FORMAT 2: REKAP LOG HARIAN (PER TAP) */
        <div className="border border-blue-900/30 rounded-lg overflow-hidden bg-[#070d1e]">
          <div className="p-3.5 bg-[#0e1a38] border-b border-blue-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-500" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Rincian Log Presensi Guru ({pairedTeacherAttendance.length} Catatan Presensi)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Format: Waktu Tap Masuk & Tap Pulang Lengkap
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0e1a38] text-slate-300 font-semibold uppercase tracking-wider border-b border-blue-900/30">
                <tr>
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3">Tanggal (DD-MM-YYYY)</th>
                  <th className="p-3">Nama Guru / Gelar</th>
                  <th className="p-3">NIP / Jabatan</th>
                  <th className="p-3">UID RFID</th>
                  <th className="p-3 text-emerald-400">Jam Tap Masuk</th>
                  <th className="p-3 text-blue-400">Jam Tap Pulang</th>
                  <th className="p-3 text-center">Status Kehadiran</th>
                  <th className="p-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/20 text-slate-200">
                {pairedTeacherAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-500 font-medium">
                      Belum ada catatan presensi kartu guru pada periode yang dipilih.
                    </td>
                  </tr>
                ) : (
                  paginatedDailyAttendance.map((item, idx) => {
                    const isLate = item.entryStatus === 'TERLAMBAT';
                    const hasExit = item.exitTime && item.exitTime !== 'Belum Pulang';
                    const rowNum = (currentPage - 1) * pageSize + idx + 1;

                    return (
                      <tr key={item.id} className="hover:bg-blue-900/10 transition-colors">
                        <td className="p-3 text-center text-slate-500 font-mono text-[11px]">{rowNum}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-300 font-medium whitespace-nowrap">
                          {formatToDDMMYYYY(item.dateFormatted)}
                        </td>
                        <td className="p-3">
                          <p className="font-semibold text-white text-xs">{item.teacherName || 'Guru'}</p>
                        </td>
                        <td className="p-3">
                          <span className="font-mono text-slate-300 text-[11px] block">{item.nip || '-'}</span>
                          <span className="text-[10px] text-slate-400 block">{item.teacherPosition || 'PTK'}</span>
                        </td>
                        <td className="p-3 font-mono text-slate-300 text-[11px]">
                          {item.rfidUid}
                        </td>
                        {/* Tap Masuk */}
                        <td className="p-3">
                          <div className="font-mono font-bold text-xs text-emerald-400">
                            {item.entryTime || '-'}
                          </div>
                          <span className="text-[9px] text-slate-400 block font-medium">
                            {item.entryGate || 'Pintu Utama'}
                          </span>
                        </td>
                        {/* Tap Pulang */}
                        <td className="p-3">
                          {hasExit ? (
                            <>
                              <div className="font-mono font-bold text-xs text-blue-400">
                                {item.exitTime}
                              </div>
                              <span className="text-[9px] text-slate-400 block font-medium">
                                {item.exitGate || 'Pintu Utama'}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-500 text-[10px] italic">Belum Pulang</span>
                          )}
                        </td>
                        {/* Status */}
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider font-mono ${
                            isLate
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {isLate ? 'TERLAMBAT' : 'TEPAT WAKTU'}
                          </span>
                        </td>
                        {/* Keterangan */}
                        <td className="p-3 text-[11px] text-slate-400">
                          {isLate && item.lateMinutes ? (
                            <span className="text-amber-400 font-semibold font-mono">Terlambat +{item.lateMinutes} mnt</span>
                          ) : hasExit ? (
                            <span className="text-emerald-400 font-medium">Hadir Lengkap</span>
                          ) : (
                            <span className="text-slate-400">Masuk</span>
                          )}
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
            totalItems={pairedTeacherAttendance.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="presensi guru"
          />
        </div>
      )}

    </div>
  );
};
