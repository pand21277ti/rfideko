import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AttendanceRecord, AttendanceStats, SchoolSchedule, Student, AuthUser, DailyAttendanceRecap } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { 
  exportAttendanceToExcel, 
  exportAttendanceToCSV, 
  printAttendanceReport, 
  printAbsentStudentsReport, 
  printArrivalRankingReport,
  ExportFilterMeta
} from '../lib/exportUtils';
import { hasUserPermission } from '../lib/permissions';
import { DayRolloverModal } from './DayRolloverModal';
import { WeeklyAttendanceBarChart } from './WeeklyAttendanceBarChart';
import { StudentMonthlyMatrixReport } from './StudentMonthlyMatrixReport';
import { StudentEarlyLeaderboard } from './StudentEarlyLeaderboard';
import { StudentLateLeaderboard } from './StudentLateLeaderboard';
import { SchoolLogo } from './SchoolLogo';
import { formatToDDMMYYYY, formatToIndonesianDate } from '../lib/dateUtils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import { 
  UserCheck, 
  Clock, 
  AlertTriangle, 
  Search, 
  Sliders, 
  Users, 
  CheckCircle2, 
  MapPin, 
  RefreshCw,
  LogOut,
  FileSpreadsheet,
  Download,
  Printer,
  UserX,
  BarChart3,
  ShieldAlert,
  Award,
  Trophy,
  Database,
  Calendar,
  Sparkles,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  Check,
  X,
  SlidersHorizontal,
  Info,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Maximize2,
  Minimize2,
  Monitor,
  Wifi,
  WifiOff,
  ArrowUpRight,
  Sun,
  Moon
} from 'lucide-react';

interface GuruPiketDashboardProps {
  schedule: SchoolSchedule;
  onOpenManualCheckin: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  onOpenKioskMode?: () => void;
  onOpenOfflineModal?: () => void;
  isMuted?: boolean;
  setIsMuted?: (muted: boolean) => void;
}

export const GuruPiketDashboard: React.FC<GuruPiketDashboardProps> = ({
  schedule,
  onOpenManualCheckin,
  currentUser,
  onLogout,
  onOpenKioskMode,
  onOpenOfflineModal,
  isMuted,
  setIsMuted
}) => {
  // Main Sidebar Navigation Tabs (Peringkat Siswa dipisahkan menjadi sub-menu mandiri)
  const [activeMainTab, setActiveMainTab] = useState<'monitoring' | 'monthly_matrix' | 'leaderboard_early' | 'leaderboard_late'>('monitoring');
  const [isLeaderboardMenuOpen, setIsLeaderboardMenuOpen] = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(true);

  // Sub Tab in Monitoring View: 3 Sub-Menu (Statistik, Data Kehadiran, Siswa Belum Hadir)
  const [monitoringSubTab, setMonitoringSubTab] = useState<'statistik' | 'kehadiran' | 'belum_absen'>('statistik');

  // Theme state (Dark Mode / Light Mode)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => AttendanceStorage.getTheme());

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    AttendanceStorage.setTheme(nextTheme);
    setTheme(nextTheme);
  };

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail?.type === 'THEME_CHANGED' && e.detail?.data) {
        setTheme(e.detail.data);
      }
    };
    window.addEventListener('rfid_storage_sync', handleSync);
    return () => window.removeEventListener('rfid_storage_sync', handleSync);
  }, []);

  // Fullscreen state with auto-sync to browser fullscreen changes (e.g. Esc key)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Real-time Cloud Sync state
  const [syncSummary, setSyncSummary] = useState(() => AttendanceStorage.getSyncSummary());
  useEffect(() => {
    const updateSync = () => {
      setSyncSummary(AttendanceStorage.getSyncSummary());
    };
    updateSync();
    window.addEventListener('online', updateSync);
    window.addEventListener('offline', updateSync);
    const interval = setInterval(updateSync, 3000);
    return () => {
      window.removeEventListener('online', updateSync);
      window.removeEventListener('offline', updateSync);
      clearInterval(interval);
    };
  }, []);

  // Sub Tab in Monitoring View
  const [activeSubTab, setActiveSubTab] = useState<'sudah_absen' | 'belum_absen' | 'urutan_kedatangan'>('sudah_absen');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'ALL' | 'MASUK' | 'PULANG'>('ALL');
  
  // Data State
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats>({
    totalStudents: 0,
    totalPresentToday: 0,
    totalOnTime: 0,
    totalLate: 0,
    totalCheckoutsToday: 0,
    totalAlpha: 0,
    frontGateCount: 0,
    backGateCount: 0
  });

  // Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedGateFilter, setSelectedGateFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [chartViewMode, setChartViewMode] = useState<'overall' | 'by_class'>('overall');

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Day Rollover / Archived Daily Recap Modal state
  const [isRecapModalOpen, setIsRecapModalOpen] = useState<boolean>(false);
  const [recapModalData, setRecapModalData] = useState<{
    previousDate: string;
    newDate: string;
    recap?: DailyAttendanceRecap | null;
  } | null>(null);

  // Permission checks
  const canManualCheckin = hasUserPermission(currentUser, 'manual_checkin');
  const canExportRecap = hasUserPermission(currentUser, 'export_recap');
  const canViewRanks = hasUserPermission(currentUser, 'student_ranks');

  const refreshData = () => {
    AttendanceStorage.checkAndProcessDayRollover();
    const students = AttendanceStorage.getStudents();
    const allRecords = AttendanceStorage.getAttendanceRecords();
    const todayStr = AttendanceStorage.getTodayDate();
    const todays = allRecords.filter(r => r.dateFormatted === todayStr);

    setAllStudents(students);
    setTodayRecords(todays);
    setAllAttendanceRecords(allRecords);
    setStats(AttendanceStorage.getStatsToday());
    showToast('Data presensi berhasil disinkronkan');
  };

  useEffect(() => {
    refreshData();

    // Subscribe to realtime changes
    const unsubscribe = AttendanceStorage.subscribeToSync((evt) => {
      if (
        evt.type === 'ATTENDANCE_UPDATED' || 
        evt.type === 'STUDENTS_UPDATED' || 
        evt.type === 'CLASSES_UPDATED' ||
        evt.type === 'DAY_CHANGED' ||
        evt.type === 'DAILY_RECAP_SAVED'
      ) {
        refreshData();
      }
    });

    return () => unsubscribe();
  }, []);

  // Set of student IDs who have checked in today (MASUK)
  const checkedInStudentIds = useMemo(() => {
    return new Set(todayRecords.filter(r => r.type === 'MASUK').map(r => r.studentId));
  }, [todayRecords]);

  // Filtered List of Students who HAVE checked in today
  const filteredPresentRecords = useMemo(() => {
    return todayRecords.filter(rec => {
      const matchesSearch = rec.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (rec.nisn && rec.nisn.includes(searchTerm)) ||
                            rec.studentClass.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = selectedTypeFilter === 'ALL' || rec.type === selectedTypeFilter;
      const matchesGate = selectedGateFilter === 'ALL' || rec.gateLocation === selectedGateFilter;
      const matchesStatus = selectedStatusFilter === 'ALL' || rec.status === selectedStatusFilter;
      const matchesClass = selectedClassFilter === 'ALL' || rec.studentClass === selectedClassFilter;

      return matchesSearch && matchesType && matchesGate && matchesStatus && matchesClass;
    });
  }, [todayRecords, searchTerm, selectedTypeFilter, selectedGateFilter, selectedStatusFilter, selectedClassFilter]);

  // Chronological arrival ranking list (Datang Pertama ke Paling Telat)
  const arrivalRanking = useMemo(() => {
    return AttendanceStorage.getArrivalRankingToday().filter(item => {
      const rec = item.record;
      const matchesSearch = rec.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            rec.studentClass.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClass = selectedClassFilter === 'ALL' || rec.studentClass === selectedClassFilter;
      return matchesSearch && matchesClass;
    });
  }, [searchTerm, selectedClassFilter, todayRecords]);

  // List of Students who HAVE NOT checked in today
  const absentStudents = useMemo(() => {
    return allStudents.filter(std => !checkedInStudentIds.has(std.id));
  }, [allStudents, checkedInStudentIds]);

  const filteredAbsentStudents = useMemo(() => {
    return absentStudents.filter(std => {
      const matchesSearch = std.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (std.nis && std.nis.includes(searchTerm)) ||
                            (std.nisn && std.nisn.includes(searchTerm)) ||
                            std.rfidUid.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            std.class.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClass = selectedClassFilter === 'ALL' || std.class === selectedClassFilter;
      return matchesSearch && matchesClass;
    });
  }, [absentStudents, searchTerm, selectedClassFilter]);

  // Dynamic classes for filter dropdown
  const uniqueClasses = useMemo(() => {
    return Array.from(new Set([...AttendanceStorage.getClasses(), ...allStudents.map(s => s.class)])).filter(Boolean).sort();
  }, [allStudents]);

  // Late students list today
  const lateStudentsToday = useMemo(() => {
    return todayRecords.filter(r => r.status === 'TERLAMBAT' && r.type === 'MASUK');
  }, [todayRecords]);

  // Percentage Calculations for Recharts
  const totalCount = stats.totalStudents || 1;
  const onTimePercentage = Number(((stats.totalOnTime / totalCount) * 100).toFixed(1));
  const latePercentage = Number(((stats.totalLate / totalCount) * 100).toFixed(1));
  const alphaPercentage = Number(((stats.totalAlpha / totalCount) * 100).toFixed(1));
  const totalPresentPercentage = Number((((stats.totalOnTime + stats.totalLate) / totalCount) * 100).toFixed(1));

  // Data for Overall Percentage Bar Chart
  const overallPercentageChartData = useMemo(() => {
    return [
      {
        kategori: 'Tepat Waktu',
        persentase: onTimePercentage,
        jumlah: stats.totalOnTime,
        color: '#10b981', // emerald
        deskripsi: `Hadir sebelum ${schedule.entryDeadlineTime}`
      },
      {
        kategori: 'Terlambat',
        persentase: latePercentage,
        jumlah: stats.totalLate,
        color: '#f59e0b', // amber
        deskripsi: `Lewat ${schedule.entryDeadlineTime} WIB`
      },
      {
        kategori: 'Belum Hadir / Alpha',
        persentase: alphaPercentage,
        jumlah: stats.totalAlpha,
        color: '#f43f5e', // rose
        deskripsi: 'Belum tap kartu RFID'
      }
    ];
  }, [onTimePercentage, latePercentage, alphaPercentage, stats, schedule.entryDeadlineTime]);

  // Data for Class-by-Class Attendance Percentage
  const classPercentageChartData = useMemo(() => {
    return uniqueClasses.map(clsName => {
      const classStudents = allStudents.filter(s => s.class === clsName);
      const totalInClass = classStudents.length;
      const presentInClass = classStudents.filter(s => checkedInStudentIds.has(s.id)).length;
      const lateInClass = todayRecords.filter(r => r.studentClass === clsName && r.status === 'TERLAMBAT' && r.type === 'MASUK').length;
      const onTimeInClass = presentInClass - lateInClass;
      const pct = totalInClass > 0 ? Number(((presentInClass / totalInClass) * 100).toFixed(1)) : 0;
      
      return {
        kelas: clsName,
        persentaseHadir: pct,
        hadir: presentInClass,
        tepatWaktu: onTimeInClass,
        terlambat: lateInClass,
        totalSiswa: totalInClass
      };
    });
  }, [uniqueClasses, allStudents, checkedInStudentIds, todayRecords]);

  // SMART DYNAMIC PRINT FUNCTION (FULLY FILTER-AWARE FOR GURU PIKET)
  const handlePrintCurrentContext = () => {
    const printDateStr = formatToIndonesianDate(new Date());
    const classSubtitle = selectedClassFilter === 'ALL' ? 'Semua Kelas' : `Kelas: ${selectedClassFilter}`;

    if (activeSubTab === 'sudah_absen') {
      if (filteredPresentRecords.length === 0) {
        showToast('Tidak ada data siswa sudah absen yang sesuai filter untuk dicetak');
        return;
      }

      const filterMeta: ExportFilterMeta = {
        schoolName: schedule.schoolName,
        className: selectedClassFilter,
        periodLabel: `Hari Ini (${formatToDDMMYYYY(new Date())})`,
        statusFilter: selectedStatusFilter,
        gateFilter: selectedGateFilter,
        typeFilter: selectedTypeFilter,
        searchTerm: searchTerm,
        totalRecords: filteredPresentRecords.length,
        onTimeCount: filteredPresentRecords.filter(r => r.status === 'TEPAT_WAKTU').length,
        lateCount: filteredPresentRecords.filter(r => r.status === 'TERLAMBAT').length,
        isPeriodMode: false,
        customStudents: allStudents
      };

      printAttendanceReport(
        filteredPresentRecords,
        schedule.schoolName,
        'Laporan Presensi Siswa Hadir Hari Ini',
        `Tanggal: ${printDateStr} | ${classSubtitle}`,
        filterMeta
      );
      showToast('Membuka dialog cetak presensi siswa hadir...');
    } else if (activeSubTab === 'belum_absen') {
      if (filteredAbsentStudents.length === 0) {
        showToast('Tidak ada siswa alpha untuk dicetak (Semua siswa telah hadir)');
        return;
      }

      printAbsentStudentsReport(
        filteredAbsentStudents,
        schedule.schoolName,
        'Laporan Siswa Belum Hadir / Alpha Hari Ini',
        `Tanggal: ${printDateStr} | ${classSubtitle}${searchTerm ? ` | Cari: "${searchTerm}"` : ''}`
      );
      showToast('Membuka dialog cetak daftar siswa belum hadir...');
    } else if (activeSubTab === 'urutan_kedatangan') {
      if (arrivalRanking.length === 0) {
        showToast('Belum ada data kedatangan siswa untuk dicetak');
        return;
      }

      printArrivalRankingReport(
        arrivalRanking,
        schedule.schoolName,
        'Laporan Urutan Kedatangan Siswa Hari Ini',
        `Tanggal: ${printDateStr} | ${classSubtitle}${searchTerm ? ` | Cari: "${searchTerm}"` : ''}`
      );
      showToast('Membuka dialog cetak urutan kedatangan siswa...');
    }
  };

  // SMART DYNAMIC EXCEL EXPORT
  const handleExportExcelContext = () => {
    const classTag = selectedClassFilter === 'ALL' ? 'Semua_Kelas' : selectedClassFilter.replace(/[^a-zA-Z0-9]/g, '_');
    const statusTag = selectedStatusFilter !== 'ALL' ? `_${selectedStatusFilter}` : '';
    const typeTag = selectedTypeFilter !== 'ALL' ? `_${selectedTypeFilter}` : '';
    const filterMeta: ExportFilterMeta = {
      schoolName: schedule.schoolName,
      className: selectedClassFilter,
      periodLabel: `Hari Ini (${formatToDDMMYYYY(new Date())})`,
      statusFilter: selectedStatusFilter,
      gateFilter: selectedGateFilter,
      typeFilter: selectedTypeFilter,
      searchTerm: searchTerm,
      isPeriodMode: false,
      customStudents: allStudents
    };

    if (activeSubTab === 'sudah_absen') {
      if (filteredPresentRecords.length === 0) {
        showToast('Tidak ada data siswa hadir yang sesuai filter untuk diekspor');
        return;
      }
      exportAttendanceToExcel(
        filteredPresentRecords,
        `Presensi_Piket_${classTag}${statusTag}${typeTag}`,
        'Laporan Hadir Hari Ini',
        filterMeta
      );
      showToast('Berhasil mengunduh Excel presensi hadir');
    } else if (activeSubTab === 'urutan_kedatangan') {
      if (arrivalRanking.length === 0) {
        showToast('Tidak ada data urutan kedatangan yang sesuai filter untuk diekspor');
        return;
      }
      exportAttendanceToExcel(
        arrivalRanking.map(i => i.record),
        `Urutan_Kedatangan_Piket_${classTag}`,
        'Urutan Kedatangan Hari Ini',
        filterMeta
      );
      showToast('Berhasil mengunduh Excel urutan kedatangan');
    } else {
      if (todayRecords.length === 0) {
        showToast('Tidak ada data presensi hari ini untuk diekspor');
        return;
      }
      exportAttendanceToExcel(
        todayRecords,
        'Presensi_Piket_Hari_Ini',
        'Laporan Hari Ini',
        filterMeta
      );
      showToast('Berhasil mengunduh Excel presensi hari ini');
    }
  };

  // SMART DYNAMIC CSV EXPORT
  const handleExportCSVContext = () => {
    const classTag = selectedClassFilter === 'ALL' ? 'Semua_Kelas' : selectedClassFilter.replace(/[^a-zA-Z0-9]/g, '_');
    const statusTag = selectedStatusFilter !== 'ALL' ? `_${selectedStatusFilter}` : '';
    const typeTag = selectedTypeFilter !== 'ALL' ? `_${selectedTypeFilter}` : '';
    const filterMeta: ExportFilterMeta = {
      schoolName: schedule.schoolName,
      className: selectedClassFilter,
      periodLabel: `Hari Ini (${formatToDDMMYYYY(new Date())})`,
      statusFilter: selectedStatusFilter,
      gateFilter: selectedGateFilter,
      typeFilter: selectedTypeFilter,
      searchTerm: searchTerm,
      isPeriodMode: false,
      customStudents: allStudents
    };

    if (activeSubTab === 'sudah_absen') {
      if (filteredPresentRecords.length === 0) {
        showToast('Tidak ada data siswa hadir yang sesuai filter untuk diekspor');
        return;
      }
      exportAttendanceToCSV(
        filteredPresentRecords,
        `Presensi_Piket_${classTag}${statusTag}${typeTag}`,
        filterMeta
      );
      showToast('Berhasil mengunduh CSV presensi');
    } else if (activeSubTab === 'urutan_kedatangan') {
      if (arrivalRanking.length === 0) {
        showToast('Tidak ada data urutan kedatangan yang sesuai filter untuk diekspor');
        return;
      }
      exportAttendanceToCSV(
        arrivalRanking.map(i => i.record),
        `Urutan_Kedatangan_Piket_${classTag}`,
        filterMeta
      );
      showToast('Berhasil mengunduh CSV urutan kedatangan');
    } else {
      exportAttendanceToCSV(
        todayRecords,
        'Presensi_Piket_Hari_Ini',
        filterMeta
      );
      showToast('Berhasil mengunduh CSV presensi');
    }
  };

  return (
    <div className={`h-screen w-full max-w-full flex relative overflow-hidden font-sans transition-colors ${
      theme === 'light' ? 'theme-light bg-slate-50 text-slate-900' : 'theme-dark bg-slate-950 text-slate-100'
    }`}>
      
      {/* Mobile Drawer Backdrop */}
      {isSidebarOpen && !isSidebarPinned && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/75 z-40 backdrop-blur-xs transition-opacity cursor-pointer lg:hidden"
          title="Tutup Menu Samping"
        />
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR PANEL KIRI: GOOGLE AI STUDIO MINIMALIST DARK ZINC (PERSIS ADMIN)   */}
      {/* ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#18181b] border-r border-zinc-800/80 flex flex-col transition-all duration-200 ease-in-out shadow-2xl lg:shadow-none shrink-0 ${
          isSidebarPinned
            ? isSidebarOpen
              ? 'lg:relative lg:w-64 lg:shrink-0 lg:translate-x-0 translate-x-0'
              : 'lg:relative lg:w-0 lg:shrink-0 lg:overflow-hidden lg:border-none -translate-x-full'
            : isSidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header with School Brand & Collapse Icon */}
        <div className="h-16 px-4 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-[#18181b]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white p-1 rounded-md shrink-0 shadow-xs flex items-center justify-center">
              <SchoolLogo size="xs" variant="full" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-tight truncate">SMK EKONOMIKA</p>
              <p className="text-[10px] text-zinc-400 tracking-wider truncate">Panel Guru Piket</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              title="Ciutkan Menu Samping"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Sidebar Body with Category Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          
          {/* Section 1: Menu Utama & Monitoring */}
          <div className="space-y-0.5">
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-zinc-400 tracking-wider uppercase">
              Menu Utama & Monitoring
            </div>

            <div className="space-y-0.5">
              {/* Tab 1: Monitoring Hari Ini */}
              <button
                type="button"
                onClick={() => {
                  setActiveMainTab('monitoring');
                  if (!isSidebarPinned || window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors cursor-pointer ${
                  activeMainTab === 'monitoring'
                    ? 'bg-zinc-800 text-white font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Activity className={`w-4 h-4 shrink-0 ${activeMainTab === 'monitoring' ? 'text-blue-400' : 'text-zinc-400'}`} />
                <span className="truncate flex-1">Monitoring Hari Ini</span>
                <span className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded shrink-0 ${
                  activeMainTab === 'monitoring' ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400'
                }`}>
                  {todayRecords.length}
                </span>
              </button>

              {/* Tab 2: Matriks Bulanan Siswa */}
              <button
                type="button"
                onClick={() => {
                  setActiveMainTab('monthly_matrix');
                  if (!isSidebarPinned || window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors cursor-pointer ${
                  activeMainTab === 'monthly_matrix'
                    ? 'bg-zinc-800 text-white font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Calendar className={`w-4 h-4 shrink-0 ${activeMainTab === 'monthly_matrix' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span className="truncate flex-1">Matriks Bulanan Siswa</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded shrink-0 ${
                  activeMainTab === 'monthly_matrix' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' : 'bg-zinc-900 text-zinc-400'
                }`}>
                  1-31
                </span>
              </button>

              {/* Tab 3: Peringkat Siswa (Sub-menu Terpisah Sesuai Permintaan Pengguna) */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setIsLeaderboardMenuOpen(!isLeaderboardMenuOpen)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors cursor-pointer ${
                    activeMainTab === 'leaderboard_early' || activeMainTab === 'leaderboard_late'
                      ? 'bg-zinc-800 text-white font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Trophy className={`w-4 h-4 shrink-0 ${activeMainTab.startsWith('leaderboard') ? 'text-amber-400' : 'text-zinc-400'}`} />
                    <span className="truncate flex-1">Peringkat Siswa</span>
                  </div>
                  {isLeaderboardMenuOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  )}
                </button>

                {isLeaderboardMenuOpen && (
                  <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l border-zinc-800/80 ml-3">
                    {/* Sub-item 1: Siswa Terpagi & Disiplin */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMainTab('leaderboard_early');
                        if (!isSidebarPinned || window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors cursor-pointer ${
                        activeMainTab === 'leaderboard_early'
                          ? 'bg-amber-950/60 text-amber-300 font-semibold border border-amber-800/40 shadow-xs'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">Siswa Terpagi</span>
                    </button>

                    {/* Sub-item 2: Siswa Sering Terlambat */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMainTab('leaderboard_late');
                        if (!isSidebarPinned || window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors cursor-pointer ${
                        activeMainTab === 'leaderboard_late'
                          ? 'bg-rose-950/60 text-rose-300 font-semibold border border-rose-800/40 shadow-xs'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">Sering Terlambat</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Aksi Cepat (Dipindahkan ke Sidebar persis seperti Admin) */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold text-zinc-400 tracking-wider uppercase">
              Aksi Cepat
            </div>

            {/* Layar Kiosk Pintasan */}
            {onOpenKioskMode && (
              <button
                type="button"
                onClick={() => {
                  onOpenKioskMode();
                  if (!isSidebarPinned) setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
                title="Buka Layar Utama Kiosk Tap RFID"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">Layar Kiosk (Tap Siswa)</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>
            )}

            {/* Absen Manual Button */}
            {canManualCheckin && (
              <button
                type="button"
                onClick={() => {
                  onOpenManualCheckin();
                  if (!isSidebarPinned) setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
                title="Input Presensi Manual Siswa Tanpa Kartu"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Sliders className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="truncate">Input Absensi Manual</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>
            )}

            {/* Status Cloud & Auto-Save Button */}
            <button
              type="button"
              onClick={() => {
                if (onOpenOfflineModal) onOpenOfflineModal();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
              title="Status Koneksi Cloud & Antrean Offline"
            >
              <div className="flex items-center gap-2.5 truncate">
                {syncSummary.isOnline ? (
                  <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="truncate">
                  {syncSummary.isOnline ? 'Online Cloud' : 'Offline Tersimpan'}
                </span>
              </div>
              <span className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded shrink-0 ${
                syncSummary.isOnline
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                  : 'bg-amber-950 text-amber-300 border border-amber-800/60'
              }`}>
                {syncSummary.isOnline ? 'Aktif' : `${syncSummary.pendingQueueCount} antre`}
              </span>
            </button>

            {/* Pusat Kontrol Offline */}
            {onOpenOfflineModal && (
              <button
                type="button"
                onClick={() => {
                  onOpenOfflineModal();
                  if (!isSidebarPinned) setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
                title="Buka Pusat Kontrol Sinkronisasi Offline"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Database className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="truncate">Pusat Kontrol Offline</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>
            )}

            {/* Rincian Arsip Harian */}
            <button
              type="button"
              onClick={() => {
                const prevDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                const todayStr = AttendanceStorage.getTodayDate();
                const recap = AttendanceStorage.getDailyRecapByDate(prevDate) || AttendanceStorage.getDailyRecapByDate(todayStr);
                setRecapModalData({
                  previousDate: prevDate,
                  newDate: todayStr,
                  recap
                });
                setIsRecapModalOpen(true);
                if (!isSidebarPinned) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
              title="Lihat Rincian Arsip Otomatis / Pergantian Hari"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Rincian Arsip Harian</span>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            </button>

            {/* Layar Penuh (Fullscreen) Quick Action */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
              title={isFullscreen ? 'Keluar dari Mode Layar Penuh (Esc)' : 'Aktifkan Mode Layar Penuh'}
            >
              <div className="flex items-center gap-2.5 truncate">
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-purple-400 shrink-0" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-purple-400 shrink-0" />
                )}
                <span className="truncate">{isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (Fullscreen)'}</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                {isFullscreen ? 'Exit' : 'F11'}
              </span>
            </button>

            {/* Mode Tema (Dark / Light Mode Toggle) */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-100'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
              }`}
              title={theme === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
            >
              <div className="flex items-center gap-2.5 truncate">
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
                )}
                <span className="truncate">Mode Tema</span>
              </div>
              <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full shrink-0 border transition-all ${
                theme === 'light'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700/60'
              }`}>
                {theme === 'light' ? 'Terang' : 'Gelap'}
              </span>
            </button>
          </div>

          {/* Quick Info Box in Sidebar */}
          <div className="pt-2 border-t border-zinc-800/60">
            <div className="bg-zinc-900/80 rounded-lg p-3 border border-zinc-800/80 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-zinc-400 font-semibold">
                <span>Total Siswa:</span>
                <span className="text-white font-mono font-bold">{stats.totalStudents}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Hadir Hari Ini:</span>
                <span className="text-emerald-400 font-mono font-bold">{stats.totalPresentToday} ({totalPresentPercentage}%)</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Terlambat:</span>
                <span className="text-amber-400 font-mono font-bold">{stats.totalLate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Footer: User Account Widget (Persis seperti AdminDashboard) */}
        <div className="p-3 border-t border-zinc-800/80 bg-[#161618] shrink-0">
          <div className="p-2.5 bg-zinc-900/90 rounded-sm border border-zinc-800 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-sm bg-[#0e1d38] text-emerald-300 border border-emerald-500/40 flex items-center justify-center shrink-0 font-mono font-bold text-xs">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'G'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{currentUser?.name || 'Petugas Guru Piket'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-300 text-[9px] font-bold tracking-wider rounded border border-zinc-700/60 uppercase">
                    {currentUser?.role === 'kesiswaan' ? 'KESISWAAN' : 'GURU PIKET'}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">TA 26/27</span>
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  AttendanceStorage.logoutCurrentUser();
                  onLogout();
                }}
                className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Keluar dari Akun (Logout)"
                aria-label="Keluar dari Akun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN VIEWPORT WRAPPER (TOPBAR + SCROLLABLE CONTENT)                       */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#09090b]">
        
        {/* TOPBAR HEADER: GOOGLE AI STUDIO MINIMALIST HEADER (PERSIS LAYOUT ADMIN) */}
        <header className="sticky top-0 z-30 h-16 bg-[#18181b]/95 backdrop-blur-xs border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          
          {/* Left: Sidebar Toggle & Large Bold Page Title with Inline Status Pill */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setIsSidebarPinned(!isSidebarPinned);
                  setIsSidebarOpen(!isSidebarPinned);
                } else {
                  setIsSidebarOpen(!isSidebarOpen);
                }
              }}
              title={isSidebarOpen && isSidebarPinned ? 'Collapse Menu Samping' : 'Buka Menu Samping'}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight truncate">
                {activeMainTab === 'monitoring' && 'Monitoring Presensi Hari Ini'}
                {activeMainTab === 'monthly_matrix' && 'Rekap Matriks Presensi Bulanan Siswa'}
                {activeMainTab === 'leaderboard_early' && 'Peringkat Siswa Terpagi & Disiplin'}
                {activeMainTab === 'leaderboard_late' && 'Peringkat Siswa Sering Terlambat'}
              </h1>
              <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 shrink-0 font-medium">
                <span className="text-white font-semibold">SMK EKONOMIKA</span>
                <span aria-hidden="true" className="text-zinc-600">/</span>
                <span className="font-mono text-zinc-400">TA 2026/2027</span>
                <span aria-hidden="true" className="text-zinc-600">/</span>
                <span className="text-emerald-400 font-semibold">Guru Piket</span>
              </div>
            </div>
          </div>

          {/* Right: Clean minimal action buttons (Persis seperti layout Admin, tombol cetak/ekspor dipindah ke toolbar tabel) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Audio Mute/Unmute toggle (seperti di Admin & header lama) */}
            {setIsMuted && (
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                title={isMuted ? 'Aktifkan Suara Notifikasi' : 'Senyapkan Suara Notifikasi'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}



            {/* Refresh / Sinkronisasi Real-time */}
            <button
              type="button"
              onClick={refreshData}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Sinkronisasi Data Real-Time"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* SCROLLABLE VIEWPORT CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* ========================================================================= */}
          {/* TAB 1: MONITORING HARI INI                                                */}
          {/* ========================================================================= */}
          {activeMainTab === 'monitoring' && (
            <div className="space-y-5">
              
              {/* SUB-MENU NAVIGASI: 3 PILIHAN KONTEN SESUAI JAWABAN PENGGUNA */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#18181b] p-2 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMonitoringSubTab('statistik')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      monitoringSubTab === 'statistik'
                        ? 'bg-zinc-800 text-white shadow-xs font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Ringkasan Statistik</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMonitoringSubTab('kehadiran');
                      setActiveSubTab('sudah_absen');
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      monitoringSubTab === 'kehadiran'
                        ? 'bg-zinc-800 text-white shadow-xs font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Data Kehadiran</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-700/80 text-zinc-300 font-mono">
                      {todayRecords.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMonitoringSubTab('belum_absen');
                      setActiveSubTab('belum_absen');
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      monitoringSubTab === 'belum_absen'
                        ? 'bg-zinc-800 text-white shadow-xs font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
                    }`}
                  >
                    <UserX className="w-3.5 h-3.5 text-rose-400" />
                    <span>Siswa Belum Hadir</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-950/80 text-rose-300 border border-rose-800/60 font-mono">
                      {stats.totalAlpha}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2 px-2 text-xs text-zinc-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400" />
                  <span>Sesi Presensi: <strong className="text-white">{formatToDDMMYYYY(new Date())}</strong></span>
                </div>
              </div>

              {/* --------------------------------------------------------------------- */}
              {/* SUB-VIEW 1: RINGKASAN STATISTIK & GRAFIK                              */}
              {/* --------------------------------------------------------------------- */}
              {monitoringSubTab === 'statistik' && (
                <div className="space-y-6">
                  {/* 5 KPI SUMMARY STATS CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                
                {/* Total Siswa */}
                <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Siswa</span>
                    <Users className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-black text-white font-mono tabular-nums">{stats.totalStudents}</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Siswa Terdaftar</p>
                  </div>
                </div>

                {/* Hadir Tepat Waktu */}
                <div className="bg-[#18181b] border border-emerald-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Tepat Waktu</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2 font-mono tabular-nums">
                      <span className="text-2xl font-black text-emerald-400">{stats.totalOnTime}</span>
                      <span className="text-xs font-bold text-emerald-300">({onTimePercentage}%)</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Sebelum {schedule.entryDeadlineTime}</p>
                  </div>
                </div>

                {/* Hadir Terlambat */}
                <div className="bg-[#18181b] border border-amber-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-amber-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Terlambat</span>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2 font-mono tabular-nums">
                      <span className="text-2xl font-black text-amber-400">{stats.totalLate}</span>
                      <span className="text-xs font-bold text-amber-300">({latePercentage}%)</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Lewat {schedule.entryDeadlineTime} WIB</p>
                  </div>
                </div>

                {/* Belum Absen / Alpha */}
                <div className="bg-[#18181b] border border-rose-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-rose-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Belum Absen</span>
                    <UserX className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2 font-mono tabular-nums">
                      <span className="text-2xl font-black text-rose-400">{stats.totalAlpha}</span>
                      <span className="text-xs font-bold text-rose-300">({alphaPercentage}%)</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Belum Tap Kartu</p>
                  </div>
                </div>

                {/* Sudah Pulang */}
                <div className="bg-[#18181b] border border-blue-900/40 rounded-xl p-4 flex flex-col justify-between shadow-xs col-span-2 lg:col-span-1">
                  <div className="flex items-center justify-between text-blue-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Sudah Pulang</span>
                    <LogOut className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-black text-blue-400 font-mono tabular-nums">{stats.totalCheckoutsToday}</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Tap Absen Keluar</p>
                  </div>
                </div>

              </div>

              {/* 7-DAY ATTENDANCE TREND CHART */}
              <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 sm:p-5 shadow-xs">
                <WeeklyAttendanceBarChart records={allAttendanceRecords} students={allStudents} />
              </div>

              {/* RECHARTS ATTENDANCE PERCENTAGE BAR CHART SECTION */}
              <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 flex items-center justify-center shrink-0">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        Grafik Persentase Kehadiran Siswa Hari Ini
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Visualisasi persentase kehadiran keseluruhan dan perbandingan rasio per rombel kelas hari ini.
                      </p>
                    </div>
                  </div>

                  {/* Toggle Mode: Overall vs By Class */}
                  <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs self-start sm:self-auto">
                    <button
                      onClick={() => setChartViewMode('overall')}
                      className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                        chartViewMode === 'overall'
                          ? 'bg-zinc-800 text-white shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Distribusi Keseluruhan
                    </button>
                    <button
                      onClick={() => setChartViewMode('by_class')}
                      className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                        chartViewMode === 'by_class'
                          ? 'bg-zinc-800 text-white shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Persentase Per Kelas
                    </button>
                  </div>
                </div>

                {/* Overall Percentage Overview Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-medium text-zinc-400">Total Tingkat Kehadiran</span>
                      <p className="text-lg font-black text-white mt-0.5 font-mono tabular-nums">{totalPresentPercentage}%</p>
                    </div>
                    <div className="px-2 py-0.5 rounded text-xs font-bold font-mono tabular-nums bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                      {stats.totalOnTime + stats.totalLate} / {stats.totalStudents} Siswa
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-medium text-zinc-400">Tingkat Ketepatan Waktu</span>
                      <p className="text-lg font-black text-emerald-400 mt-0.5 font-mono tabular-nums">{onTimePercentage}%</p>
                    </div>
                    <div className="px-2 py-0.5 rounded text-xs font-bold font-mono tabular-nums bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                      {stats.totalOnTime} Siswa
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-medium text-zinc-400">Tingkat Keterlambatan</span>
                      <p className="text-lg font-black text-amber-400 mt-0.5 font-mono tabular-nums">{latePercentage}%</p>
                    </div>
                    <div className="px-2 py-0.5 rounded text-xs font-bold font-mono tabular-nums bg-amber-950 text-amber-300 border border-amber-800/60">
                      {stats.totalLate} Siswa
                    </div>
                  </div>
                </div>

                {/* THE RECHARTS BAR CHART */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
                  {chartViewMode === 'overall' ? (
                    <div className="h-64 sm:h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={overallPercentageChartData}
                          margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis
                            dataKey="kategori"
                            stroke="#71717a"
                            tick={{ fill: '#a1a1aa', fontSize: 12, fontWeight: 700 }}
                            axisLine={{ stroke: '#3f3f46' }}
                          />
                          <YAxis
                            stroke="#71717a"
                            tick={{ fill: '#a1a1aa', fontSize: 11 }}
                            unit="%"
                            domain={[0, 100]}
                            axisLine={{ stroke: '#3f3f46' }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-xs space-y-1">
                                    <p className="font-bold text-white flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                                      {data.kategori}
                                    </p>
                                    <p className="text-zinc-300 font-extrabold text-sm font-mono tabular-nums">
                                      {data.jumlah} Siswa ({data.persentase}%)
                                    </p>
                                    <p className="text-[11px] text-zinc-400">{data.deskripsi}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="persentase"
                            radius={[6, 6, 0, 0]}
                            barSize={48}
                            label={{
                              position: 'top',
                              fill: '#f4f4f5',
                              fontSize: 12,
                              fontWeight: 800,
                              formatter: (val: any) => `${val}%`
                            }}
                          >
                            {overallPercentageChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 sm:h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={classPercentageChartData}
                          margin={{ top: 20, right: 20, left: 10, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis
                            dataKey="kelas"
                            stroke="#71717a"
                            tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                            interval={0}
                            angle={-20}
                            textAnchor="end"
                            axisLine={{ stroke: '#3f3f46' }}
                          />
                          <YAxis
                            stroke="#71717a"
                            tick={{ fill: '#a1a1aa', fontSize: 11 }}
                            unit="%"
                            domain={[0, 100]}
                            axisLine={{ stroke: '#3f3f46' }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-xs space-y-1">
                                    <p className="font-bold text-white">Kelas {data.kelas}</p>
                                    <p className="text-emerald-400 font-extrabold text-sm font-mono tabular-nums">
                                      Tingkat Kehadiran: {data.persentaseHadir}%
                                    </p>
                                    <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1 border-t border-zinc-800">
                                      <p>• Total Hadir: <span className="text-white font-bold">{data.hadir}</span> / {data.totalSiswa} Siswa</p>
                                      <p>• Tepat Waktu: <span className="text-emerald-400 font-bold">{data.tepatWaktu}</span></p>
                                      <p>• Terlambat: <span className="text-amber-400 font-bold">{data.terlambat}</span></p>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="persentaseHadir"
                            fill="#3b82f6"
                            radius={[6, 6, 0, 0]}
                            barSize={28}
                            label={{
                              position: 'top',
                              fill: '#93c5fd',
                              fontSize: 10,
                              fontWeight: 700,
                              formatter: (val: any) => `${val}%`
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* LATE ARRIVALS ALERT PANEL */}
              {lateStudentsToday.length > 0 && (
                <div className="bg-[#18181b] border border-amber-900/50 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Daftar Siswa Terlambat Hari Ini ({lateStudentsToday.length} Siswa)</span>
                    </div>
                    <span className="text-xs text-amber-300/80 font-medium">Batas Masuk: {schedule.entryDeadlineTime} WIB</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {lateStudentsToday.map(student => (
                      <div key={student.id} className="bg-zinc-900/90 border border-amber-900/40 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-white text-xs truncate">{student.studentName}</p>
                          <p className="text-[11px] text-zinc-400">{student.studentClass} · {student.gateName}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono tabular-nums bg-amber-950 text-amber-300 border border-amber-800/60">
                            +{student.lateMinutes || 0}m
                          </span>
                          <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{student.timeFormatted}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </div>
              )}

              {/* --------------------------------------------------------------------- */}
              {/* SUB-VIEW 2: DATA KEHADIRAN SISWA (TOOLBAR CSV, EXCEL, CETAK)          */}
              {/* --------------------------------------------------------------------- */}
              {monitoringSubTab === 'kehadiran' && (
                <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
                  
                  {/* Top Toolbar: Switcher & Action Buttons (CSV, Excel, Cetak) */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                    
                    {/* Segmented Sub-Tab Switcher: Sudah Absen vs Urutan Kedatangan */}
                    <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('sudah_absen')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          activeSubTab === 'sudah_absen'
                            ? 'bg-zinc-800 text-white shadow-xs font-bold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Sudah Absen ({filteredPresentRecords.length})</span>
                      </button>

                      {canViewRanks && (
                        <button
                          type="button"
                          onClick={() => setActiveSubTab('urutan_kedatangan')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            activeSubTab === 'urutan_kedatangan'
                              ? 'bg-zinc-800 text-white shadow-xs font-bold'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <span>Urutan Datang ({arrivalRanking.length})</span>
                        </button>
                      )}
                    </div>

                    {/* Action Buttons: CSV, Excel, Cetak (dipindahkan tepat di atas tabel) */}
                    <div className="flex items-center gap-2 self-start lg:self-auto">
                      <button
                        type="button"
                        onClick={handleExportCSVContext}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                        title="Ekspor data kehadiran saat ini ke CSV"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                        <span>CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportExcelContext}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-emerald-300 hover:text-emerald-200 border border-emerald-900/60 rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                        title="Ekspor data kehadiran saat ini ke Excel"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePrintCurrentContext}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                        title="Cetak Laporan Presensi Sesuai Filter"
                      >
                        <Printer className="w-3.5 h-3.5 text-white" />
                        <span>Cetak Laporan</span>
                      </button>
                    </div>
                  </div>

                  {/* Search & Filter Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    {/* Search Input */}
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Cari nama, NISN, kelas..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>

                    {/* Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedClassFilter}
                        onChange={(e) => setSelectedClassFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
                      >
                        <option value="ALL">Semua Kelas</option>
                        {uniqueClasses.map(cls => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>

                      {activeSubTab === 'sudah_absen' && (
                        <>
                          <select
                            value={selectedTypeFilter}
                            onChange={(e) => setSelectedTypeFilter(e.target.value as any)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
                          >
                            <option value="ALL">Semua Tipe</option>
                            <option value="MASUK">Absen Masuk</option>
                            <option value="PULANG">Absen Pulang</option>
                          </select>

                          <select
                            value={selectedStatusFilter}
                            onChange={(e) => setSelectedStatusFilter(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
                          >
                            <option value="ALL">Semua Status</option>
                            <option value="TEPAT_WAKTU">Tepat Waktu</option>
                            <option value="TERLAMBAT">Terlambat</option>
                            <option value="PULANG">Pulang</option>
                          </select>
                        </>
                      )}
                    </div>
                  </div>

                {/* VIEW 1: SISWA SUDAH ABSEN TABLE */}
                {activeSubTab === 'sudah_absen' && (
                  <div className="border border-zinc-800/80 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-900/90 text-zinc-400 uppercase font-semibold border-b border-zinc-800/80 text-[11px]">
                        <tr>
                          <th className="py-3 px-4">Nama Siswa</th>
                          <th className="py-3 px-4">Kelas</th>
                          <th className="py-3 px-4 text-center">Tipe</th>
                          <th className="py-3 px-4">Waktu Masuk</th>
                          <th className="py-3 px-4">Waktu Pulang</th>
                          <th className="py-3 px-4">Titik Gate</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50 bg-[#18181b]/50">
                        {filteredPresentRecords.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-10 text-center text-zinc-500">
                              Tidak ada data siswa yang sudah absen untuk kriteria filter ini.
                            </td>
                          </tr>
                        ) : (
                          filteredPresentRecords.map((rec) => (
                            <tr key={rec.id} className="hover:bg-zinc-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-bold text-white whitespace-nowrap">
                                {rec.studentName}
                              </td>

                              <td className="py-2.5 px-4 font-medium text-zinc-300">
                                {rec.studentClass}
                              </td>

                              <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  rec.type === 'MASUK' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                                }`}>
                                  {rec.type}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                                {rec.type === 'MASUK' ? rec.timeFormatted : '-'}
                              </td>

                              <td className="py-2.5 px-4 font-mono font-bold text-blue-400 whitespace-nowrap">
                                {rec.type === 'PULANG' ? rec.timeFormatted : 'Belum Pulang'}
                              </td>

                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/80 border border-zinc-700/60 text-zinc-200">
                                  <MapPin className="w-3 h-3 text-blue-400" />
                                  {rec.gateName}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                                  rec.status === 'TEPAT_WAKTU'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                    : rec.status === 'TERLAMBAT'
                                    ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                    : 'bg-blue-950 text-blue-400 border border-blue-800/60'
                                }`}>
                                  {rec.status === 'TEPAT_WAKTU' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                  {rec.status === 'TERLAMBAT' && <AlertTriangle className="w-3.5 h-3.5" />}
                                  {rec.status === 'TEPAT_WAKTU' ? 'TEPAT WAKTU' : rec.status === 'TERLAMBAT' ? `TERLAMBAT (+${rec.lateMinutes}m)` : rec.status}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 text-zinc-400 text-[11px]">
                                {rec.notes || '-'}
                                {rec.isManualOverride && (
                                  <span className="ml-1 text-[10px] text-blue-400 font-semibold">(Manual Guru)</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}



                {/* VIEW 3: URUTAN KEDATANGAN TABLE */}
                {activeSubTab === 'urutan_kedatangan' && canViewRanks && (
                  <div className="border border-zinc-800/80 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-900/90 text-zinc-400 uppercase font-semibold border-b border-zinc-800/80 text-[11px]">
                        <tr>
                          <th className="py-3 px-4 text-center" style={{ width: '60px' }}>Urutan</th>
                          <th className="py-3 px-4">Jam Masuk</th>
                          <th className="py-3 px-4">Nama Siswa</th>
                          <th className="py-3 px-4">Kelas</th>
                          <th className="py-3 px-4">Titik Gate</th>
                          <th className="py-3 px-4">Status Kedatangan</th>
                          <th className="py-3 px-4">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50 bg-[#18181b]/50">
                        {arrivalRanking.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-zinc-500">
                              Belum ada siswa yang melakukan tap absen masuk hari ini.
                            </td>
                          </tr>
                        ) : (
                          arrivalRanking.map((item) => (
                            <tr key={item.record.id} className={`hover:bg-zinc-800/40 transition-colors ${
                              item.rank === 1 ? 'bg-amber-950/20' : item.rank <= 3 ? 'bg-zinc-800/30' : ''
                            }`}>
                              
                              <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center w-6 h-5 rounded-sm font-mono font-bold text-xs ${
                                  item.rank === 1 ? 'bg-amber-400 text-slate-950 border border-amber-300' :
                                  item.rank === 2 ? 'bg-zinc-300 text-zinc-950' :
                                  item.rank === 3 ? 'bg-amber-800 text-amber-100' :
                                  'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                }`}>
                                  #{item.rank}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 font-mono font-bold text-amber-300 whitespace-nowrap">
                                {item.record.timeFormatted} WIB
                              </td>

                              <td className="py-2.5 px-4 font-bold text-white whitespace-nowrap">
                                {item.record.studentName}
                              </td>

                              <td className="py-2.5 px-4 font-medium text-zinc-300 whitespace-nowrap">
                                {item.record.studentClass}
                              </td>

                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/80 border border-zinc-700/60 text-zinc-200">
                                  <MapPin className="w-3 h-3 text-blue-400" />
                                  {item.record.gateName}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                                  item.rank === 1
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                    : !item.isLate
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                                }`}>
                                  {item.rank === 1 && (
                                    <span className="inline-flex items-center gap-1">
                                      <Award className="w-3.5 h-3.5 text-amber-400" />
                                      #1 TERCEPAT
                                    </span>
                                  )}
                                  {item.rank > 1 && !item.isLate && (
                                    <span className="inline-flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      TEPAT WAKTU
                                    </span>
                                  )}
                                  {item.isLate && (
                                    <span className="inline-flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                      TERLAMBAT (+{item.record.lateMinutes}m)
                                    </span>
                                  )}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 text-zinc-400 text-[11px]">
                                {item.record.notes || '-'}
                              </td>

                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
              )}

              {/* --------------------------------------------------------------------- */}
              {/* SUB-VIEW 3: SISWA BELUM HADIR (ALPHA) DEDICATED VIEW                  */}
              {/* --------------------------------------------------------------------- */}
              {monitoringSubTab === 'belum_absen' && (
                <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
                  {/* Top Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-800/50 flex items-center justify-center text-rose-400 shrink-0">
                        <UserX className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                          <span>Daftar Siswa Belum Hadir / Alpha Hari Ini</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800/60">
                            {filteredAbsentStudents.length} Siswa
                          </span>
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Siswa yang belum melakukan tap kartu RFID presensi masuk pada gerbang sekolah hari ini.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handlePrintCurrentContext}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-colors shadow-sm cursor-pointer self-start sm:self-auto"
                      title="Cetak Daftar Siswa Belum Hadir / Alpha"
                    >
                      <Printer className="w-3.5 h-3.5 text-white" />
                      <span>Cetak Daftar Alpha</span>
                    </button>
                  </div>

                  {/* Filter bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Cari nama, NIS, NISN, kelas..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <select
                      value={selectedClassFilter}
                      onChange={(e) => setSelectedClassFilter(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
                    >
                      <option value="ALL">Semua Kelas</option>
                      {uniqueClasses.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>

                  {/* Absent Students Table */}
                  <div className="border border-zinc-800/80 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-900/90 text-zinc-400 uppercase font-semibold border-b border-zinc-800/80 text-[11px]">
                        <tr>
                          <th className="py-3 px-4 text-center" style={{ width: '40px' }}>No</th>
                          <th className="py-3 px-4">NIS</th>
                          <th className="py-3 px-4">NISN</th>
                          <th className="py-3 px-4">Nama Siswa</th>
                          <th className="py-3 px-4">Kelas</th>
                          <th className="py-3 px-4">RFID UID</th>
                          <th className="py-3 px-4">Status Kehadiran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50 bg-[#18181b]/50">
                        {filteredAbsentStudents.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-zinc-500">
                              Semua siswa pada kriteria filter ini sudah melakukan presensi hari ini.
                            </td>
                          </tr>
                        ) : (
                          filteredAbsentStudents.map((std, idx) => (
                            <tr key={std.id} className="hover:bg-zinc-800/40 transition-colors">
                              <td className="py-2.5 px-4 text-center text-zinc-500 font-mono">{idx + 1}</td>
                              <td className="py-2.5 px-4 font-mono text-zinc-400">{std.nis || '-'}</td>
                              <td className="py-2.5 px-4 font-mono text-zinc-400">{std.nisn || '-'}</td>
                              <td className="py-2.5 px-4 font-bold text-white whitespace-nowrap">{std.name}</td>
                              <td className="py-2.5 px-4 font-medium text-zinc-300">{std.class}</td>
                              <td className="py-2.5 px-4 font-mono text-zinc-400">{std.rfidUid || '-'}</td>
                              <td className="py-2.5 px-4">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800/60">
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Belum Tap / Alpha</span>
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: REKAP MATRIKS BULANAN SISWA                                        */}
          {/* ========================================================================= */}
          {activeMainTab === 'monthly_matrix' && (
            <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-4 sm:p-5 shadow-xs">
              <StudentMonthlyMatrixReport
                students={allStudents}
                records={allAttendanceRecords}
                classes={uniqueClasses}
                schedule={schedule}
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: PERINGKAT SISWA TERPAGI & DISIPLIN (FULL WIDTH DEDICATED VIEW)     */}
          {/* ========================================================================= */}
          {activeMainTab === 'leaderboard_early' && (
            <div className="w-full">
              <StudentEarlyLeaderboard schedule={schedule} />
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: PERINGKAT SISWA SERING TERLAMBAT (FULL WIDTH DEDICATED VIEW)       */}
          {/* ========================================================================= */}
          {activeMainTab === 'leaderboard_late' && (
            <div className="w-full">
              <StudentLateLeaderboard schedule={schedule} />
            </div>
          )}

        </main>
      </div>

      {/* Day Rollover / Daily Archive Recap Modal */}
      {recapModalData && (
        <DayRolloverModal
          isOpen={isRecapModalOpen}
          onClose={() => setIsRecapModalOpen(false)}
          previousDate={recapModalData.previousDate}
          newDate={recapModalData.newDate}
          recap={recapModalData.recap}
        />
      )}

      {/* FLOATING TOAST FEEDBACK */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-zinc-900 border border-zinc-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
};
