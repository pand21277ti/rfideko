import React, { useState, useEffect, useMemo } from 'react';
import { Student, Teacher, SchoolSchedule, AttendanceRecord, GateLocation, PairedDailyAttendance, SystemUser, Role, DailyAttendanceRecap } from '../types';
import { AttendanceStorage, safeStorageGet, safeStorageSet } from '../lib/storage';
import { 
  exportAttendanceToExcel, 
  exportAttendanceToCSV, 
  exportStudentsToExcel, 
  exportStudentsToCSV, 
  printAttendanceReport, 
  downloadStudentExcelTemplate, 
  downloadStudentCsvTemplate, 
  pairAttendanceRecords, 
  ExportFilterMeta, 
  calculateAverageTime 
} from '../lib/exportUtils';
import { processAndCompressImage } from '../lib/imageUtils';
import { MifareScannerModal } from './MifareScannerModal';
import { BulkImportModal } from './BulkImportModal';
import { MifareGuideModal } from './MifareGuideModal';
import { DayRolloverModal } from './DayRolloverModal';
import { TeacherManagement } from './TeacherManagement';
import { TeacherReports } from './TeacherReports';
import { StudentLateLeaderboard } from './StudentLateLeaderboard';
import { StudentEarlyLeaderboard } from './StudentEarlyLeaderboard';
import { UserManagement } from './UserManagement';
import { OfflineSyncModal } from './OfflineSyncModal';
import { StudentLateRecapReport } from './StudentLateRecapReport';
import { AcademicRolloverModal } from './AcademicRolloverModal';
import { AlumniArchiveManagement } from './AlumniArchiveManagement';
import { TablePagination } from './TablePagination';
import { ErrorBoundary } from './ErrorBoundary';
import { WeeklyAttendanceBarChart } from './WeeklyAttendanceBarChart';
import { StudentMonthlyMatrixReport } from './StudentMonthlyMatrixReport';
import { TeacherLeaderboard } from './TeacherLeaderboard';
import { UserAvatar } from './UserAvatar';
import { formatToDDMMYYYY } from '../lib/dateUtils';
import { 
  HOLIDAY_GREETINGS_PRESETS, 
  HOLIDAY_CATEGORIES, 
  MARQUEE_THEMES_CONFIG, 
  HolidayPreset 
} from '../data/holidayGreetings';
import { 
  ShieldCheck, 
  Users, 
  Clock, 
  Download, 
  Plus, 
  Trash2, 
  Edit3, 
  CreditCard, 
  Save, 
  Upload, 
  Search, 
  Filter, 
  Printer, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Sliders, 
  Sparkles,
  Radio,
  Activity,
  Cpu,
  FileSpreadsheet,
  Megaphone,
  Monitor,
  RefreshCw,
  Building2,
  Scan,
  Database,
  HelpCircle,
  ArrowUpDown,
  CalendarDays,
  CalendarRange,
  RotateCcw,
  CheckSquare,
  Square,
  FileText,
  Image as ImageIcon,
  Camera,
  UploadCloud,
  Eye,
  X,
  GraduationCap,
  Archive,
  FolderPlus,
  Layers,
  School,
  BookOpen,
  AlertCircle,
  ChevronDown,
  UserCheck,
  Menu,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Award,
  AlignCenter,
  AlignLeft,
  Palette,
  Gauge,
  Type,
  Play,
  Moon,
  Sun,
  Flag,
  Zap,
  Check,
  ChevronUp,
  TrendingDown,
  Lock,
  Unlock,
  KeyRound,
  Wifi,
  WifiOff,
  Pin,
  PinOff,
  LogOut,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Maximize2,
  Minimize2,
  ArrowUpRight
} from 'lucide-react';
import { SchoolLogo } from './SchoolLogo';

export interface PeriodicStudentSummary {
  studentId: string;
  nisn: string;
  name: string;
  className: string;
  totalPresent: number;
  daysAbsent: number;
  totalEffectiveDays: number;
  averageEntryTime: string;
  averageExitTime: string;
  onTimeCount: number;
  lateCount: number;
  totalLateMinutes: number;
  punctualityRate: number;
  disciplineGrade: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Perlu Pembinaan';
  dailyLogs: PairedDailyAttendance[];
}

interface AdminDashboardProps {
  schedule: SchoolSchedule;
  setSchedule: (sch: SchoolSchedule) => void;
  onOpenCardPairing: (student: Student) => void;
  onOpenKioskMode?: () => void;
  currentUser?: { username: string; role: Role; name: string } | null;
  onLogout?: () => void;
  onOpenManualCheckin?: () => void;
  onOpenOfflineModal?: () => void;
  isMuted?: boolean;
  setIsMuted?: (muted: boolean) => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  schedule,
  setSchedule,
  onOpenCardPairing,
  onOpenKioskMode,
  currentUser,
  onLogout,
  onOpenManualCheckin,
  onOpenOfflineModal,
  isMuted,
  setIsMuted
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'teachers' | 'classes' | 'schedule' | 'reports' | 'late_reports' | 'teacher_reports' | 'alumni_archive' | 'leaderboard' | 'announcements' | 'backup' | 'users' | 'monthly_matrix' | 'teacher_leaderboard' | 'rfid_simulator'>('overview');

  // RFID Simulator & Debugging State
  const [simulatorSelectedStudentId, setSimulatorSelectedStudentId] = useState<string>('');
  const [simulatorManualUid, setSimulatorManualUid] = useState<string>('');
  const [simulatorGate, setSimulatorGate] = useState<GateLocation>('pintu_depan');
  const [simulatedResultModal, setSimulatedResultModal] = useState<any | null>(null);
  const [simulatorLogs, setSimulatorLogs] = useState<Array<{
    id: string;
    timestamp: string;
    uid: string;
    name: string;
    role: string;
    gate: string;
    status: string;
    success: boolean;
    reason?: string;
  }>>([]);
  const [isAcademicRolloverModalOpen, setIsAcademicRolloverModalOpen] = useState<boolean>(false);
  const [leaderboardSubTab, setLeaderboardSubTab] = useState<'today_arrival' | 'early_rank' | 'late_rank'>('today_arrival');
  const [openMenuDropdown, setOpenMenuDropdown] = useState<'master' | 'reports_db' | null>(null);
  const [isMobileAdminNavOpen, setIsMobileAdminNavOpen] = useState<boolean>(false);
  const [kioskPinInput, setKioskPinInput] = useState<string>(() => AttendanceStorage.getKioskPin() || '1234');
  const [devicePinInput, setDevicePinInput] = useState<string>(() => schedule.deviceSecretPin || '789012');

  // Left Sidebar Navigation State (Pinnable / Collapsible)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = safeStorageGet('admin_sidebar_open');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = safeStorageGet('admin_sidebar_pinned');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const toggleSidebarOpen = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      safeStorageSet('admin_sidebar_open', String(next));
      return next;
    });
  };

  const toggleSidebarPinned = () => {
    setIsSidebarPinned(prev => {
      const next = !prev;
      safeStorageSet('admin_sidebar_pinned', String(next));
      return next;
    });
  };

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

  // Real-time Cloud Sync & Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
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

  // State for Collapsible Sub-Menus in Sidebar (Default collapsed into parent)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catName: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>(() => AttendanceStorage.getSystemUsers());

  // Backup & Restore State
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);

  // ==========================================
  // MASTER DATA KELAS STATE (CLASSES MANAGEMENT)
  // ==========================================
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [classSearchQuery, setClassSearchQuery] = useState<string>('');
  const [classGradeFilter, setClassGradeFilter] = useState<'ALL' | 'X' | 'XI' | 'XII' | 'OTHER'>('ALL');
  const [classSortBy, setClassSortBy] = useState<'name_asc' | 'name_desc' | 'students_desc' | 'students_asc'>('name_asc');

  // Modals for Class Management
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState<boolean>(false);
  const [addClassMode, setAddClassMode] = useState<'single' | 'batch'>('single');
  const [singleClassName, setSingleClassName] = useState<string>('');
  const [singleGradeLevel, setSingleGradeLevel] = useState<string>('X');
  const [batchClassInput, setBatchClassInput] = useState<string>('');

  const [isBulkDeleteClassModalOpen, setIsBulkDeleteClassModalOpen] = useState<boolean>(false);
  const [deleteClassWithStudents, setDeleteClassWithStudents] = useState<boolean>(false);
  const [editingClassModal, setEditingClassModal] = useState<{ oldName: string; newName: string } | null>(null);

  // MIFARE Scanner, Bulk Import & Guide Modals
  const [isMifareScannerOpen, setIsMifareScannerOpen] = useState<boolean>(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);
  const [isMifareGuideOpen, setIsMifareGuideOpen] = useState<boolean>(false);
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState<boolean>(false);
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(() => AttendanceStorage.getPendingSyncQueue().length);

  // Student Form State
  const [isStudentModalOpen, setIsStudentModalOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Bulk Selection State for Deleting Students
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentForm, setStudentForm] = useState<{
    name: string;
    nisn: string;
    nis: string;
    class: string;
    rfidUid: string;
    gender: 'L' | 'P';
    avatarUrl: string;
  }>({
    name: '',
    nisn: '',
    nis: '',
    class: 'X MIPA 1',
    rfidUid: '',
    gender: 'L',
    avatarUrl: ''
  });

  // Schedule Form State
  const [scheduleForm, setScheduleForm] = useState<SchoolSchedule>(schedule);
  const [isResetTodayModalOpen, setIsResetTodayModalOpen] = useState<boolean>(false);

  // ==========================================
  // SEARCH, FILTER & SORT STATE FOR STUDENTS
  // ==========================================
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('ALL');
  const [studentGenderFilter, setStudentGenderFilter] = useState<string>('ALL');
  const [studentRfidFilter, setStudentRfidFilter] = useState<string>('ALL');
  const [studentSortBy, setStudentSortBy] = useState<string>('name_asc');

  // ==========================================
  // PERIOD, FILTER & SORT STATE FOR REPORTS
  // ==========================================
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

  // Report General Filters & Sort
  const [reportSearchTerm, setReportSearchTerm] = useState<string>('');
  const [reportClassFilter, setReportClassFilter] = useState<string>('ALL');
  const [reportGateFilter, setReportGateFilter] = useState<string>('ALL');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('ALL');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('ALL');
  const [reportSortBy, setReportSortBy] = useState<string>('time_desc');

  // Leaderboard filter (ALL, STUDENT, TEACHER)
  const [leaderboardFilter, setLeaderboardFilter] = useState<'ALL' | 'STUDENT' | 'TEACHER'>('STUDENT');

  // ==========================================
  // PAGINATION & MULTI-PERIOD RECAP STATE
  // ==========================================
  const [studentCurrentPage, setStudentCurrentPage] = useState<number>(1);
  const [studentPageSize, setStudentPageSize] = useState<number>(10);

  const [classCurrentPage, setClassCurrentPage] = useState<number>(1);
  const [classPageSize, setClassPageSize] = useState<number>(10);

  const [reportCurrentPage, setReportCurrentPage] = useState<number>(1);
  const [reportPageSize, setReportPageSize] = useState<number>(10);
  const [reportViewFormat, setReportViewFormat] = useState<'aggregated' | 'raw_logs'>('aggregated');
  const [selectedStudentPeriodicDetail, setSelectedStudentPeriodicDetail] = useState<PeriodicStudentSummary | null>(null);

  // Auto-reset pagination to page 1 on filter/search changes
  useEffect(() => {
    setStudentCurrentPage(1);
  }, [studentSearch, studentClassFilter, studentGenderFilter, studentRfidFilter, studentSortBy]);

  useEffect(() => {
    setClassCurrentPage(1);
  }, [classSearchQuery, classGradeFilter, classSortBy]);

  useEffect(() => {
    setReportCurrentPage(1);
  }, [
    reportPeriodMode,
    reportDailyDate,
    reportWeeklyRefDate,
    reportMonth,
    reportYear,
    reportCustomStartDate,
    reportCustomEndDate,
    reportSearchTerm,
    reportClassFilter,
    reportGateFilter,
    reportStatusFilter,
    reportTypeFilter,
    reportSortBy,
    reportViewFormat
  ]);

  // Running Text & Holiday Presets State
  const [selectedHolidayCategory, setSelectedHolidayCategory] = useState<string>('all');
  const [holidaySearchQuery, setHolidaySearchQuery] = useState<string>('');
  const [simulationTapTime, setSimulationTapTime] = useState<string>('07:10');
  const [marqueePreviewSession, setMarqueePreviewSession] = useState<'entry' | 'exit'>('entry');
  const [marqueeActiveEditTab, setMarqueeActiveEditTab] = useState<'entry' | 'exit' | 'all'>('entry');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Day Rollover / Daily Archive Recap Modal State
  const [isArchiveRecapModalOpen, setIsArchiveRecapModalOpen] = useState<boolean>(false);
  const [activeRecapData, setActiveRecapData] = useState<{
    previousDate: string;
    newDate: string;
    recap?: DailyAttendanceRecap | null;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleApplyHolidayPreset = (preset: HolidayPreset) => {
    setScheduleForm(prev => ({
      ...prev,
      announcementText: preset.mainText,
      announcementTextEntry: preset.mainText,
      announcementTextExit: preset.mainText,
      marqueeTheme: preset.theme,
      marqueeDisplayMode: preset.displayMode,
      marqueeSpeed: preset.speed,
      marqueeFontSize: preset.fontSize,
      marqueeBadgeText: preset.badgeText,
      marqueeBadgeIcon: preset.badgeIcon,
      marqueeSubText: preset.subText || ''
    }));
    showToast(`Preset "${preset.title}" diterapkan! Klik tombol Simpan untuk menyiarkan ke monitor.`);
  };

  const refreshAllData = () => {
    setStudents(AttendanceStorage.getStudents());
    setTeachers(AttendanceStorage.getTeachers());
    setClasses(AttendanceStorage.getClasses());
    setAttendanceRecords(AttendanceStorage.getAttendanceRecords());
    setSystemUsers(AttendanceStorage.getSystemUsers());
    const currentSchedule = AttendanceStorage.getSchedule();
    setScheduleForm(currentSchedule);
    setSchedule(currentSchedule);
  };

  useEffect(() => {
    setScheduleForm(schedule);
  }, [schedule]);

  useEffect(() => {
    refreshAllData();

    const updateOffline = () => {
      setOfflinePendingCount(AttendanceStorage.getPendingSyncQueue().length);
    };

    updateOffline();
    window.addEventListener('online', updateOffline);
    window.addEventListener('offline', updateOffline);

    const unsubscribe = AttendanceStorage.subscribeToSync((evt) => {
      if (evt.type === 'SCHEDULE_UPDATED') {
        const sch = AttendanceStorage.getSchedule();
        setScheduleForm(sch);
        setSchedule(sch);
      } else {
        refreshAllData();
      }
      if (
        evt.type === 'OFFLINE_QUEUE_UPDATED' ||
        evt.type === 'OFFLINE_SYNC_COMPLETED' ||
        evt.type === 'NETWORK_STATUS_CHANGED' ||
        evt.type === 'SIMULATE_OFFLINE_CHANGED'
      ) {
        updateOffline();
      }
    });

    return () => {
      window.removeEventListener('online', updateOffline);
      window.removeEventListener('offline', updateOffline);
      unsubscribe();
    };
  }, []);

  // Toggle manual gate override handler
  const handleToggleManualGateOverride = () => {
    const newStatus = !scheduleForm.manualGateOverride;
    const effectiveCooldown = Number(scheduleForm.cooldownSeconds ?? scheduleForm.antiSpamCooldownSeconds ?? 60);
    const updatedSchedule: SchoolSchedule = {
      ...scheduleForm,
      cooldownSeconds: effectiveCooldown,
      antiSpamCooldownSeconds: effectiveCooldown,
      manualGateOverride: newStatus
    };
    AttendanceStorage.saveSchedule(updatedSchedule);
    setSchedule(updatedSchedule);
    setScheduleForm(updatedSchedule);
    if (newStatus) {
      showToast('Mode Buka Gerbang Manual AKTIF: Kiosk dapat menerima tap kartu di luar jam operasional untuk testing & cek bug.');
    } else {
      showToast('Mode Buka Gerbang Manual NONAKTIF: Gerbang kembali mengikuti jadwal normal.');
    }
  };

  // Update schedule handler
  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCooldown = Number(scheduleForm.cooldownSeconds ?? scheduleForm.antiSpamCooldownSeconds ?? 60);
    const updatedSchedule: SchoolSchedule = {
      ...scheduleForm,
      deviceSecretPin: devicePinInput.trim() || scheduleForm.deviceSecretPin || '789012',
      cooldownSeconds: effectiveCooldown,
      antiSpamCooldownSeconds: effectiveCooldown
    };
    AttendanceStorage.saveSchedule(updatedSchedule);
    setSchedule(updatedSchedule);
    setScheduleForm(updatedSchedule);
    showToast('Pengaturan Waktu & Running Text Berhasil Disimpan & Ter-update Realtime!');
  };

  const handleUpdateDevicePin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPin = devicePinInput.trim().replace(/\D/g, '');
    if (!cleanPin || cleanPin.length !== 6) {
      alert('Kunci Rahasia Otorisasi Perangkat harus tepat 6 digit angka!');
      return;
    }
    const updatedSchedule: SchoolSchedule = {
      ...scheduleForm,
      deviceSecretPin: cleanPin
    };
    AttendanceStorage.saveSchedule(updatedSchedule);
    setSchedule(updatedSchedule);
    setScheduleForm(updatedSchedule);
    setDevicePinInput(cleanPin);
    showToast(`Kunci Rahasia Perangkat berhasil diperbarui ke PIN: ${cleanPin}`);
  };

  const handleResetDevicePinDefault = () => {
    const updatedSchedule: SchoolSchedule = {
      ...scheduleForm,
      deviceSecretPin: '789012'
    };
    AttendanceStorage.saveSchedule(updatedSchedule);
    setSchedule(updatedSchedule);
    setScheduleForm(updatedSchedule);
    setDevicePinInput('789012');
    showToast('Kunci Rahasia Perangkat direset ke default: 789012');
  };

  const handleLockTerminalNow = () => {
    if (confirm('Kunci terminal ini sekarang? Layar akan langsung kembali ke halaman Kunci Rahasia Perangkat (Gatekeeper).')) {
      AttendanceStorage.deauthorizeDevice();
      showToast('Terminal berhasil dikunci kembali ke layar Gatekeeper!');
    }
  };

  // =========================================================================
  // CLASS MANAGEMENT LOGIC & ACTION HANDLERS
  // =========================================================================
  const classStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of students) {
      if (s.class) {
        counts[s.class] = (counts[s.class] || 0) + 1;
      }
    }
    return counts;
  }, [students]);

  const filteredAndSortedClasses = useMemo(() => {
    const query = classSearchQuery.trim().toLowerCase();

    const filtered = classes.filter(cls => {
      const matchesSearch = !query || cls.toLowerCase().includes(query);

      let matchesGrade = true;
      if (classGradeFilter === 'X') {
        matchesGrade = cls.startsWith('X ') || cls.startsWith('X-') || cls.startsWith('10 ') || cls.startsWith('10-');
      } else if (classGradeFilter === 'XI') {
        matchesGrade = cls.startsWith('XI ') || cls.startsWith('XI-') || cls.startsWith('11 ') || cls.startsWith('11-');
      } else if (classGradeFilter === 'XII') {
        matchesGrade = cls.startsWith('XII ') || cls.startsWith('XII-') || cls.startsWith('12 ') || cls.startsWith('12-');
      } else if (classGradeFilter === 'OTHER') {
        matchesGrade = !cls.startsWith('X ') && !cls.startsWith('XI ') && !cls.startsWith('XII ') && !cls.startsWith('10') && !cls.startsWith('11') && !cls.startsWith('12');
      }

      return matchesSearch && matchesGrade;
    });

    return [...filtered].sort((a, b) => {
      if (classSortBy === 'name_asc') return a.localeCompare(b, undefined, { numeric: true });
      if (classSortBy === 'name_desc') return b.localeCompare(a, undefined, { numeric: true });
      if (classSortBy === 'students_desc') return (classStudentCounts[b] || 0) - (classStudentCounts[a] || 0);
      if (classSortBy === 'students_asc') return (classStudentCounts[a] || 0) - (classStudentCounts[b] || 0);
      return 0;
    });
  }, [classes, classSearchQuery, classGradeFilter, classSortBy, classStudentCounts]);

  const paginatedClasses = useMemo(() => {
    const start = (classCurrentPage - 1) * classPageSize;
    return filteredAndSortedClasses.slice(start, start + classPageSize);
  }, [filteredAndSortedClasses, classCurrentPage, classPageSize]);

  const handleAddSingleClass = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = singleClassName.trim();
    if (!clean) {
      alert('Nama kelas tidak boleh kosong!');
      return;
    }

    const res = AttendanceStorage.addClass(clean);
    if (!res.success) {
      alert(res.message);
      return;
    }

    setSingleClassName('');
    setIsAddClassModalOpen(false);
    refreshAllData();
    showToast(`${res.message}`);
  };

  const handleAddBatchClasses = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchClassInput.trim()) {
      alert('Masukkan setidaknya satu nama kelas!');
      return;
    }

    // Split by comma or newline
    const names = batchClassInput
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const res = AttendanceStorage.addClasses(names);
    if (!res.success) {
      alert(res.message);
      return;
    }

    setBatchClassInput('');
    setIsAddClassModalOpen(false);
    refreshAllData();
    showToast(`${res.message}`);
  };

  const handleApplyPreset = (presetType: 'SMK' | 'SMA') => {
    let presetList: string[] = [];
    if (presetType === 'SMK') {
      presetList = [
        'X AKL 1', 'X AKL 2', 'X OTKP 1', 'X OTKP 2', 'X BDP 1', 'X BDP 2', 'X TKJ 1', 'X TKJ 2', 'X RPL 1', 'X RPL 2',
        'XI AKL 1', 'XI AKL 2', 'XI OTKP 1', 'XI OTKP 2', 'XI BDP 1', 'XI BDP 2', 'XI TKJ 1', 'XI TKJ 2', 'XI RPL 1', 'XI RPL 2',
        'XII AKL 1', 'XII AKL 2', 'XII OTKP 1', 'XII OTKP 2', 'XII BDP 1', 'XII BDP 2', 'XII TKJ 1', 'XII TKJ 2', 'XII RPL 1', 'XII RPL 2'
      ];
    } else {
      presetList = [
        'X MIPA 1', 'X MIPA 2', 'X MIPA 3', 'X IPS 1', 'X IPS 2', 'X IPS 3',
        'XI MIPA 1', 'XI MIPA 2', 'XI MIPA 3', 'XI IPS 1', 'XI IPS 2', 'XI IPS 3',
        'XII MIPA 1', 'XII MIPA 2', 'XII MIPA 3', 'XII IPS 1', 'XII IPS 2', 'XII IPS 3'
      ];
    }

    if (confirm(`Muat ${presetList.length} kelas standar ${presetType}? Kelas yang belum ada akan langsung didaftarkan.`)) {
      const res = AttendanceStorage.addClasses(presetList);
      refreshAllData();
      showToast(`Berhasil memuat preset ${presetType}! (${res.addedCount} kelas baru ditambahkan)`);
    }
  };

  const handleSelectAllClasses = (checked: boolean) => {
    if (checked) {
      setSelectedClassNames(filteredAndSortedClasses);
    } else {
      setSelectedClassNames([]);
    }
  };

  const handleToggleSelectClass = (className: string) => {
    if (selectedClassNames.includes(className)) {
      setSelectedClassNames(selectedClassNames.filter(c => c !== className));
    } else {
      setSelectedClassNames([...selectedClassNames, className]);
    }
  };

  const handleSingleDeleteClass = (className: string) => {
    const clean = className.trim();
    const studentCount = classStudentCounts[clean] || classStudentCounts[className] || 0;
    let confirmMsg = `Apakah Anda yakin ingin menghapus kelas "${clean}"?`;
    if (studentCount > 0) {
      confirmMsg += `\n\nPeringatan: Terdapat ${studentCount} siswa yang saat ini terdaftar di kelas ini.`;
    }

    if (confirm(confirmMsg)) {
      const res = AttendanceStorage.deleteClass(clean);
      setClasses(res.classes);
      setSelectedClassNames(prev => prev.filter(c => c.trim().toLowerCase() !== clean.toLowerCase()));
      refreshAllData();
      showToast(`${res.message}`);
    }
  };

  const handleConfirmBulkDeleteClasses = () => {
    if (selectedClassNames.length === 0) return;

    const res = AttendanceStorage.bulkDeleteClasses(selectedClassNames, {
      deleteStudents: deleteClassWithStudents
    });

    setClasses(res.classes);
    setSelectedClassNames([]);
    setIsBulkDeleteClassModalOpen(false);
    setDeleteClassWithStudents(false);
    refreshAllData();
    showToast(`${res.message}`);
  };

  const handleSaveRenameClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassModal || !editingClassModal.newName.trim()) return;

    const res = AttendanceStorage.updateClass(editingClassModal.oldName, editingClassModal.newName);
    if (!res.success) {
      alert(res.message);
      return;
    }

    setEditingClassModal(null);
    refreshAllData();
    showToast(`${res.message}`);
  };

  // Open modal to add or edit student
  const openAddStudentModal = () => {
    setEditingStudent(null);
    const defaultClass = classes.length > 0 ? classes[0] : 'X MIPA 1';
    setStudentForm({
      name: '',
      nisn: `00${Math.floor(10000000 + Math.random() * 90000000)}`,
      nis: '',
      class: defaultClass,
      rfidUid: `000${Math.floor(10000000 + Math.random() * 90000000)}`,
      gender: 'L',
      avatarUrl: ''
    });
    setIsStudentModalOpen(true);
  };

  const openEditStudentModal = (student: Student) => {
    setEditingStudent(student);
    setStudentForm({
      name: student.name,
      nisn: student.nisn || '',
      nis: student.nis || '',
      class: student.class,
      rfidUid: student.rfidUid,
      gender: student.gender || 'L',
      avatarUrl: student.avatarUrl || ''
    });
    setIsStudentModalOpen(true);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = (studentForm.name || '').trim();
    const cleanClass = (studentForm.class || '').trim();
    const cleanNisn = (studentForm.nisn || '').trim();
    const cleanNis = (studentForm.nis || '').trim();
    const cleanRfid = (studentForm.rfidUid || '').trim();

    if (!cleanName || !cleanRfid) {
      alert('Nama dan RFID UID wajib diisi!');
      return;
    }

    // Also auto-register class if new
    if (cleanClass && !classes.some(c => c.trim().toLowerCase() === cleanClass.toLowerCase())) {
      AttendanceStorage.addClass(cleanClass);
    }

    if (editingStudent) {
      const updated: Student = {
        ...editingStudent,
        ...studentForm,
        name: cleanName,
        class: cleanClass,
        nisn: cleanNisn,
        nis: cleanNis || undefined,
        rfidUid: cleanRfid
      };
      AttendanceStorage.updateStudent(updated);
      showToast(`Data siswa "${updated.name}" berhasil diperbarui!`);
    } else {
      const newStudent: Student = {
        id: `std-${Date.now()}`,
        name: cleanName,
        class: cleanClass,
        nisn: cleanNisn,
        nis: cleanNis || undefined,
        rfidUid: cleanRfid,
        gender: studentForm.gender || 'L',
        avatarUrl: studentForm.avatarUrl || undefined
      };
      AttendanceStorage.addStudent(newStudent);
      showToast(`Siswa baru "${newStudent.name}" berhasil ditambahkan!`);
    }

    setIsStudentModalOpen(false);
    refreshAllData();
  };

  const handleDeleteStudent = (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus data siswa "${name}"?`)) {
      AttendanceStorage.deleteStudent(id);
      refreshAllData();
      showToast(`Data siswa "${name}" berhasil dihapus dari database!`);
    }
  };

  // Batch CSV Import for Students
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      const lines = content.split('\n');
      let count = 0;
      const currentStudents = AttendanceStorage.getStudents();
      const newStudentsList = [...currentStudents];
      const importedClasses: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [name, nisn, className, rfidUid, gender] = line.split(',').map(s => s?.replace(/^"|"$/g, '').trim());

        if (name && rfidUid) {
          const assignedClass = className || 'X MIPA 1';
          importedClasses.push(assignedClass);
          newStudentsList.push({
            id: `std-csv-${Date.now()}-${i}`,
            name,
            nisn: nisn || `008${Math.floor(Math.random() * 1000000)}`,
            class: assignedClass,
            rfidUid,
            gender: (gender === 'P' ? 'P' : 'L')
          });
          count++;
        }
      }

      AttendanceStorage.saveStudents(newStudentsList);
      if (importedClasses.length > 0) {
        AttendanceStorage.addClasses(importedClasses);
      }
      refreshAllData();
      showToast(`Berhasil mengimpor ${count} data siswa dari file CSV secara Realtime!`);
    };
    reader.readAsText(file);
  };

  const uniqueClasses = useMemo(() => {
    return Array.from(new Set([...classes, ...students.map(s => s.class)])).filter(Boolean).sort();
  }, [classes, students]);

  // =========================================================================
  // FILTERED & SORTED STUDENTS LIST (KELOLA DATA SISWA)
  // =========================================================================
  const filteredAndSortedStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();

    const filtered = students.filter(s => {
      const matchesSearch = 
        !query ||
        s.name.toLowerCase().includes(query) ||
        (s.nisn && s.nisn.toLowerCase().includes(query)) ||
        s.class.toLowerCase().includes(query) ||
        s.rfidUid.toLowerCase().includes(query);

      const matchesClass = studentClassFilter === 'ALL' || s.class === studentClassFilter;
      const matchesGender = studentGenderFilter === 'ALL' || s.gender === studentGenderFilter;
      
      const hasCard = Boolean(s.rfidUid && s.rfidUid.trim() !== '');
      const matchesRfid = 
        studentRfidFilter === 'ALL' ||
        (studentRfidFilter === 'HAS_CARD' && hasCard) ||
        (studentRfidFilter === 'NO_CARD' && !hasCard);

      return matchesSearch && matchesClass && matchesGender && matchesRfid;
    });

    // Sorting logic
    return filtered.sort((a, b) => {
      switch (studentSortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'id');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'id');
        case 'nisn_asc':
          return (a.nisn || '').localeCompare(b.nisn || '', undefined, { numeric: true });
        case 'nisn_desc':
          return (b.nisn || '').localeCompare(a.nisn || '', undefined, { numeric: true });
        case 'class_asc':
          return a.class.localeCompare(b.class);
        case 'class_desc':
          return b.class.localeCompare(a.class);
        case 'rfid_assigned_first':
          return (b.rfidUid ? 1 : 0) - (a.rfidUid ? 1 : 0);
        case 'rfid_unassigned_first':
          return (a.rfidUid ? 1 : 0) - (b.rfidUid ? 1 : 0);
        default:
          return 0;
      }
    });
  }, [students, studentSearch, studentClassFilter, studentGenderFilter, studentRfidFilter, studentSortBy]);

  const paginatedStudents = useMemo(() => {
    const start = (studentCurrentPage - 1) * studentPageSize;
    return filteredAndSortedStudents.slice(start, start + studentPageSize);
  }, [filteredAndSortedStudents, studentCurrentPage, studentPageSize]);

  // Bulk Selection and Deletion Helpers
  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllStudents = () => {
    if (selectedStudentIds.length === filteredAndSortedStudents.length && filteredAndSortedStudents.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredAndSortedStudents.map(s => s.id));
    }
  };

  const handleBulkDeleteSelected = () => {
    if (selectedStudentIds.length === 0) return;
    if (window.confirm(`KONFIRMASI HAPUS MASSAL:\n\nApakah Anda yakin ingin menghapus ${selectedStudentIds.length} data siswa terpilih?`)) {
      const updated = AttendanceStorage.bulkDeleteStudents(selectedStudentIds);
      setStudents(updated);
      setSelectedStudentIds([]);
      showToast(`${selectedStudentIds.length} Data siswa berhasil dihapus!`);
    }
  };

  const handleClearAllStudents = () => {
    if (students.length === 0) return;
    if (window.confirm("PERINGATAN HAPUS TOTAL DATA:\n\nApakah Anda yakin ingin MENGHAPUS SEMUA DATA SISWA? Tindakan ini cocok jika terjadi kesalahan impor massal.")) {
      if (window.confirm("Ketik KONFIRMASI: Lanjutkan menghapus SELURUH data siswa di database?")) {
        AttendanceStorage.clearAllStudents();
        setStudents([]);
        setSelectedStudentIds([]);
        showToast("Seluruh data siswa telah berhasil dikosongkan!");
      }
    }
  };

  const handleResetStudentFilters = () => {
    setStudentSearch('');
    setStudentClassFilter('ALL');
    setStudentGenderFilter('ALL');
    setStudentRfidFilter('ALL');
    setStudentSortBy('name_asc');
  };

  // =========================================================================
  // DATES & LABELS CALCULATION FOR PERIOD REPORTS (PER HARI, PER MINGGU, PER BULAN)
  // =========================================================================
  const { effectiveStartDate, effectiveEndDate, periodTitleLabel, periodFilePrefix } = useMemo(() => {
    if (reportPeriodMode === 'daily') {
      const targetDate = reportDailyDate || new Date().toISOString().split('T')[0];
      const parsed = new Date(targetDate + 'T00:00:00');
      const formattedDate = parsed.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      return {
        effectiveStartDate: targetDate,
        effectiveEndDate: targetDate,
        periodTitleLabel: `Laporan Harian (${formattedDate})`,
        periodFilePrefix: `Rekap_Absensi_Harian_${targetDate}`
      };
    }

    if (reportPeriodMode === 'weekly') {
      const refDate = new Date((reportWeeklyRefDate || new Date().toISOString().split('T')[0]) + 'T00:00:00');
      const dayOfWeek = refDate.getDay(); // 0 is Sunday, 1 is Monday...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      
      const monday = new Date(refDate);
      monday.setDate(refDate.getDate() + diffToMonday);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const startStr = monday.toISOString().split('T')[0];
      const endStr = sunday.toISOString().split('T')[0];

      const startFmt = monday.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const endFmt = sunday.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

      return {
        effectiveStartDate: startStr,
        effectiveEndDate: endStr,
        periodTitleLabel: `Laporan Mingguan (${startFmt} - ${endFmt})`,
        periodFilePrefix: `Rekap_Absensi_Mingguan_${startStr}_sd_${endStr}`
      };
    }

    if (reportPeriodMode === 'monthly') {
      const year = reportYear || new Date().getFullYear();
      const month = reportMonth || (new Date().getMonth() + 1);
      
      const monthStr = month < 10 ? `0${month}` : `${month}`;
      const startStr = `${year}-${monthStr}-01`;
      
      const lastDay = new Date(year, month, 0).getDate();
      const endStr = `${year}-${monthStr}-${lastDay < 10 ? `0${lastDay}` : lastDay}`;
      const monthName = MONTH_NAMES[month - 1];

      return {
        effectiveStartDate: startStr,
        effectiveEndDate: endStr,
        periodTitleLabel: `Laporan Bulanan (${monthName} ${year})`,
        periodFilePrefix: `Rekap_Absensi_Bulanan_${monthName}_${year}`
      };
    }

    // Custom range
    const startStr = reportCustomStartDate || new Date().toISOString().split('T')[0];
    const endStr = reportCustomEndDate || new Date().toISOString().split('T')[0];

    return {
      effectiveStartDate: startStr,
      effectiveEndDate: endStr,
      periodTitleLabel: `Laporan Periode (${startStr} s/d ${endStr})`,
      periodFilePrefix: `Rekap_Absensi_Periode_${startStr}_sd_${endStr}`
    };
  }, [reportPeriodMode, reportDailyDate, reportWeeklyRefDate, reportMonth, reportYear, reportCustomStartDate, reportCustomEndDate]);

  // =========================================================================
  // FILTERED & SORTED ATTENDANCE RECORDS (REKAP REPORT - MASUK & PULANG BERSANDINGAN)
  // =========================================================================
  const filteredAndSortedReports: PairedDailyAttendance[] = useMemo(() => {
    // Group & pair all raw records so each student has 1 unified row per date
    const paired = pairAttendanceRecords(attendanceRecords);
    const query = reportSearchTerm.trim().toLowerCase();

    const filtered = paired.filter(rec => {
      const recDate = rec.dateFormatted; // YYYY-MM-DD
      const inDateRange = recDate >= effectiveStartDate && recDate <= effectiveEndDate;
      
      const matchesSearch = 
        !query ||
        rec.studentName.toLowerCase().includes(query) ||
        (rec.nisn && rec.nisn.toLowerCase().includes(query)) ||
        rec.studentClass.toLowerCase().includes(query) ||
        (rec.notes && rec.notes.toLowerCase().includes(query)) ||
        rec.entryGate.toLowerCase().includes(query) ||
        rec.exitGate.toLowerCase().includes(query);

      const matchesClass = reportClassFilter === 'ALL' || rec.studentClass === reportClassFilter;
      const matchesGate = reportGateFilter === 'ALL' || rec.entryGate === reportGateFilter || rec.exitGate === reportGateFilter;
      
      const matchesStatus = reportStatusFilter === 'ALL' || 
        (reportStatusFilter === 'TEPAT_WAKTU' && rec.entryStatus === 'TEPAT_WAKTU') ||
        (reportStatusFilter === 'TERLAMBAT' && rec.entryStatus === 'TERLAMBAT') ||
        (reportStatusFilter === 'PULANG' && rec.exitTime !== 'Belum Pulang');

      const matchesType = reportTypeFilter === 'ALL' ||
        (reportTypeFilter === 'MASUK' && rec.entryTime !== '-') ||
        (reportTypeFilter === 'PULANG' && rec.exitTime !== 'Belum Pulang');

      return inDateRange && matchesSearch && matchesClass && matchesGate && matchesStatus && matchesType;
    });

    // Sorting
    return filtered.sort((a, b) => {
      switch (reportSortBy) {
        case 'time_desc':
          return (b.entryTimestamp || b.exitTimestamp || '').localeCompare(a.entryTimestamp || a.exitTimestamp || '');
        case 'time_asc':
          return (a.entryTimestamp || a.exitTimestamp || '').localeCompare(b.entryTimestamp || b.exitTimestamp || '');
        case 'name_asc':
          return a.studentName.localeCompare(b.studentName, 'id');
        case 'name_desc':
          return b.studentName.localeCompare(a.studentName, 'id');
        case 'nisn_asc':
          return (a.nisn || '').localeCompare(b.nisn || '', undefined, { numeric: true });
        case 'nisn_desc':
          return (b.nisn || '').localeCompare(a.nisn || '', undefined, { numeric: true });
        case 'class_asc':
          return a.studentClass.localeCompare(b.studentClass);
        case 'late_desc':
          return (b.lateMinutes || 0) - (a.lateMinutes || 0);
        default:
          return 0;
      }
    });
  }, [attendanceRecords, effectiveStartDate, effectiveEndDate, reportSearchTerm, reportClassFilter, reportGateFilter, reportStatusFilter, reportTypeFilter, reportSortBy]);

  // Report statistics summary for current filtered view
  const reportStats = useMemo(() => {
    const total = filteredAndSortedReports.length;
    const onTime = filteredAndSortedReports.filter(r => r.entryStatus === 'TEPAT_WAKTU').length;
    const late = filteredAndSortedReports.filter(r => r.entryStatus === 'TERLAMBAT').length;
    const checkouts = filteredAndSortedReports.filter(r => r.exitTime !== 'Belum Pulang').length;
    return { total, onTime, late, checkouts };
  }, [filteredAndSortedReports]);

  // Periodic Student Summary (Agregasi per Siswa untuk Mingguan, Bulanan & Custom)
  const periodicStudentSummaries: PeriodicStudentSummary[] = useMemo(() => {
    const uniqueDates = new Set<string>();
    filteredAndSortedReports.forEach(rec => {
      if (rec.dateFormatted) uniqueDates.add(rec.dateFormatted);
    });
    const totalEffectiveDays = Math.max(1, uniqueDates.size);

    const studentMap = new Map<string, {
      studentId: string;
      nisn: string;
      name: string;
      className: string;
      logs: PairedDailyAttendance[];
    }>();

    filteredAndSortedReports.forEach(rec => {
      const key = rec.studentId || (rec.nisn ? `nisn-${rec.nisn}` : `name-${rec.studentName}-${rec.studentClass}`);
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          studentId: rec.studentId || key,
          nisn: rec.nisn || '',
          name: rec.studentName || '(Tanpa Nama)',
          className: rec.studentClass || '-',
          logs: []
        });
      }
      studentMap.get(key)!.logs.push(rec);
    });

    const summaries: PeriodicStudentSummary[] = Array.from(studentMap.values()).map(item => {
      const sortedLogs = [...item.logs].sort((a, b) => b.dateFormatted.localeCompare(a.dateFormatted));
      const attendedDates = new Set<string>();
      const entryTimes: string[] = [];
      const exitTimes: string[] = [];
      sortedLogs.forEach(l => {
        if (l.dateFormatted && (l.entryTime !== '-' || l.exitTime !== 'Belum Pulang')) {
          attendedDates.add(l.dateFormatted);
        }
        if (l.entryTime && l.entryTime !== '-' && !l.entryTime.toLowerCase().includes('belum')) {
          entryTimes.push(l.entryTime);
        }
        if (l.exitTime && l.exitTime !== '-' && !l.exitTime.toLowerCase().includes('belum')) {
          exitTimes.push(l.exitTime);
        }
      });
      const totalPresent = attendedDates.size;
      const daysAbsent = Math.max(0, totalEffectiveDays - totalPresent);
      const averageEntryTime = calculateAverageTime(entryTimes);
      const averageExitTime = calculateAverageTime(exitTimes);
      const onTimeCount = sortedLogs.filter(l => l.entryStatus === 'TEPAT_WAKTU').length;
      const lateCount = sortedLogs.filter(l => l.entryStatus === 'TERLAMBAT').length;
      const totalLateMinutes = sortedLogs.reduce((acc, l) => acc + (l.lateMinutes || 0), 0);
      const punctualityRate = totalPresent > 0 ? Math.round((onTimeCount / totalPresent) * 100) : 0;

      let disciplineGrade: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Perlu Pembinaan' = 'Sangat Baik';
      if (lateCount >= 5) {
        disciplineGrade = 'Perlu Pembinaan';
      } else if (lateCount >= 3) {
        disciplineGrade = 'Cukup';
      } else if (lateCount >= 1) {
        disciplineGrade = 'Baik';
      } else {
        disciplineGrade = 'Sangat Baik';
      }

      return {
        studentId: item.studentId,
        nisn: item.nisn,
        name: item.name,
        className: item.className,
        totalPresent,
        daysAbsent,
        totalEffectiveDays,
        averageEntryTime,
        averageExitTime,
        onTimeCount,
        lateCount,
        totalLateMinutes,
        punctualityRate,
        disciplineGrade,
        dailyLogs: sortedLogs
      };
    });

    return summaries.sort((a, b) => {
      switch (reportSortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'id');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'id');
        case 'nisn_asc':
          return (a.nisn || '').localeCompare(b.nisn || '', undefined, { numeric: true });
        case 'nisn_desc':
          return (b.nisn || '').localeCompare(a.nisn || '', undefined, { numeric: true });
        case 'late_desc':
          return b.totalLateMinutes !== a.totalLateMinutes ? b.totalLateMinutes - a.totalLateMinutes : b.lateCount - a.lateCount;
        case 'class_asc':
          return a.className.localeCompare(b.className);
        default:
          return b.totalPresent !== a.totalPresent ? b.totalPresent - a.totalPresent : a.name.localeCompare(b.name, 'id');
      }
    });
  }, [filteredAndSortedReports, reportSortBy]);

  const paginatedReports = useMemo(() => {
    const start = (reportCurrentPage - 1) * reportPageSize;
    return filteredAndSortedReports.slice(start, start + reportPageSize);
  }, [filteredAndSortedReports, reportCurrentPage, reportPageSize]);

  const paginatedSummaries = useMemo(() => {
    const start = (reportCurrentPage - 1) * reportPageSize;
    return periodicStudentSummaries.slice(start, start + reportPageSize);
  }, [periodicStudentSummaries, reportCurrentPage, reportPageSize]);

  // Today's Chronological Arrival Ranking (Leaderboard - Exclusively Students)
  const arrivalRankingToday = useMemo(() => {
    return AttendanceStorage.getArrivalRankingToday('STUDENT');
  }, [attendanceRecords]);

  // Export handlers (using paired side-by-side format or period student summaries)
  const handleExportExcel = () => {
    if (filteredAndSortedReports.length === 0) {
      showToast('Tidak ada data absensi untuk diekspor');
      return;
    }
    const isPeriod = reportPeriodMode !== 'daily';
    const filterMeta: ExportFilterMeta = {
      schoolName: schedule.schoolName,
      className: reportClassFilter,
      periodLabel: periodTitleLabel,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      statusFilter: reportStatusFilter,
      gateFilter: reportGateFilter,
      typeFilter: reportTypeFilter,
      searchTerm: reportSearchTerm,
      totalRecords: filteredAndSortedReports.length,
      onTimeCount: filteredAndSortedReports.filter(r => r.entryStatus === 'TEPAT_WAKTU').length,
      lateCount: filteredAndSortedReports.filter(r => r.entryStatus === 'TERLAMBAT').length,
      isPeriodMode: isPeriod,
      customStudents: students
    };
    exportAttendanceToExcel(filteredAndSortedReports, periodFilePrefix, periodTitleLabel, filterMeta);
    showToast(`Berhasil mengunduh Excel: ${periodTitleLabel} (${reportClassFilter === 'ALL' ? 'Semua Kelas' : reportClassFilter})`);
  };

  const handleExportCSV = () => {
    if (filteredAndSortedReports.length === 0) {
      showToast('Tidak ada data absensi untuk diekspor');
      return;
    }
    const isPeriod = reportPeriodMode !== 'daily';
    const filterMeta: ExportFilterMeta = {
      schoolName: schedule.schoolName,
      className: reportClassFilter,
      periodLabel: periodTitleLabel,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      statusFilter: reportStatusFilter,
      gateFilter: reportGateFilter,
      typeFilter: reportTypeFilter,
      searchTerm: reportSearchTerm,
      totalRecords: filteredAndSortedReports.length,
      onTimeCount: filteredAndSortedReports.filter(r => r.entryStatus === 'TEPAT_WAKTU').length,
      lateCount: filteredAndSortedReports.filter(r => r.entryStatus === 'TERLAMBAT').length,
      isPeriodMode: isPeriod,
      customStudents: students
    };
    exportAttendanceToCSV(filteredAndSortedReports, periodFilePrefix, filterMeta);
    showToast(`Berhasil mengunduh CSV (Kolom Excel Terpisah): ${periodTitleLabel}`);
  };

  const handlePrintReport = () => {
    if (filteredAndSortedReports.length === 0) {
      showToast('Tidak ada data absensi untuk dicetak');
      return;
    }
    const isPeriod = reportPeriodMode !== 'daily';
    const filterMeta: ExportFilterMeta = {
      schoolName: schedule.schoolName,
      className: reportClassFilter,
      periodLabel: periodTitleLabel,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      statusFilter: reportStatusFilter,
      gateFilter: reportGateFilter,
      typeFilter: reportTypeFilter,
      searchTerm: reportSearchTerm,
      totalRecords: filteredAndSortedReports.length,
      onTimeCount: filteredAndSortedReports.filter(r => r.entryStatus === 'TEPAT_WAKTU').length,
      lateCount: filteredAndSortedReports.filter(r => r.entryStatus === 'TERLAMBAT').length,
      isPeriodMode: isPeriod,
      customStudents: students
    };
    printAttendanceReport(
      filteredAndSortedReports,
      schedule.schoolName,
      `Rekap Absensi Siswa - ${periodTitleLabel}`,
      `Rentang Tanggal: ${formatToDDMMYYYY(effectiveStartDate)} s/d ${formatToDDMMYYYY(effectiveEndDate)} | Filter: ${reportClassFilter === 'ALL' ? 'Semua Kelas' : reportClassFilter}`,
      filterMeta
    );
  };

  const handleResetTodayAttendance = async () => {
    const today = AttendanceStorage.getTodayDate();
    const res = await AttendanceStorage.resetTodayAttendance();
    setIsResetTodayModalOpen(false);
    refreshAllData();
    const recap = AttendanceStorage.getDailyRecapByDate(today);
    setActiveRecapData({
      previousDate: today,
      newDate: AttendanceStorage.getTodayDate(),
      recap
    });
    setIsArchiveRecapModalOpen(true);
    showToast(`${res.message}`);
  };

  const handleManualArchiveToday = async () => {
    const today = AttendanceStorage.getTodayDate();
    const res = await AttendanceStorage.triggerManualArchiveAndReset(today);
    refreshAllData();
    setActiveRecapData({
      previousDate: today,
      newDate: AttendanceStorage.getTodayDate(),
      recap: res.recap
    });
    setIsArchiveRecapModalOpen(true);
    showToast(`${res.message}`);
  };

  const handleCleanOrphanRecords = () => {
    if (confirm('Bersihkan semua baris absensi yang tidak bertuan / data kosong? Riwayat absensi siswa yang valid tetap aman.')) {
      const res = AttendanceStorage.cleanOrphanAttendanceRecords();
      refreshAllData();
      showToast(`${res.message}`);
    }
  };

  const handleAutoHealRecords = () => {
    const res = AttendanceStorage.autoHealAttendanceRecords();
    refreshAllData();
    if (res.healedCount > 0) {
      showToast(`Berhasil mencocokkan & melengkapi ${res.healedCount} data absensi yang sempat kosong!`);
    } else {
      showToast('Semua data absensi sudah lengkap dan sesuai data siswa/guru!');
    }
  };

  const handleDeletePairedRecord = async (rec: PairedDailyAttendance) => {
    const nameLabel = rec.studentName || `Kartu ${rec.rfidUid}`;
    if (confirm(`Apakah Anda yakin ingin menghapus log absensi tanggal ${rec.dateFormatted} untuk "${nameLabel}"?`)) {
      if (rec.recordIds && rec.recordIds.length > 0) {
        const res = await AttendanceStorage.deleteAttendanceRecordByIds(rec.recordIds);
        refreshAllData();
        showToast(`${res.message}`);
      } else {
        const all = AttendanceStorage.getAttendanceRecords();
        const toDelete = all.filter(r => r.dateFormatted === rec.dateFormatted && ((rec.rfidUid && r.rfidUid === rec.rfidUid) || (rec.studentId && r.studentId === rec.studentId)));
        if (toDelete.length > 0) {
          const res = await AttendanceStorage.deleteAttendanceRecordByIds(toDelete.map(r => r.id));
          refreshAllData();
          showToast(`${res.message}`);
        }
      }
    }
  };

  const handleApplySchedulePreset = (preset: 'reguler' | 'jumat' | 'ujian' | 'ramadhan' | 'upacara') => {
    if (preset === 'reguler') {
      setScheduleForm(prev => ({
        ...prev,
        entryStartTime: '06:00',
        entryDeadlineTime: '07:15',
        entryEndTime: '08:30',
        exitStartTime: '14:00',
        exitEndTime: '17:00',
        lateToleranceMinutes: 0
      }));
      showToast('Preset Jadwal Reguler dimuat! Jangan lupa klik Simpan.');
    } else if (preset === 'jumat') {
      setScheduleForm(prev => ({
        ...prev,
        entryStartTime: '06:00',
        entryDeadlineTime: '07:00',
        entryEndTime: '08:00',
        exitStartTime: '11:30',
        exitEndTime: '16:00',
        lateToleranceMinutes: 0
      }));
      showToast('Preset Jadwal Hari Jumat dimuat! Jangan lupa klik Simpan.');
    } else if (preset === 'ujian') {
      setScheduleForm(prev => ({
        ...prev,
        entryStartTime: '06:30',
        entryDeadlineTime: '07:30',
        entryEndTime: '09:00',
        exitStartTime: '12:30',
        exitEndTime: '16:00',
        lateToleranceMinutes: 0
      }));
      showToast('Preset Jadwal Pekan Ujian dimuat! Jangan lupa klik Simpan.');
    } else if (preset === 'ramadhan') {
      setScheduleForm(prev => ({
        ...prev,
        entryStartTime: '06:30',
        entryDeadlineTime: '07:30',
        entryEndTime: '08:30',
        exitStartTime: '12:00',
        exitEndTime: '15:30',
        lateToleranceMinutes: 5
      }));
      showToast('Preset Jadwal Ramadhan dimuat! Jangan lupa klik Simpan.');
    } else if (preset === 'upacara') {
      setScheduleForm(prev => ({
        ...prev,
        entryStartTime: '05:45',
        entryDeadlineTime: '06:45',
        entryEndTime: '07:30',
        exitStartTime: '14:30',
        exitEndTime: '17:00',
        lateToleranceMinutes: 0
      }));
      showToast('Preset Upacara Bendera dimuat! Jangan lupa klik Simpan.');
    }
  };

  // RFID Simulator & Debugging Handlers

  const handleExecuteSimulatedTap = () => {
    let targetUid = simulatorManualUid.trim().toUpperCase();
    if (simulatorSelectedStudentId) {
      const std = students.find(s => s.id === simulatorSelectedStudentId);
      if (std && std.rfidUid) {
        targetUid = std.rfidUid.trim().toUpperCase();
      }
    }

    if (!targetUid) {
      showToast('Pilih siswa atau masukkan nomor UID kartu RFID terlebih dahulu!');
      return;
    }

    // Process real RFID tap logic through storage engine
    const result = AttendanceStorage.processRfidTap(targetUid, simulatorGate);
    
    // Set for visual modal presentation
    setSimulatedResultModal({
      ...result,
      scanTime: `${new Date().toLocaleTimeString('id-ID')} WIB`,
      gateName: simulatorGate === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang'
    });

    // Add to debugging log list
    setSimulatorLogs(prev => [
      {
        id: `sim-log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        uid: targetUid,
        name: result.student?.name || result.teacher?.name || 'UID Kartu Belum Terdaftar',
        role: result.userType === 'TEACHER' ? 'Guru' : result.student ? 'Siswa' : 'Anonim',
        gate: simulatorGate === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang',
        status: result.status || (result.success ? 'BERHASIL' : 'DITOLAK'),
        success: result.success,
        reason: result.reason || result.message
      },
      ...prev.slice(0, 14)
    ]);

    // Refresh live records & stats
    refreshAllData();
  };

  const menuCategories = useMemo(() => [
    {
      name: 'Utama',
      categoryIcon: Building2,
      items: [
        { id: 'overview' as const, title: 'Ringkasan', subtitle: 'Statistik & Ringkasan Umum', icon: Building2 }
      ]
    },
    {
      name: 'Data Master',
      categoryIcon: Users,
      items: [
        { id: 'students' as const, title: 'Data Siswa', subtitle: 'Kelola Siswa & NISN', icon: Users, badge: students.length },
        { id: 'teachers' as const, title: 'Data Guru', subtitle: 'Kelola Guru & PTK', icon: UserCheck, badge: teachers.length },
        { id: 'classes' as const, title: 'Data Kelas', subtitle: 'Kelola Rombel & Tingkat', icon: GraduationCap, badge: classes.length },
        { id: 'alumni_archive' as const, title: 'Arsip & Alumni', subtitle: 'Siswa Lulus & Rekap TA', icon: Archive }
      ]
    },
    {
      name: 'Laporan & Rekapitulasi',
      categoryIcon: FileSpreadsheet,
      items: [
        { id: 'reports' as const, title: 'Rekap Siswa', subtitle: 'Laporan Absensi Siswa', icon: FileSpreadsheet, badge: 'Excel' },
        { id: 'monthly_matrix' as const, title: 'Rekap Matriks Bulanan Per Kelas', subtitle: 'Matriks Tanggal 1-31 Per Kelas', icon: Calendar, badge: 'Baru' },
        { id: 'late_reports' as const, title: 'Rekap Keterlambatan', subtitle: 'Laporan Siswa Terlambat & Disiplin', icon: Clock, badge: 'Disiplin' },
        { id: 'teacher_reports' as const, title: 'Rekap Guru', subtitle: 'Laporan Absensi Guru & PTK', icon: UserCheck, badge: 'Excel' },
        { id: 'backup' as const, title: 'Cloud Backup', subtitle: 'Database & Restore Cloud', icon: Database, badge: 'Cloud' }
      ]
    },
    {
      name: 'Aktivitas & Log',
      categoryIcon: Activity,
      items: [
        { id: 'leaderboard' as const, title: 'Urutan & Peringkat Siswa', subtitle: 'Top Terpagi & Sering Terlambat', icon: Sparkles, badge: 'Top' },
        { id: 'teacher_leaderboard' as const, title: 'Urutan & Peringkat Guru', subtitle: 'Peringkat Kedatangan Guru & PTK', icon: Award, badge: 'Guru' },
        { id: 'users' as const, title: 'Kelola Akun', subtitle: 'Akun Login & Hak Akses', icon: KeyRound, badge: systemUsers.length }
      ]
    },
    {
      name: 'Pengaturan',
      categoryIcon: Sliders,
      items: [
        { id: 'schedule' as const, title: 'Jam Operasional & Aturan Tap', subtitle: 'Jam Masuk, Pulang, Toleransi & PIN', icon: Clock, badge: 'Jam' },
        { id: 'announcements' as const, title: 'Kustomisasi Tampilan Kiosk', subtitle: 'Running Text & Pengumuman Kiosk', icon: Megaphone, badge: 'Kiosk' },
        { id: 'rfid_simulator' as const, title: 'Simulator & Debugging RFID', subtitle: 'Buka Kunci Gerbang & Uji Coba Tap', icon: Radio, badge: 'Debug' }
      ]
    }
  ], [students.length, teachers.length, classes.length, systemUsers.length]);

  const currentTabMeta = useMemo(() => {
    for (const cat of menuCategories) {
      const found = cat.items.find(i => i.id === activeTab);
      if (found) return { ...found, group: cat.name };
    }
    return { id: 'overview' as const, title: 'Ringkasan', subtitle: 'Statistik & Ringkasan', group: 'Utama' };
  }, [activeTab, menuCategories]);

  // Ensure active tab's parent category dropdown is open
  useEffect(() => {
    if (currentTabMeta.group) {
      setOpenCategories(prev => ({
        ...prev,
        [currentTabMeta.group]: true
      }));
    }
  }, [currentTabMeta.group]);

  return (
    <div className={`h-screen w-full max-w-full flex relative overflow-hidden transition-colors ${
      theme === 'light' ? 'theme-light bg-slate-50 text-slate-900' : 'theme-dark bg-slate-950 text-slate-100'
    }`}>
      
      {/* Backdrop overlay for mobile / unpinned drawer */}
      {isSidebarOpen && !isSidebarPinned && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/75 z-40 backdrop-blur-xs transition-opacity cursor-pointer"
          title="Klik di luar untuk menutup menu samping"
        />
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR PANEL KIRI: UNIFIED NAVBAR DENGAN SUB-MENU DROPDOWN              */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* SIDEBAR PANEL KIRI: GOOGLE AI STUDIO STYLE MINIMALIST SIDEBAR             */}
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
        {/* Sidebar Header with School Brand & Collapse Icon (Google AI Studio Header Style) */}
        <div className="h-16 px-4 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-[#18181b]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white p-1 rounded-md shrink-0 shadow-xs flex items-center justify-center">
              <SchoolLogo size="xs" variant="full" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-tight truncate">SMK EKONOMIKA</p>
              <p className="text-[10px] text-zinc-400 tracking-wider truncate">Panel Super Admin</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Collapse / Close button */}
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

        {/* Scrollable Sidebar Body (Google AI Studio Clean Minimalist Sections) */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          
          {menuCategories.map((cat, catIdx) => {
            return (
              <div key={catIdx} className="space-y-0.5">
                {/* Clean Uppercase Section Header (like PROJECT, USAGE & BILLING in AI Studio) */}
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-zinc-400 tracking-wider uppercase">
                  {cat.name}
                </div>

                {/* Section Menu Items */}
                <div className="space-y-0.5">
                  {cat.items.map((tab) => {
                    const Icon = tab.icon;
                    const isSelected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.id);
                          if (!isSidebarPinned || window.innerWidth < 1024) {
                            setIsSidebarOpen(false);
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-800 text-white font-semibold shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
                        <span className="truncate flex-1">{tab.title}</span>
                        {tab.badge !== undefined && (
                          <span className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded shrink-0 ${
                            isSelected
                              ? 'bg-zinc-700 text-white'
                              : 'bg-zinc-800/80 text-zinc-400'
                          }`}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Standalone Quick Links (like Changelog ↗ in AI Studio) */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold text-zinc-400 tracking-wider uppercase">
              Aksi Cepat
            </div>

            {onOpenKioskMode && (
              <button
                type="button"
                onClick={() => {
                  onOpenKioskMode();
                  if (!isSidebarPinned) setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">Layar Kiosk (Tap Siswa)</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>
            )}

            {onOpenManualCheckin && (
              <button
                type="button"
                onClick={() => {
                  onOpenManualCheckin();
                  if (!isSidebarPinned) setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Sliders className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="truncate">Input Absensi Manual</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsAcademicRolloverModalOpen(true);
                if (!isSidebarPinned) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 truncate">
                <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Kenaikan Kelas & TA Baru</span>
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
              <span className="text-[10px] text-zinc-400 font-mono shrink-0">{isFullscreen ? 'ESC' : 'F11'}</span>
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

        </div>

        {/* Sidebar Bottom Footer: User Account Widget (Google AI Studio Style with PRO/ADMIN badge) */}
        <div className="p-3 border-t border-zinc-800/80 bg-[#161618] shrink-0">
          <div className="p-2.5 bg-zinc-900/90 rounded-sm border border-zinc-800 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-sm bg-[#0e1d38] text-blue-300 border border-blue-500/40 flex items-center justify-center shrink-0 font-mono font-bold text-xs">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{currentUser?.name || 'Super Administrator'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-300 text-[9px] font-bold tracking-wider rounded border border-zinc-700/60 uppercase">
                    {currentUser?.role === 'admin' ? 'ADMIN' : currentUser?.role?.toUpperCase() || 'ADMIN'}
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
      {/* MAIN VIEWPORT CONTAINER                                                  */}
      {/* ========================================================================= */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto bg-[#131314]">
        
        {/* TOP HEADER BAR (GOOGLE AI STUDIO STYLE: HAMBURGER, BOLD TITLE, STATUS PILL) */}
        <header className="sticky top-0 z-30 h-16 bg-[#18181b]/95 backdrop-blur-xs border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          {/* Left: Hamburger & Large Bold Page Title with Inline Status Pill */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={toggleSidebarOpen}
              title={isSidebarOpen && isSidebarPinned ? 'Collapse Menu Samping' : 'Buka Menu Samping'}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight truncate">
                {currentTabMeta.title}
              </h1>
              <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 shrink-0 font-medium">
                <span className="text-white font-semibold">SMK EKONOMIKA</span>
                <span aria-hidden="true" className="text-zinc-600">/</span>
                <span className="font-mono text-zinc-400">TA 2026/2027</span>
              </div>
            </div>
          </div>

          {/* Right: Clean minimal action buttons */}
          <div className="flex items-center gap-3 shrink-0">
            {onOpenKioskMode && (
              <button
                type="button"
                onClick={onOpenKioskMode}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white font-medium hover:bg-zinc-800 rounded-sm transition-colors cursor-pointer border border-zinc-800"
                title="Buka Layar Kiosk RFID Tap"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Layar Kiosk</span>
                <ArrowUpRight className="w-3 h-3 text-zinc-500" />
              </button>
            )}

            {/* Cloud Sync Status chip */}
            <div
              onClick={() => {
                if (onOpenOfflineModal) onOpenOfflineModal();
                else setIsOfflineModalOpen(true);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium border cursor-pointer transition-colors ${
                syncSummary.isOnline && syncSummary.pendingQueueCount === 0
                  ? 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/30'
              }`}
              title="Pusat Sinkronisasi Database"
            >
              <span className={`w-1.5 h-1.5 rounded-xs ${syncSummary.isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="hidden sm:inline text-[11px] text-zinc-300 font-mono">
                {syncSummary.isOnline ? 'Cloud Synced' : 'Offline'}
              </span>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-8 flex-1">
          {/* Header Admin Banner (Shown on Overview) */}
          {activeTab === 'overview' && (
            <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-sm">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">Panel Super Admin</h2>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono font-bold">
                      KONTROL UTAMA
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Pengelolaan Data Siswa & NISN, Pengaturan Waktu & Jadwal, serta Download Rekap Data Absensi Harian, Mingguan, & Bulanan.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                <span className="px-2.5 py-1 bg-zinc-900 text-zinc-300 border border-zinc-800 rounded-lg text-xs font-mono">
                  TA 2026/2027
                </span>
              </div>
            </div>
          )}


      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & STATS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="card-container">
              <div className="flex items-center justify-between text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Siswa</span>
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold font-mono tabular-nums text-white">{students.length}</p>
              <p className="text-xs text-slate-400 mt-1">Siswa terdaftar ({classes.length} Kelas)</p>
            </div>

            <div className="card-container">
              <div className="flex items-center justify-between text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Guru & PTK</span>
                <UserCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold font-mono tabular-nums text-white">{teachers.length}</p>
              <p className="text-xs text-slate-400 mt-1">Tenaga pendidik & kependidikan</p>
            </div>

            <div className="card-container border-emerald-500/30">
              <div className="flex items-center justify-between text-emerald-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Jam Masuk</span>
                <Clock className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400">{schedule.entryStartTime} - {schedule.entryDeadlineTime}</p>
              <p className="text-xs text-slate-400 mt-1">Batas telat: {schedule.entryDeadlineTime} WIB</p>
            </div>

            <div className="card-container">
              <div className="flex items-center justify-between text-slate-300 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Cooldown Tap</span>
                <Sliders className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-3xl font-bold font-mono tabular-nums text-white">
                {schedule.cooldownSeconds ?? schedule.antiSpamCooldownSeconds ?? 60} dtk
              </p>
              <p className="text-xs text-slate-400 mt-1">Pencegahan double absensi ({schedule.cooldownSeconds ?? schedule.antiSpamCooldownSeconds ?? 60} detik)</p>
            </div>

          </div>

          {/* 7-DAY ATTENDANCE TREND STACKED BAR CHART */}
          <WeeklyAttendanceBarChart records={attendanceRecords} students={students} />

          {/* Quick Actions Card */}
          <div className="card-container space-y-4">
            <h3 className="text-sm font-bold text-white tracking-tight uppercase">Akses Cepat Pengelolaan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <button
                onClick={() => setActiveTab('students')}
                className="card-container-compact text-left transition-all group cursor-pointer hover:border-slate-600"
              >
                <Users className="w-5 h-5 text-emerald-400 mb-2" />
                <p className="font-bold text-white text-xs">Data Siswa & NISN</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Filter, tambah, & bulk import siswa</p>
              </button>

              <button
                onClick={() => setActiveTab('teachers')}
                className="card-container-compact text-left transition-all group cursor-pointer hover:border-slate-600"
              >
                <UserCheck className="w-5 h-5 text-emerald-400 mb-2" />
                <p className="font-bold text-white text-xs">Data Guru & PTK</p>
                <p className="text-[11px] text-slate-400 mt-0.5">NIP, Jabatan, & kartu RFID</p>
              </button>

              <button
                onClick={() => setActiveTab('users')}
                className="card-container-compact text-left transition-all group cursor-pointer hover:border-slate-600"
              >
                <KeyRound className="w-5 h-5 text-emerald-400 mb-2" />
                <p className="font-bold text-white text-xs">Kelola Akun Login</p>
                <p className="text-[11px] text-slate-400 mt-0.5">CRUD akun Admin & Guru Piket</p>
              </button>

              <button
                onClick={() => setActiveTab('reports')}
                className="card-container-compact text-left transition-all group cursor-pointer hover:border-slate-600"
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-400 mb-2" />
                <p className="font-bold text-white text-xs">Rekap Siswa</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Laporan Harian, Mingguan, Bulanan</p>
              </button>

              <button
                onClick={() => setActiveTab('teacher_reports')}
                className="card-container-compact text-left transition-all group cursor-pointer hover:border-slate-600"
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-400 mb-2" />
                <p className="font-bold text-white text-xs">Rekap Guru & PTK</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Tap masuk & pulang Excel/CSV</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: KELOLA DATA SISWA (WITH ADVANCED SORT & FILTER) */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 sm:p-6 space-y-6 shadow-lg">

          {/* Action Top Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <span>Kelola Data Siswa & RFID</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Total <strong className="text-indigo-300">{students.length}</strong> siswa terdaftar. Menampilkan <strong className="text-white">{filteredAndSortedStudents.length}</strong> siswa sesuai filter.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedStudentIds.length > 0 && (
                <button
                  onClick={handleBulkDeleteSelected}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded shadow-lg transition-all cursor-pointer border border-rose-400/30 animate-pulse"
                  title="Hapus massal siswa yang dicentang"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus ({selectedStudentIds.length}) Terpilih</span>
                </button>
              )}

              <button
                onClick={handleClearAllStudents}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-rose-950/60 text-rose-400 font-bold text-xs rounded border border-rose-500/30 transition-all cursor-pointer"
                title="Hapus seluruh data siswa jika terjadi kesalahan impor total"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Reset Total</span>
              </button>

              <button
                onClick={() => setIsMifareGuideOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded border border-amber-500/30 transition-all cursor-pointer shadow-sm"
                title="Petunjuk cara daftarkan/hubungkan kartu fisik MIFARE ke data siswa"
              >
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>Panduan MIFARE</span>
              </button>

              <button
                onClick={() => setIsMifareScannerOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded shadow-md transition-all cursor-pointer border border-amber-300"
                title="Buka Mode Live Detector / Pengenalan Kartu MIFARE 13.56 MHz"
              >
                <Scan className="w-4 h-4 text-slate-950" />
                <span>Pengenalan MIFARE</span>
              </button>

              <button
                onClick={() => setIsBulkImportOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded shadow-md transition-all cursor-pointer border border-blue-400/30"
                title="Import Massal Data Siswa & Kartu RFID dari CSV/Excel"
              >
                <Database className="w-4 h-4 text-amber-300" />
                <span>Bulk Import & RFID</span>
              </button>

              <button
                onClick={() => {
                  downloadStudentExcelTemplate();
                  showToast('Template Excel (.xlsx) dengan kolom terpisah berhasil diunduh.');
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs rounded border border-emerald-400/40 transition-all cursor-pointer shadow-sm"
                title="Download Template Format Excel (.xlsx) Kolom Terpisah untuk Import Data Siswa"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Template Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => {
                  downloadStudentCsvTemplate();
                  showToast('Template CSV Data Siswa berhasil diunduh.');
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded border border-slate-700 transition-all cursor-pointer shadow-sm"
                title="Download Template Format CSV untuk Import Data Siswa"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Template CSV</span>
              </button>

              <button
                onClick={() => {
                  if (students.length === 0) {
                    showToast('Belum ada data siswa untuk diekspor');
                    return;
                  }
                  exportStudentsToExcel(students, schedule.schoolName || 'SMK EKONOMIKA DEPOK');
                  showToast(`Berhasil mengekspor ${students.length} data siswa ke Excel.`);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded border border-emerald-400/40 transition-all cursor-pointer shadow-sm"
                title="Ekspor Seluruh Siswa ke File Excel (.xlsx) dengan kolom rapi"
              >
                <Download className="w-4 h-4" />
                <span>Ekspor Excel</span>
              </button>

              <button
                onClick={() => {
                  if (students.length === 0) {
                    showToast('Belum ada data siswa untuk diekspor');
                    return;
                  }
                  exportStudentsToCSV(students);
                  showToast(`Berhasil mengekspor ${students.length} data siswa ke CSV.`);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded border border-slate-700 transition-all cursor-pointer shadow-sm"
                title="Ekspor Seluruh Siswa ke File CSV (Pemisah Semicolon ; UTF-8 BOM)"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Ekspor CSV</span>
              </button>

              <button
                onClick={openAddStudentModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Siswa Baru</span>
              </button>
            </div>
          </div>

          {/* FILTER & SORT BAR FOR STUDENTS */}
          <div className="card-container-compact space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Filter className="w-4 h-4 text-emerald-400" />
                <span>Filter & Urutkan Data Siswa</span>
              </div>

              {(studentSearch || studentClassFilter !== 'ALL' || studentGenderFilter !== 'ALL' || studentRfidFilter !== 'ALL' || studentSortBy !== 'name_asc') && (
                <button
                  onClick={handleResetStudentFilters}
                  className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {/* Search Bar */}
              <div className="md:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari nama, NISN, kelas, atau RFID UID..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Filter Kelas */}
              <div>
                <select
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Semua Kelas</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>

              {/* Filter Gender */}
              <div>
                <select
                  value={studentGenderFilter}
                  onChange={(e) => setStudentGenderFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Semua Gender</option>
                  <option value="L">Laki-Laki (L)</option>
                  <option value="P">Perempuan (P)</option>
                </select>
              </div>

              {/* Filter Status RFID */}
              <div>
                <select
                  value={studentRfidFilter}
                  onChange={(e) => setStudentRfidFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Semua Status RFID</option>
                  <option value="HAS_CARD">Sudah Ada Kartu RFID</option>
                  <option value="NO_CARD">Belum Ada Kartu RFID</option>
                </select>
              </div>
            </div>

            {/* SORTING SELECTOR */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-slate-300">Urutkan Siswa:</span>
                <select
                  value={studentSortBy}
                  onChange={(e) => setStudentSortBy(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 font-mono"
                >
                  <option value="name_asc">Nama Siswa (A - Z)</option>
                  <option value="name_desc">Nama Siswa (Z - A)</option>
                  <option value="nisn_asc">NISN (Terkecil - Terbesar)</option>
                  <option value="nisn_desc">NISN (Terbesar - Terkecil)</option>
                  <option value="class_asc">Kelas (A - Z)</option>
                  <option value="rfid_assigned_first">Status RFID (Sudah Pasang Dulu)</option>
                  <option value="rfid_unassigned_first">Status RFID (Belum Pasang Dulu)</option>
                </select>
              </div>

              <span className="text-[11px] text-slate-400 font-medium">
                Ditemukan <strong className="text-white font-mono">{filteredAndSortedStudents.length}</strong> dari total <span className="font-mono">{students.length}</span> siswa
              </span>
            </div>

          </div>

          {/* Students Table */}
          <div className="table-container-sharp overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-700">
                <tr>
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredAndSortedStudents.length > 0 && selectedStudentIds.length === filteredAndSortedStudents.length}
                      onChange={handleToggleSelectAllStudents}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 cursor-pointer"
                      title="Pilih semua siswa di tabel"
                    />
                  </th>
                  <th className="py-3.5 px-3 text-center">No</th>
                  <th className="py-3.5 px-4">Nama Siswa</th>
                  <th className="py-3.5 px-4">NIS</th>
                  <th className="py-3.5 px-4">NISN</th>
                  <th className="py-3.5 px-4">Kelas</th>
                  <th className="py-3.5 px-4">UID Kartu RFID</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 bg-slate-900/40">
                {filteredAndSortedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Tidak ada data siswa yang cocok dengan filter atau pencarian Anda.
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((std, idx) => {
                    const rowIdx = (studentCurrentPage - 1) * studentPageSize + idx + 1;
                    return (
                      <tr 
                        key={std.id} 
                        className={`transition-colors ${
                          selectedStudentIds.includes(std.id) ? 'bg-rose-950/30 border-l-2 border-rose-500' : 'hover:bg-slate-800/60'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(std.id)}
                            onChange={() => handleToggleSelectStudent(std.id)}
                            className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px] tabular-nums">
                          {rowIdx}
                        </td>
                        
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={std.name}
                              avatarUrl={std.avatarUrl}
                              gender={std.gender}
                              role="SISWA"
                              size="sm"
                              shape="passport"
                            />
                            <div>
                              <p className="font-bold text-white text-sm">{std.name}</p>
                              <span className="text-[10px] font-semibold text-slate-400">
                                {std.gender === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-bold text-slate-200 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                            {std.nis || '-'}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-bold text-slate-200 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                            {std.nisn || '-'}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-semibold text-slate-200">
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs text-indigo-300 font-bold">
                            {std.class}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {std.rfidUid ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg font-mono font-bold text-xs">
                              <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                              {std.rfidUid}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 italic">
                              Belum Ada Kartu
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => onOpenCardPairing(std)}
                              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold transition-all"
                              title="Scan Kartu RFID Baru untuk Siswa Ini"
                            >
                              Assign Card
                            </button>
                            
                            <button
                              onClick={() => openEditStudentModal(std)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                              title="Edit Data Siswa & NISN"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteStudent(std.id, std.name)}
                              className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg transition-colors border border-rose-500/30"
                              title="Hapus Siswa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <TablePagination
              currentPage={studentCurrentPage}
              totalItems={filteredAndSortedStudents.length}
              pageSize={studentPageSize}
              onPageChange={setStudentCurrentPage}
              onPageSizeChange={setStudentPageSize}
              itemName="siswa"
            />
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: KELOLA DATA GURU & TENAGA KEPENDIDIKAN (PTK) */}
      {/* ========================================================================= */}
      {activeTab === 'teachers' && (
        <TeacherManagement
          showToast={showToast}
          onNavigateTab={(tab) => {
            if (tab === 'students') setActiveTab('students');
            else if (tab === 'classes') setActiveTab('classes');
            else if (tab === 'teachers') setActiveTab('teachers');
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: KELOLA MASTER DATA KELAS (TAMBAH & HAPUS BULK KELAS) */}
      {/* ========================================================================= */}
      {activeTab === 'classes' && (
        <div className="space-y-6">
          

          {/* Header & Quick Action Bar */}
          <div className="card-container flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-bold text-white tracking-tight">Kelola Master Data Kelas</h2>
                <span className="badge-sharp bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-mono">
                  {classes.length} KELAS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Tambah kelas baru (satuan / massal), ubah nama kelas, dan hapus kelas secara bulk / massal dengan cepat dan aman.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedClassNames.length > 0 && (
                <button
                  onClick={() => setIsBulkDeleteClassModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded border border-rose-500 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus ({selectedClassNames.length}) Kelas Terpilih</span>
                </button>
              )}

              <button
                onClick={() => {
                  setAddClassMode('batch');
                  setIsAddClassModalOpen(true);
                }}
                className="btn-secondary-sharp"
                title="Tambah Banyak Kelas Sekaligus"
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>+ Tambah Massal</span>
              </button>

              <button
                onClick={() => {
                  setAddClassMode('single');
                  setIsAddClassModalOpen(true);
                }}
                className="btn-primary-sharp"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah 1 Kelas</span>
              </button>
            </div>
          </div>

          {/* Class Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-container-compact">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Kelas Terdaftar</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">{classes.length}</p>
              <span className="text-[10px] text-emerald-400 font-medium">Aktif dalam database</span>
            </div>

            <div className="card-container-compact">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Kelas Terpilih (Bulk)</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-amber-400 mt-1">{selectedClassNames.length}</p>
              <span className="text-[10px] text-slate-400 font-medium">Siap untuk aksi massal</span>
            </div>

            <div className="card-container-compact">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Siswa Terdaftar</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-1">{students.length}</p>
              <span className="text-[10px] text-slate-400 font-medium">Di seluruh kelas</span>
            </div>

            <div className="card-container-compact">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rata-rata Siswa/Kelas</span>
              <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                {classes.length > 0 ? (students.length / classes.length).toFixed(1) : 0}
              </p>
              <span className="text-[10px] text-slate-400 font-medium">Siswa per rombel</span>
            </div>
          </div>

          {/* Search & Filter & Bulk Bar */}
          <div className="card-container-compact space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Filter className="w-4 h-4 text-emerald-400" />
                <span>Filter & Urutkan Daftar Kelas</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleApplyPreset('SMK')}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  title="Muat preset kelas jurusan SMK (AKL, OTKP, BDP, RPL, TKJ)"
                >
                  <Sparkles className="w-3.5 h-3.5" /> + Muat Preset SMK (AKL/OTKP/TKJ/RPL)
                </button>
                <span className="text-slate-600">•</span>
                <button
                  onClick={() => handleApplyPreset('SMA')}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  title="Muat preset kelas jurusan SMA (MIPA 1-3, IPS 1-3)"
                >
                  <School className="w-3.5 h-3.5" /> + Muat Preset SMA (MIPA/IPS)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={classSearchQuery}
                  onChange={(e) => setClassSearchQuery(e.target.value)}
                  placeholder="Cari nama kelas..."
                  className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Filter Tingkat */}
              <div>
                <select
                  value={classGradeFilter}
                  onChange={(e) => setClassGradeFilter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-bold"
                >
                  <option value="ALL">Semua Tingkat Kelas</option>
                  <option value="X">Kelas X (Sepuluh)</option>
                  <option value="XI">Kelas XI (Sebelas)</option>
                  <option value="XII">Kelas XII (Dua Belas)</option>
                  <option value="OTHER">Lainnya / Format Khusus</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <select
                  value={classSortBy}
                  onChange={(e) => setClassSortBy(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-bold"
                >
                  <option value="name_asc">Urutan Nama (A - Z)</option>
                  <option value="name_desc">Urutan Nama (Z - A)</option>
                  <option value="students_desc">Siswa Terbanyak</option>
                  <option value="students_asc">Siswa Tersedikit</option>
                </select>
              </div>

              {/* Select All / Deselect Action */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border border-slate-700 rounded">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filteredAndSortedClasses.length > 0 && selectedClassNames.length === filteredAndSortedClasses.length}
                    onChange={(e) => handleSelectAllClasses(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Pilih Semua ({filteredAndSortedClasses.length})</span>
                </label>
                {selectedClassNames.length > 0 && (
                  <button
                    onClick={() => setSelectedClassNames([])}
                    className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                  >
                    Batal ({selectedClassNames.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Class List Table / Grid */}
          <div className="table-container-sharp overflow-hidden">
            {filteredAndSortedClasses.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <GraduationCap className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold">Tidak ada kelas yang sesuai dengan filter pencarian.</p>
                <button
                  onClick={() => {
                    setAddClassMode('single');
                    setIsAddClassModalOpen(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded shadow-sm cursor-pointer transition-all"
                >
                  + Tambah Kelas Sekarang
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={selectedClassNames.length === filteredAndSortedClasses.length && filteredAndSortedClasses.length > 0}
                          onChange={(e) => handleSelectAllClasses(e.target.checked)}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                      </th>
                      <th className="py-3.5 px-4">Nama Kelas</th>
                      <th className="py-3.5 px-4">Tingkat</th>
                      <th className="py-3.5 px-4">Jumlah Siswa Terdaftar</th>
                      <th className="py-3.5 px-4 text-center">Status Data</th>
                      <th className="py-3.5 px-4 text-right">Aksi Pengelolaan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {paginatedClasses.map((cls) => {
                      const count = classStudentCounts[cls] || 0;
                      const isSelected = selectedClassNames.includes(cls);

                      let gradeBadge = 'UMUM';
                      let gradeColor = 'bg-slate-700 text-slate-300';
                      if (cls.startsWith('X ') || cls.startsWith('X-') || cls.startsWith('10')) {
                        gradeBadge = 'KELAS X';
                        gradeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                      } else if (cls.startsWith('XI ') || cls.startsWith('XI-') || cls.startsWith('11')) {
                        gradeBadge = 'KELAS XI';
                        gradeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
                      } else if (cls.startsWith('XII ') || cls.startsWith('XII-') || cls.startsWith('12')) {
                        gradeBadge = 'KELAS XII';
                        gradeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                      }

                      return (
                        <tr
                          key={cls}
                          className={`transition-colors ${isSelected ? 'bg-indigo-950/40' : 'hover:bg-slate-700/30'}`}
                        >
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectClass(cls)}
                              className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            />
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-emerald-400 font-extrabold shrink-0">
                                <BookOpen className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-extrabold text-white text-sm">{cls}</p>
                                <p className="text-[10px] text-slate-400">Rombongan Belajar</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${gradeColor}`}>
                              {gradeBadge}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-extrabold text-sm ${count > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {count} Siswa
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            {count > 0 ? (
                              <span className="px-2 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 rounded-sm text-[10px] font-mono font-bold">
                                {count} Siswa Terdaftar
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-sm text-[10px] font-mono font-medium">
                                Kelas Kosong
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setStudentClassFilter(cls);
                                  setActiveTab('students');
                                }}
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/30 cursor-pointer"
                                title={`Detail Siswa Kelas ${cls}`}
                                aria-label={`Detail Siswa Kelas ${cls}`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setEditingClassModal({ oldName: cls, newName: cls })}
                                className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-colors border border-indigo-500/30 cursor-pointer"
                                title="Ubah Nama Kelas"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSingleDeleteClass(cls)}
                                className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg transition-colors border border-rose-500/30 cursor-pointer"
                                title="Hapus Kelas Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <TablePagination
                  currentPage={classCurrentPage}
                  totalItems={filteredAndSortedClasses.length}
                  pageSize={classPageSize}
                  onPageChange={setClassCurrentPage}
                  onPageSizeChange={setClassPageSize}
                  itemName="kelas"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: PENGATURAN - JAM OPERASIONAL & ATURAN TAP */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <div className="space-y-6 w-full">

          <div className="card-container space-y-6 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
                <Clock className="w-5 h-5 text-emerald-400" />
                <span>Pengaturan Waktu & Jam Operasional Kiosk</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Ubah jam masuk, batas waktu keterlambatan, jam pulang, dan jam operasional kiosk sesuai kebijakan sekolah.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-sm text-emerald-300 text-xs font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400" />
              <span>Sinkron Realtime ke Kiosk</span>
            </div>
          </div>

          {/* QUICK PRESET BUTTONS */}
          <div className="card-container-compact space-y-2.5 w-full">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Muat Preset Cepat Jam Sekolah</span>
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 w-full">
              <button
                type="button"
                onClick={() => handleApplySchedulePreset('reguler')}
                className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 hover:border-emerald-500/50 border border-slate-700 rounded text-xs text-slate-200 hover:text-emerald-300 text-left transition-all cursor-pointer font-medium"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>Reguler Pagi</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">Masuk: 06:00 (Terlambat: 07:15)</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplySchedulePreset('jumat')}
                className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 hover:border-emerald-500/50 border border-slate-700 rounded text-xs text-slate-200 hover:text-emerald-300 text-left transition-all cursor-pointer font-medium"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>Hari Jumat</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">Masuk: 06:00 (Pulang: 11:30)</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplySchedulePreset('ujian')}
                className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 hover:border-emerald-500/50 border border-slate-700 rounded text-xs text-slate-200 hover:text-amber-300 text-left transition-all cursor-pointer font-medium"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>Pekan Ujian</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">Masuk: 06:30 (Terlambat: 07:30)</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplySchedulePreset('ramadhan')}
                className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 hover:border-emerald-500/50 border border-slate-700 rounded text-xs text-slate-200 hover:text-emerald-300 text-left transition-all cursor-pointer font-medium"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>Ramadhan</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">Masuk: 06:30 (Pulang: 12:00)</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplySchedulePreset('upacara')}
                className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 hover:border-emerald-500/50 border border-slate-700 rounded text-xs text-slate-200 hover:text-rose-300 text-left transition-all cursor-pointer font-medium"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>Upacara Senin</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">Masuk: 05:45 (Terlambat: 06:45)</div>
              </button>
            </div>
          </div>

          {/* CONTROL BOX: BUKA GERBANG MANUAL (TESTING & DEBUG DILUAR JADWAL) */}
          <div className="card-container-compact p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`badge-sharp font-mono uppercase tracking-wider ${
                  scheduleForm.manualGateOverride 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' 
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {scheduleForm.manualGateOverride ? 'OVERRIDE MANUAL AKTIF' : 'OTOMATIS SESUAI JADWAL'}
                </span>
                <h4 className="text-sm font-bold text-white">
                  Buka Gerbang Manual (Testing & Debugging di Luar Jam)
                </h4>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Aktifkan opsi ini jika Admin ingin melakukan uji coba tap kartu RFID, tes audio/TTS sambutan, dan cek bug di luar jam operasional sekolah (melewati batas jam 17.00 WIB) tanpa terhalang layar standby.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleManualGateOverride}
              className={`px-4 py-2 rounded font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 ${
                scheduleForm.manualGateOverride
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400'
                  : 'btn-secondary-sharp'
              }`}
            >
              <span>{scheduleForm.manualGateOverride ? 'Matikan Override (Kunci Normal)' : 'Buka Gerbang Manual Sekarang'}</span>
            </button>
          </div>

          <form onSubmit={handleSaveSchedule} className="space-y-6 w-full">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Instansi / Sekolah
                </label>
                <input
                  type="text"
                  value={scheduleForm.schoolName}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, schoolName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tahun Ajaran Aktif
                </label>
                <input
                  type="text"
                  value={scheduleForm.academicYear || '2026/2027'}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, academicYear: e.target.value })}
                  placeholder="2026/2027"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Format: YYYY/YYYY (misal: 2026/2027)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Alamat Sekolah
                </label>
                <input
                  type="text"
                  value={scheduleForm.schoolAddress}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, schoolAddress: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* JAM OPERASIONAL LENGKAP DENGAN PENJELASAN */}
            <div className="space-y-3 w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                  Konfigurasi Jam Sesi & Toleransi Keterlambatan
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">
                  Format 24 Jam (WIB)
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 card-container-compact w-full items-stretch">
                
                {/* 1. BUKA MASUK */}
                <div className="card-container-compact border border-emerald-500/30 hover:border-emerald-500/60 flex flex-col justify-between h-full shadow-xs transition-all">
                  <div>
                    <div className="h-8 flex items-center justify-between gap-1 mb-2.5">
                      <label className="text-xs font-bold text-emerald-400 truncate">
                        1. Buka Masuk
                      </label>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        START
                      </span>
                    </div>
                    <input
                      type="time"
                      value={scheduleForm.entryStartTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, entryStartTime: e.target.value })}
                      className="h-10 w-full bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                      required
                    />
                    {/* Quick Presets (2x2 Uniform Grid) */}
                    <div className="grid grid-cols-2 gap-1 mt-2.5">
                      {['05:00', '05:30', '06:00', '06:30'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, entryStartTime: preset })}
                          className={`h-6 text-[10px] px-1 rounded font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                            scheduleForm.entryStartTime === preset
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-300 border border-slate-800'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 min-h-[42px] flex items-center">
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Kiosk mulai membaca kartu kedatangan.
                    </span>
                  </div>
                </div>

                {/* 2. BATAS TELAT */}
                <div className="card-container-compact border border-amber-500/30 hover:border-amber-500/60 flex flex-col justify-between h-full shadow-xs transition-all">
                  <div>
                    <div className="h-8 flex items-center justify-between gap-1 mb-2.5">
                      <label className="text-xs font-bold text-amber-400 truncate">
                        2. Batas Terlambat
                      </label>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        DEADLINE
                      </span>
                    </div>
                    <input
                      type="time"
                      value={scheduleForm.entryDeadlineTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, entryDeadlineTime: e.target.value })}
                      className="h-10 w-full bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-amber-300 focus:outline-none focus:border-amber-500 font-mono font-bold tabular-nums"
                      required
                    />
                    {/* Quick Presets (2x2 Uniform Grid) */}
                    <div className="grid grid-cols-2 gap-1 mt-2.5">
                      {['06:45', '07:00', '07:15', '07:30'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, entryDeadlineTime: preset })}
                          className={`h-6 text-[10px] px-1 rounded font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                            scheduleForm.entryDeadlineTime === preset
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 min-h-[42px] flex items-center">
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Lewat jam ini dicatat <strong className="text-amber-400 font-bold">TERLAMBAT</strong>.
                    </span>
                  </div>
                </div>

                {/* 3. TOLERANSI TELAT */}
                <div className="card-container-compact border border-indigo-500/30 hover:border-indigo-500/60 flex flex-col justify-between h-full shadow-xs transition-all">
                  <div>
                    <div className="h-8 flex items-center justify-between gap-1 mb-2.5">
                      <label className="text-xs font-bold text-indigo-400 truncate">
                        3. Toleransi (M)
                      </label>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        DISPEN
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={scheduleForm.lateToleranceMinutes ?? 0}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, lateToleranceMinutes: Number(e.target.value) })}
                        className="h-10 w-full bg-slate-900 border border-slate-700 rounded pl-3 pr-11 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 font-mono font-bold tabular-nums"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold pointer-events-none">
                        Mnt
                      </span>
                    </div>
                    {/* Quick Presets (2x2 Uniform Grid) */}
                    <div className="grid grid-cols-2 gap-1 mt-2.5">
                      {[0, 5, 10, 15].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, lateToleranceMinutes: preset })}
                          className={`h-6 text-[10px] px-1 rounded font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                            (scheduleForm.lateToleranceMinutes ?? 0) === preset
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-indigo-300 border border-slate-800'
                          }`}
                        >
                          {preset} Menit
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 min-h-[42px] flex items-center">
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Jeda toleransi sebelum status telat.
                    </span>
                  </div>
                </div>

                {/* 4. TUTUP MASUK */}
                <div className="card-container-compact border border-purple-500/30 hover:border-purple-500/60 flex flex-col justify-between h-full shadow-xs transition-all">
                  <div>
                    <div className="h-8 flex items-center justify-between gap-1 mb-2.5">
                      <label className="text-xs font-bold text-purple-400 truncate">
                        4. Tutup Masuk
                      </label>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        CUT OFF
                      </span>
                    </div>
                    <input
                      type="time"
                      value={scheduleForm.entryEndTime || '08:30'}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, entryEndTime: e.target.value })}
                      className="h-10 w-full bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-purple-300 focus:outline-none focus:border-purple-500 font-mono font-bold tabular-nums"
                      required
                    />
                    {/* Quick Presets (2x2 Uniform Grid) */}
                    <div className="grid grid-cols-2 gap-1 mt-2.5">
                      {['07:30', '08:00', '08:30', '09:00'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, entryEndTime: preset })}
                          className={`h-6 text-[10px] px-1 rounded font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                            (scheduleForm.entryEndTime || '08:30') === preset
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-purple-300 border border-slate-800'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 min-h-[42px] flex items-center">
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Sesi kedatangan ditutup masuk KBM.
                    </span>
                  </div>
                </div>

                {/* 5. BUKA PULANG */}
                <div className="card-container-compact border border-blue-500/30 hover:border-blue-500/60 flex flex-col justify-between h-full shadow-xs transition-all">
                  <div>
                    <div className="h-8 flex items-center justify-between gap-1 mb-2.5">
                      <label className="text-xs font-bold text-blue-400 truncate">
                        5. Buka Pulang
                      </label>
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        PULANG
                      </span>
                    </div>
                    <input
                      type="time"
                      value={scheduleForm.exitStartTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, exitStartTime: e.target.value })}
                      className="h-10 w-full bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-blue-300 focus:outline-none focus:border-blue-500 font-mono font-bold tabular-nums"
                      required
                    />
                    {/* Quick Presets (2x2 Uniform Grid) */}
                    <div className="grid grid-cols-2 gap-1 mt-2.5">
                      {['13:30', '14:00', '15:00', '15:30'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, exitStartTime: preset })}
                          className={`h-6 text-[10px] px-1 rounded font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                            scheduleForm.exitStartTime === preset
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-blue-300 border border-slate-800'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 min-h-[42px] flex items-center">
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Beralih otomatis ke sesi <strong className="text-blue-400 font-bold">PULANG</strong>.
                    </span>
                  </div>
                </div>

                {/* 6. TUTUP KIOSK */}
                <div className="card-container-compact border border-rose-500/30 hover:border-rose-500/60 flex flex-col justify-between h-full shadow-xs transition-all">
                  <div>
                    <div className="h-8 flex items-center justify-between gap-1 mb-2.5">
                      <label className="text-xs font-bold text-rose-400 truncate">
                        6. Tutup Kiosk
                      </label>
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                        CLOSED
                      </span>
                    </div>
                    <input
                      type="time"
                      value={scheduleForm.exitEndTime || '17:00'}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, exitEndTime: e.target.value })}
                      className="h-10 w-full bg-slate-900 border border-rose-900/50 rounded px-2.5 text-xs text-rose-200 focus:outline-none focus:border-rose-500 font-mono font-bold tabular-nums"
                      required
                    />
                    {/* Quick Presets (2x2 Uniform Grid) */}
                    <div className="grid grid-cols-2 gap-1 mt-2.5">
                      {['16:30', '17:00', '17:30', '18:00'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, exitEndTime: preset })}
                          className={`h-6 text-[10px] px-1 rounded font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                            (scheduleForm.exitEndTime || '17:00') === preset
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 min-h-[42px] flex items-center">
                    <span className="text-[10px] text-slate-400 leading-snug">
                      Kiosk standby / istirahat malam.
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* INTERACTIVE TIMELINE & SIMULATOR */}
            <div className="card-container space-y-4 w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>Simulator Uji Jam Tap Kartu Interaktif</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Coba Masukkan Jam Tap:</span>
                  <input
                    type="time"
                    value={simulationTapTime}
                    onChange={(e) => setSimulationTapTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-emerald-300 font-mono font-bold text-xs px-2.5 py-1 rounded focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              </div>

              {/* Simulation Live Result */}
              {(() => {
                const [tapH, tapM] = simulationTapTime.split(':').map(Number);
                const tapMinutes = tapH * 60 + tapM;

                const [startH, startM] = (scheduleForm.entryStartTime || '06:00').split(':').map(Number);
                const startMinutes = startH * 60 + startM;

                const [deadH, deadM] = (scheduleForm.entryDeadlineTime || '07:15').split(':').map(Number);
                const deadMinutes = deadH * 60 + deadM;

                const tolerance = scheduleForm.lateToleranceMinutes || 0;
                const effectiveDeadline = deadMinutes + tolerance;

                const [exitH, exitM] = (scheduleForm.exitStartTime || '14:00').split(':').map(Number);
                const exitMinutes = exitH * 60 + exitM;

                const [exitEndH, exitEndM] = (scheduleForm.exitEndTime || '17:00').split(':').map(Number);
                const exitEndMinutes = exitEndH * 60 + exitEndM;

                let simStatus = 'TEPAT_WAKTU';
                let simBadge = 'HADIR TEPAT WAKTU';
                let simBoxClass = 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300';
                let simDesc = `Siswa tap pada jam ${simulationTapTime} WIB sebelum batas ${scheduleForm.entryDeadlineTime} WIB${tolerance > 0 ? ` (+ toleransi ${tolerance}m)` : ''}.`;

                if (tapMinutes < startMinutes) {
                  simStatus = 'EARLY';
                  simBadge = 'SEBELUM JAM MASUK DIBUKA';
                  simBoxClass = 'bg-slate-900 border-slate-700 text-slate-300';
                  simDesc = `Kiosk belum mulai membaca kartu kedatangan (baru dibuka pukul ${scheduleForm.entryStartTime} WIB).`;
                } else if (tapMinutes <= effectiveDeadline) {
                  simStatus = 'TEPAT_WAKTU';
                  simBadge = 'HADIR TEPAT WAKTU';
                  simBoxClass = 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300';
                  simDesc = `Siswa tercatat Tepat Waktu.`;
                } else if (tapMinutes < exitMinutes) {
                  const lateMins = tapMinutes - deadMinutes;
                  simStatus = 'TERLAMBAT';
                  simBadge = `HADIR TERLAMBAT (+${lateMins} MENIT)`;
                  simBoxClass = 'bg-amber-950/40 border-amber-500/40 text-amber-300';
                  simDesc = `Siswa tap melebihi batas jam ${scheduleForm.entryDeadlineTime} WIB dan tercatat Terlambat ${lateMins} menit.`;
                } else if (tapMinutes <= exitEndMinutes) {
                  simStatus = 'PULANG';
                  simBadge = 'SESI ABSEN PULANG';
                  simBoxClass = 'bg-blue-950/40 border-blue-500/40 text-blue-300';
                  simDesc = `Siswa tap di sesi kepulangan dan status kepulangan langsung tercatat.`;
                } else {
                  simStatus = 'CLOSED';
                  simBadge = 'KIOSK SUDAH TUTUP';
                  simBoxClass = 'bg-rose-950/40 border-rose-500/40 text-rose-300';
                  simDesc = `Di luar jam operasional (setelah ${scheduleForm.exitEndTime || '17:00'} WIB).`;
                }

                return (
                  <div className={`p-3.5 rounded border ${simBoxClass} flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full`}>
                    <div>
                      <div className="font-extrabold text-xs tracking-wider">{simBadge}</div>
                      <div className="text-[11px] opacity-90 mt-0.5">{simDesc}</div>
                    </div>
                    <div className="font-mono text-xs font-black shrink-0 px-3 py-1 bg-black/40 rounded tabular-nums">
                      Jam Simulasi: {simulationTapTime} WIB
                    </div>
                  </div>
                );
              })()}

              {/* Visual Flow summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs pt-1 w-full">
                <div className="card-container-compact border-emerald-500/30 p-2.5">
                  <div className="text-emerald-400 font-bold">Sesi Masuk (Tepat Waktu)</div>
                  <div className="text-white font-mono text-xs mt-0.5 tabular-nums">{scheduleForm.entryStartTime} - {scheduleForm.entryDeadlineTime} WIB</div>
                  <div className="text-[10px] text-slate-400 mt-1">Dicatat Hadir Tepat Waktu.</div>
                </div>

                <div className="card-container-compact border-amber-500/30 p-2.5">
                  <div className="text-amber-400 font-bold">Sesi Terlambat</div>
                  <div className="text-white font-mono text-xs mt-0.5 tabular-nums">{scheduleForm.entryDeadlineTime} - {scheduleForm.exitStartTime} WIB</div>
                  <div className="text-[10px] text-slate-400 mt-1">Dicatat Hadir Terlambat (+x menit).</div>
                </div>

                <div className="card-container-compact border-blue-500/30 p-2.5">
                  <div className="text-blue-400 font-bold">Sesi Pulang</div>
                  <div className="text-white font-mono text-xs mt-0.5 tabular-nums">{scheduleForm.exitStartTime} - {scheduleForm.exitEndTime || '17:00'} WIB</div>
                  <div className="text-[10px] text-slate-400 mt-1">Mencatat waktu kepulangan siswa & guru.</div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Batas Cooldown Anti Double-Tap (Detik)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={scheduleForm.cooldownSeconds ?? scheduleForm.antiSpamCooldownSeconds ?? 60}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setScheduleForm({
                    ...scheduleForm,
                    cooldownSeconds: val,
                    antiSpamCooldownSeconds: val
                  });
                }}
                className="w-full sm:w-64 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                required
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Mencegah tap kartu ganda oleh orang yang sama dalam rentang detik tertentu ({scheduleForm.cooldownSeconds ?? 60} detik).
              </span>
            </div>

            {/* KIOSK LOCK SCREEN & SECURITY PIN CONFIGURATION */}
            <div className="card-container border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded border border-amber-500/30">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-white">Pengaturan Kiosk Lock Screen & PIN</h4>
                    <p className="text-[11px] text-slate-400">Proteksi layar Kiosk dari interaksi murid tanpa pengawasan</p>
                  </div>
                </div>
                <div className="px-2.5 py-1 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded border border-amber-500/30 font-mono tabular-nums">
                  PIN AKTIF: {AttendanceStorage.getKioskPin()}
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Saat mode Kiosk terkunci, tombol sensitif (ganti gerbang, buka dashboard, login admin, dan status database) akan terlindungi dan mewajibkan petugas memasukkan PIN terlebih dahulu.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 pt-1">
                <div className="relative w-full sm:w-60">
                  <KeyRound className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={8}
                    value={kioskPinInput}
                    onChange={(e) => setKioskPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="PIN 4-6 Angka"
                    className="w-full bg-slate-900 border border-amber-500/40 rounded pl-9 pr-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400 tabular-nums"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!kioskPinInput || kioskPinInput.length < 4) {
                      alert('PIN Keamanan Kiosk minimal harus 4 digit angka!');
                      return;
                    }
                    AttendanceStorage.setKioskPin(kioskPinInput);
                    showToast(`PIN Kiosk Lock Screen berhasil diperbarui menjadi "${kioskPinInput}"!`);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Update PIN Kiosk</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    AttendanceStorage.setKioskPin('1234');
                    setKioskPinInput('1234');
                    showToast('PIN Kiosk dikembalikan ke default: 1234');
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold transition-all cursor-pointer"
                >
                  Reset Default (1234)
                </button>
              </div>
            </div>

            {/* DEVICE GATEKEEPER AUTHORIZATION PIN CONFIGURATION */}
            <div className="card-container border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-white">Kunci Rahasia Otorisasi Perangkat Sekolah (Device Key)</h4>
                    <p className="text-[11px] text-slate-400">Proteksi terminal fisik absensi: wajib memasukkan 6-digit PIN saat terminal dibuka pertama kali setiap hari</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge-sharp bg-emerald-500/20 text-emerald-300 font-mono tabular-nums text-xs">
                    PIN AKTIF: {scheduleForm.deviceSecretPin || '789012'}
                  </span>
                  <span className="badge-sharp bg-blue-500/20 text-blue-300 font-mono text-[10px]">
                    RESET HARIAN 00:00 WIB
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed space-y-1">
                <p>
                  Kunci rahasia ini memastikan bahwa gawai/layar ini benar-benar terminal absensi fisik resmi sekolah dan mencegah siswa melakukan absensi iseng dari browser luar atau rumah.
                </p>
                <p className="text-slate-400 text-[11px]">
                  Otorisasi berlaku 1 hari kalender dan otomatis terkunci kembali ke layar otorisasi setiap tengah malam (00:00 WIB).
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 pt-1">
                <div className="relative w-full sm:w-64">
                  <KeyRound className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={6}
                    value={devicePinInput}
                    onChange={(e) => setDevicePinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="PIN Rahasia 6 Angka"
                    className="w-full bg-slate-900 border border-emerald-500/40 rounded pl-9 pr-3 py-2 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-400 tabular-nums tracking-widest"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleUpdateDevicePin}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Update Kunci Perangkat</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetDevicePinDefault}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold transition-all cursor-pointer"
                >
                  Reset Default (789012)
                </button>

                <button
                  type="button"
                  onClick={handleLockTerminalNow}
                  className="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-800/60 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 sm:ml-auto"
                >
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Kunci Terminal Sekarang</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="submit"
                className="btn-primary-sharp px-6 py-2.5 text-xs flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Aturan Jam Operasional</span>
              </button>
            </div>
          </form>

          {/* DANGER ZONE: RESET ABSENSI HARI INI */}
          <div className="mt-8 pt-6 border-t border-slate-700/80 w-full space-y-4">
            
            {/* Snapshot Archive Action Box */}
            <div className="card-container border-emerald-500/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Arsip & Snapshot Otomatis Absensi</span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  Sistem secara otomatis mengarsipkan data kemarin ke database saat pergantian hari (00:00 WIB). Anda juga dapat menyimpan snapshot rekap kehadiran hari ini secara manual kapan saja.
                </p>
              </div>
              <button
                type="button"
                onClick={handleManualArchiveToday}
                className="btn-primary-sharp px-4 py-2.5 text-xs flex items-center gap-2 shrink-0"
              >
                <Database className="w-4 h-4" />
                <span>Simpan Snapshot Hari Ini</span>
              </button>
            </div>

            {/* Reset Today Action Box */}
            <div className="card-container border-rose-500/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
              <div>
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Zona Reset: Bersihkan Data Absensi Hari Ini</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  Gunakan tombol ini jika terdapat kesalahan penginputan kartu atau ingin mengulang pencatatan absensi hari ini ({new Date().toISOString().split('T')[0]}) dari awal. Data snapshot sebelum reset akan otomatis diarsipkan ke database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResetTodayModalOpen(true)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded transition-all cursor-pointer shrink-0 shadow-lg flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Absensi Hari Ini</span>
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: REKAP & DOWNLOAD REPORT (PER HARI, PER MINGGU, PER BULAN + SORT/FILTER) */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="card-container space-y-6">
          {/* Header & Export Action Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-bold text-white">Rekap & Download Laporan Absensi</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Pilih periode pelaporan (Harian, Mingguan, Bulanan, atau Custom) dan filter data untuk diunduh.
              </p>
            </div>

            {/* Download Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="btn-primary-sharp flex items-center gap-1.5 px-4 py-2.5 text-xs"
                title={`Unduh file Excel ${periodTitleLabel}`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Excel (.xlsx)</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="btn-secondary-sharp flex items-center gap-1.5 px-4 py-2.5 text-xs"
                title={`Unduh file CSV ${periodTitleLabel}`}
              >
                <Download className="w-4 h-4" />
                <span>CSV</span>
              </button>
              <button
                onClick={handlePrintReport}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded border border-emerald-500/30 transition-all cursor-pointer"
                title={`Cetak format resmi ${periodTitleLabel}`}
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / PDF</span>
              </button>
            </div>
          </div>

          {/* PERIODE SELECTOR TABS (HARIAN, MINGGUAN, BULANAN, CUSTOM) */}
          <div className="card-container-compact space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black text-white uppercase tracking-wider">Pilih Mode Periode Laporan:</span>
              </div>

              {/* Mode Buttons */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded border border-slate-800">
                <button
                  type="button"
                  onClick={() => setReportPeriodMode('daily')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    reportPeriodMode === 'daily'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Per Hari (Harian)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportPeriodMode('weekly')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    reportPeriodMode === 'weekly'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CalendarRange className="w-3.5 h-3.5" />
                  <span>Per Minggu (Mingguan)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportPeriodMode('monthly')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    reportPeriodMode === 'monthly'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Per Bulan (Bulanan)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportPeriodMode('custom')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    reportPeriodMode === 'custom'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Rentang Kustom</span>
                </button>
              </div>
            </div>

            {/* DYNAMIC DATE CONTROLS ACCORDING TO SELECTED MODE */}
            <div className="p-3 bg-slate-950/70 rounded border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              
              {/* DAILY CONTROLS */}
              {reportPeriodMode === 'daily' && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-300">Pilih Tanggal:</label>
                    <input
                      type="date"
                      value={reportDailyDate}
                      onChange={(e) => setReportDailyDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReportDailyDate(new Date().toISOString().split('T')[0])}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-emerald-300 border border-slate-700 cursor-pointer"
                    >
                      Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const yest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        setReportDailyDate(yest);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 border border-slate-700 cursor-pointer"
                    >
                      Kemarin
                    </button>
                  </div>
                </div>
              )}

              {/* WEEKLY CONTROLS */}
              {reportPeriodMode === 'weekly' && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-300">Pilih Minggu:</label>
                    <input
                      type="date"
                      value={reportWeeklyRefDate}
                      onChange={(e) => setReportWeeklyRefDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReportWeeklyRefDate(new Date().toISOString().split('T')[0])}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-emerald-300 border border-slate-700 cursor-pointer"
                    >
                      Minggu Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const lastWk = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        setReportWeeklyRefDate(lastWk);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 border border-slate-700 cursor-pointer"
                    >
                      Minggu Lalu
                    </button>
                  </div>
                </div>
              )}

              {/* MONTHLY CONTROLS */}
              {reportPeriodMode === 'monthly' && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-300">Bulan & Tahun:</label>
                    <select
                      value={reportMonth}
                      onChange={(e) => setReportMonth(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={idx} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={reportYear}
                      onChange={(e) => setReportYear(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold font-mono tabular-nums"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setReportMonth(now.getMonth() + 1);
                        setReportYear(now.getFullYear());
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-emerald-300 border border-slate-700 cursor-pointer"
                    >
                      Bulan Ini
                    </button>
                  </div>
                </div>
              )}

              {/* CUSTOM CONTROLS */}
              {reportPeriodMode === 'custom' && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-300">Dari:</label>
                    <input
                      type="date"
                      value={reportCustomStartDate}
                      onChange={(e) => setReportCustomStartDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-300">Sampai:</label>
                    <input
                      type="date"
                      value={reportCustomEndDate}
                      onChange={(e) => setReportCustomEndDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                    />
                  </div>
                </div>
              )}

              {/* ACTIVE PERIOD BADGE */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Periode Aktif:</span>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-xs font-black">
                  {periodTitleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* FILTER & SORT BAR FOR REPORTS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 card-container-compact">
            
            {/* Search */}
            <div className="md:col-span-2 relative">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Cari Data Siswa</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  placeholder="Cari nama, NISN, atau kelas..."
                  value={reportSearchTerm}
                  onChange={(e) => setReportSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Filter Kelas</label>
              <select
                value={reportClassFilter}
                onChange={(e) => setReportClassFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Semua Kelas</option>
                {uniqueClasses.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Filter Titik Pintu</label>
              <select
                value={reportGateFilter}
                onChange={(e) => setReportGateFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Semua Titik</option>
                <option value="pintu_depan">Pintu Depan</option>
                <option value="pintu_belakang">Pintu Belakang</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Filter Tipe Tap</label>
              <select
                value={reportTypeFilter}
                onChange={(e) => setReportTypeFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Semua Tipe (Masuk & Pulang)</option>
                <option value="MASUK">Absen Masuk Pagi</option>
                <option value="PULANG">Absen Pulang Sore</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Filter Status</label>
              <select
                value={reportStatusFilter}
                onChange={(e) => setReportStatusFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Semua Status</option>
                <option value="TEPAT_WAKTU">Tepat Waktu</option>
                <option value="TERLAMBAT">Terlambat</option>
                <option value="PULANG">Pulang</option>
              </select>
            </div>
          </div>

          {/* REPORT STATS & SORTING HEADER */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-container-compact p-3">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Total Rekam</span>
              <p className="text-xl font-black text-white font-mono tabular-nums">{reportStats.total}</p>
            </div>
            <div className="card-container-compact border border-emerald-500/30 p-3">
              <span className="text-[10px] text-emerald-400 uppercase font-bold">Tepat Waktu</span>
              <p className="text-xl font-black text-emerald-300 font-mono tabular-nums">{reportStats.onTime}</p>
            </div>
            <div className="card-container-compact border border-amber-500/30 p-3">
              <span className="text-[10px] text-amber-400 uppercase font-bold">Terlambat</span>
              <p className="text-xl font-black text-amber-300 font-mono tabular-nums">{reportStats.late}</p>
            </div>
            <div className="card-container-compact border border-blue-500/30 p-3">
              <span className="text-[10px] text-blue-400 uppercase font-bold">Absen Pulang</span>
              <p className="text-xl font-black text-blue-300 font-mono tabular-nums">{reportStats.checkouts}</p>
            </div>
          </div>

          {/* SORTING SELECTOR FOR REPORTS & DATA HYGIENE ACTIONS */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-slate-300">Urutkan:</span>
                <select
                  value={reportSortBy}
                  onChange={(e) => setReportSortBy(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                >
                  <option value="time_desc">Waktu Absen (Terbaru ke Terlama)</option>
                  <option value="time_asc">Waktu Absen (Terlama ke Terbaru)</option>
                  <option value="name_asc">Nama Siswa (A - Z)</option>
                  <option value="name_desc">Nama Siswa (Z - A)</option>
                  <option value="nisn_asc">NISN (Terkecil - Terbesar)</option>
                  <option value="nisn_desc">NISN (Terbesar - Terkecil)</option>
                  <option value="late_desc">Keterlambatan (Paling Terlambat)</option>
                  <option value="class_asc">Kelas (A - Z)</option>
                </select>
              </div>

              {/* FORMAT VIEW TOGGLE (Only when not daily: Mingguan, Bulanan, Custom) */}
              {reportPeriodMode !== 'daily' && (
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setReportViewFormat('aggregated');
                      setReportCurrentPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      reportViewFormat === 'aggregated'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Rekap Agregasi Siswa</span>
                    <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-emerald-950 text-emerald-200 rounded font-mono tabular-nums">
                      {periodicStudentSummaries.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReportViewFormat('raw_logs');
                      setReportCurrentPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      reportViewFormat === 'raw_logs'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Log Harian Mentah</span>
                    <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-slate-800 text-slate-300 rounded font-mono tabular-nums">
                      {filteredAndSortedReports.length}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAutoHealRecords}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 hover:text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Cocokkan kembali data siswa jika nama sempat hilang atau kosong"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Perbaiki & Sinkron Data</span>
              </button>
              <button
                type="button"
                onClick={handleCleanOrphanRecords}
                className="px-2.5 py-1 bg-amber-950/50 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 hover:text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Hapus baris absensi yang tidak bertuan / data siswa kosong"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan Data Kosong</span>
              </button>
              <span className="text-[11px] text-slate-400 font-medium ml-2 font-mono tabular-nums">
                {reportPeriodMode !== 'daily' && reportViewFormat === 'aggregated'
                  ? `Total: ${periodicStudentSummaries.length} siswa`
                  : `Total: ${filteredAndSortedReports.length} baris`}
              </span>
            </div>
          </div>

          {/* VIEW MODE 1: AGGREGATED STUDENT SUMMARY (PERIODIC: WEEKLY, MONTHLY, CUSTOM) */}
          {reportPeriodMode !== 'daily' && reportViewFormat === 'aggregated' ? (
            <div className="table-container-sharp overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-3.5 px-4 text-center w-12">No</th>
                    <th className="py-3.5 px-4">Nama Siswa</th>
                    <th className="py-3.5 px-4">NISN</th>
                    <th className="py-3.5 px-4">Kelas</th>
                    <th className="py-3.5 px-4 text-center">Hadir</th>
                    <th className="py-3.5 px-4 text-center">Tidak Hadir</th>
                    <th className="py-3.5 px-4 text-center">Total Hari</th>
                    <th className="py-3.5 px-4 text-center">Rata-rata Masuk</th>
                    <th className="py-3.5 px-4 text-center">Tepat Waktu</th>
                    <th className="py-3.5 px-4 text-center">Terlambat</th>
                    <th className="py-3.5 px-4 text-center">Predikat Disiplin</th>
                    <th className="py-3.5 px-4 text-center w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 bg-slate-900/40">
                  {periodicStudentSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-500">
                        Tidak ada data presensi siswa yang cocok pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    paginatedSummaries.map((summary, idx) => {
                      const rowIdx = (reportCurrentPage - 1) * reportPageSize + idx + 1;
                      return (
                        <tr key={summary.studentId} className="hover:bg-slate-800/60 transition-colors">
                          <td className="py-3.5 px-4 text-center text-slate-500 font-mono tabular-nums">{rowIdx}</td>
                          <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                            {summary.name}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-amber-200 whitespace-nowrap">
                            {summary.nisn || '-'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                              {summary.className}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className="font-mono font-black text-emerald-400 text-sm tabular-nums">
                              {summary.totalPresent}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-1">Hari</span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className={`font-mono font-black text-sm tabular-nums ${summary.daysAbsent > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                              {summary.daysAbsent}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-1">Hari</span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap font-mono text-slate-400 text-xs tabular-nums">
                            {summary.totalEffectiveDays} Hari
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap font-mono font-bold text-sky-300 text-xs tabular-nums">
                            {summary.averageEntryTime}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className="font-mono font-bold text-emerald-300 tabular-nums">
                              {summary.onTimeCount} Hari
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono tabular-nums">
                              ({summary.punctualityRate}%)
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {summary.lateCount > 0 ? (
                              <div>
                                <span className="font-mono font-bold text-amber-400 tabular-nums">
                                  {summary.lateCount} Hari
                                </span>
                                <span className="text-[10px] text-amber-300/80 block font-mono tabular-nums">
                                  +{summary.totalLateMinutes} Menit
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 font-mono font-bold">0 Hari</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded text-[10px] font-black border ${
                              summary.disciplineGrade === 'Sangat Baik'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : summary.disciplineGrade === 'Baik'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : summary.disciplineGrade === 'Cukup'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}>
                              {summary.disciplineGrade}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedStudentPeriodicDetail(summary)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white rounded text-xs font-bold transition-all border border-emerald-500/40 flex items-center justify-center gap-1 mx-auto cursor-pointer"
                              title="Lihat Log Riwayat Harian Siswa Ini"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              <TablePagination
                currentPage={reportCurrentPage}
                totalItems={periodicStudentSummaries.length}
                pageSize={reportPageSize}
                onPageChange={setReportCurrentPage}
                onPageSizeChange={setReportPageSize}
                itemName="siswa"
              />
            </div>
          ) : (
            /* VIEW MODE 2: RAW DAILY ATTENDANCE LOGS (HARIAN ATAU MODE RAW LOGS) */
            <div className="table-container-sharp overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-3.5 px-4 text-center">No</th>
                    <th className="py-3.5 px-4">Tanggal (DD-MM-YYYY)</th>
                    <th className="py-3.5 px-4">NISN</th>
                    <th className="py-3.5 px-4">Nama Siswa</th>
                    <th className="py-3.5 px-4">Kelas</th>
                    <th className="py-3.5 px-4">Tap Masuk</th>
                    <th className="py-3.5 px-4">Tap Pulang</th>
                    <th className="py-3.5 px-4">Status Kehadiran</th>
                    <th className="py-3.5 px-4">Keterangan</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 bg-slate-900/40">
                  {filteredAndSortedReports.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        Tidak ada data absensi untuk periode atau filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    paginatedReports.map((rec, idx) => {
                      const rowIdx = (reportCurrentPage - 1) * reportPageSize + idx + 1;
                      return (
                        <tr key={rec.id} className={`hover:bg-slate-800/60 transition-colors ${rec.isOrphan ? 'bg-amber-950/10' : ''}`}>
                          <td className="py-3.5 px-4 text-center text-slate-500 font-mono tabular-nums">{rowIdx}</td>
                          <td className="py-3.5 px-4 font-mono whitespace-nowrap text-slate-300 tabular-nums">{formatToDDMMYYYY(rec.dateFormatted)}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-amber-200">{rec.nisn || '-'}</td>
                          <td className="py-3.5 px-4 font-bold whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={rec.studentName ? 'text-white' : 'text-slate-400 italic'}>
                                {rec.studentName || '(Data Siswa Kosong / Terhapus)'}
                              </span>
                              {rec.isOrphan && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  UID: {rec.rfidUid}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300">{rec.studentClass || '-'}</td>
                          
                          {/* Tap Masuk Column */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-emerald-400 text-xs tabular-nums">
                                  {rec.entryTime !== '-' ? `${rec.entryTime} WIB` : '-'}
                                </span>
                                {rec.entryStatus !== 'BELUM_HADIR' && (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                    rec.entryStatus === 'TEPAT_WAKTU' 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : rec.entryStatus === 'TERLAMBAT'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-700 text-slate-300'
                                  }`}>
                                    {rec.entryStatus === 'TEPAT_WAKTU' ? 'TEPAT' : rec.entryStatus === 'TERLAMBAT' ? `+${rec.lateMinutes || 0}m` : rec.entryStatus}
                                  </span>
                                )}
                              </div>
                              {rec.entryGate && rec.entryGate !== '-' && (
                                <span className="text-[10px] text-slate-400 block">{rec.entryGate}</span>
                              )}
                            </div>
                          </td>

                          {/* Tap Pulang Column */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                {rec.exitTime !== 'Belum Pulang' ? (
                                  <span className="font-mono font-bold text-blue-400 text-xs tabular-nums">
                                    {rec.exitTime} WIB
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                    Belum Pulang
                                  </span>
                                )}
                              </div>
                              {rec.exitGate && rec.exitGate !== '-' && (
                                <span className="text-[10px] text-slate-400 block">{rec.exitGate}</span>
                              )}
                            </div>
                          </td>

                          {/* Status Kehadiran Column */}
                          <td className="py-3.5 px-4 font-semibold whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5 ${
                              rec.entryStatus === 'TEPAT_WAKTU'
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                : rec.entryStatus === 'TERLAMBAT'
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                rec.entryStatus === 'TEPAT_WAKTU' ? 'bg-emerald-400' : rec.entryStatus === 'TERLAMBAT' ? 'bg-amber-400' : 'bg-blue-400'
                              }`} />
                              {rec.summaryStatus}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-400 text-[11px] max-w-xs truncate">{rec.notes || '-'}</td>

                          {/* Actions Column */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeletePairedRecord(rec)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                              title="Hapus baris absensi ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              <TablePagination
                currentPage={reportCurrentPage}
                totalItems={filteredAndSortedReports.length}
                pageSize={reportPageSize}
                onPageChange={setReportCurrentPage}
                onPageSizeChange={setReportPageSize}
                itemName="catatan absensi"
              />
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: REKAP KETERLAMBATAN MINGGUAN & BULANAN SISWA */}
      {/* ========================================================================= */}
      {activeTab === 'late_reports' && (
        <ErrorBoundary fallbackTitle="Rekap Keterlambatan Belum Dapat Ditampilkan">
          <StudentLateRecapReport
            students={students}
            records={attendanceRecords}
            classes={classes}
            schedule={schedule}
            onNavigateTab={(tab) => {
              setActiveTab(tab as any);
            }}
          />
        </ErrorBoundary>
      )}


      {/* ========================================================================= */}
      {/* TAB: REKAP & LAPORAN PRESENSI GURU & PTK */}
      {/* ========================================================================= */}
      {activeTab === 'teacher_reports' && (
        <TeacherReports
          schedule={schedule}
          showToast={showToast}
          onNavigateTab={(tab) => {
            setActiveTab(tab);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 5: LEADERBOARD & PERINGKAT KEDATANGAN HUB */}
      {/* (Data Tercepat Hari Ini, Top Terpagi Siswa, & Top Terlambat Siswa) */}
      {/* ========================================================================= */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          
          {/* Sub-Navigation Switcher for Leaderboard Hub */}
          <div className="card-container-compact p-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded border border-slate-800 text-xs font-bold w-full sm:w-auto">
              
              {/* Sub-Tab 1: Urutan Kedatangan Hari Ini */}
              <button
                type="button"
                onClick={() => setLeaderboardSubTab('today_arrival')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  leaderboardSubTab === 'today_arrival'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Urutan Hari Ini (Tercepat)</span>
                {arrivalRankingToday.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-emerald-500/30 text-emerald-200 text-[10px] rounded font-mono font-bold tabular-nums">
                    {arrivalRankingToday.length}
                  </span>
                )}
              </button>

              {/* Sub-Tab 2: Top Siswa Terpagi & Rajin */}
              <button
                type="button"
                onClick={() => setLeaderboardSubTab('early_rank')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  leaderboardSubTab === 'early_rank'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-emerald-300" />
                <span>Top Siswa Terpagi</span>
              </button>

              {/* Sub-Tab 3: Top Siswa Sering Terlambat */}
              <button
                type="button"
                onClick={() => setLeaderboardSubTab('late_rank')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  leaderboardSubTab === 'late_rank'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
                <span>Top Siswa Terlambat</span>
              </button>
            </div>
          </div>

          {/* SUB-VIEW 1: URUTAN LIVE KEDATANGAN HARI INI */}
          {leaderboardSubTab === 'today_arrival' && (
            <div className="card-container space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <span>Data Lengkap Urutan Kedatangan Hari Ini</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Diurutkan berdasarkan urutan waktu pertama kali tap kartu RFID saat presensi masuk hari ini ({new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}).
                  </p>
                </div>

                {/* Siswa Arrival Status Badge */}
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-sm border border-slate-800 text-xs font-semibold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400" />
                  <span className="text-slate-400">Total Hadir:</span>
                  <span className="text-emerald-400 font-mono font-bold tabular-nums text-sm">{arrivalRankingToday.length} Siswa</span>
                </div>
              </div>

              <div className="table-container-sharp overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-700">
                    <tr>
                      <th className="py-3.5 px-4 text-center">Urutan</th>
                      <th className="py-3.5 px-4">Waktu Tap</th>
                      <th className="py-3.5 px-4">NISN / NIS</th>
                      <th className="py-3.5 px-4">Nama Lengkap Siswa</th>
                      <th className="py-3.5 px-4">Kelas</th>
                      <th className="py-3.5 px-4">Titik Pintu</th>
                      <th className="py-3.5 px-4">Status Kedatangan</th>
                      <th className="py-3.5 px-4">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 bg-slate-900/40">
                    {arrivalRankingToday.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          Belum ada catatan presensi masuk siswa hari ini.
                        </td>
                      </tr>
                    ) : (
                      arrivalRankingToday.map((item) => {
                        const std = students.find(s => s.id === item.record.studentId || (item.record.nisn && s.nisn === item.record.nisn));
                        const nisnDisplay = item.record.nisn || std?.nisn || (item.record.nis ? `NIS: ${item.record.nis}` : '-');
                        const displayName = item.record.studentName || std?.name || 'Siswa';
                        const subLabel = item.record.studentClass || std?.class || '-';

                        return (
                          <tr key={item.record.id} className={`hover:bg-slate-800/60 transition-colors ${
                            item.rank === 1 ? 'bg-amber-500/10' : item.rank <= 3 ? 'bg-slate-800/30' : ''
                          }`}>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center w-7 h-6 rounded-sm font-mono font-bold text-xs ${
                                item.rank === 1 ? 'bg-amber-400 text-slate-950 border border-amber-300' :
                                item.rank === 2 ? 'bg-slate-300 text-slate-950' :
                                item.rank === 3 ? 'bg-amber-800 text-amber-100' :
                                'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}>
                                #{item.rank}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-extrabold text-amber-300 text-sm whitespace-nowrap tabular-nums">
                              {item.record.timeFormatted} WIB
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-300 whitespace-nowrap tabular-nums">
                              {nisnDisplay}
                            </td>
                            <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                              {displayName}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-200 whitespace-nowrap">
                              {subLabel}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-200">
                                {item.record.gateName}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold ${
                                item.rank === 1
                                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                                  : !item.isLate
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}>
                                {item.rank === 1 && '#1 TERCEPAT (SISWA)'}
                                {item.rank > 1 && !item.isLate && 'TEPAT WAKTU'}
                                {item.isLate && `TERLAMBAT (+${item.record.lateMinutes}m)`}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {item.record.notes || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: TOP SISWA TERPAGI & DISIPLIN (PER MINGGU / BULAN / SEMESTER / ALL-TIME) */}
          {leaderboardSubTab === 'early_rank' && (
            <StudentEarlyLeaderboard schedule={schedule} />
          )}

          {/* SUB-VIEW 3: TOP SISWA PALING SERING TERLAMBAT (PER MINGGU / BULAN / SEMESTER / ALL-TIME) */}
          {leaderboardSubTab === 'late_rank' && (
            <StudentLateLeaderboard schedule={schedule} />
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: PENGATURAN - KUSTOMISASI TAMPILAN KIOSK */}
      {/* ========================================================================= */}
      {activeTab === 'announcements' && (
        <div className="space-y-6 w-full">
          {/* Header Card */}
          <div className="card-container flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                  <Megaphone className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-bold text-white">
                  Kelola Running Text & Pesan Hari Raya Monitor
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
                Atur pengumuman siaran langsung pada monitor kiosk Pintu Depan & Pintu Belakang. Mendukung posisi <strong>Tengah (Center)</strong>, scrolling marquee berkecepatan dinamis, tema warna khusus hari raya, dan variasi ucapan instan.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-sm text-emerald-300 text-xs font-bold shrink-0 font-mono">
              <span className="w-1.5 h-1.5 rounded-xs bg-emerald-400" />
              <span>SINKRONISASI 2 ARAH</span>
            </div>
          </div>

          {/* 1. REALTIME MONITOR BANNER PREVIEW (SIMULASI LIVE KIOSK) */}
          {(() => {
            const currentTheme = scheduleForm.marqueeTheme || 'gold';
            const themeConfig = MARQUEE_THEMES_CONFIG[currentTheme] || MARQUEE_THEMES_CONFIG.gold;
            const displayMode = scheduleForm.marqueeDisplayMode || 'marquee_scroll';
            const isCentered = displayMode === 'center_pulse' || displayMode === 'center_static';
            const isPulsing = displayMode === 'center_pulse';
            
            const speedClass = scheduleForm.marqueeSpeed === 'slow'
              ? 'animate-marquee-slow'
              : scheduleForm.marqueeSpeed === 'fast'
              ? 'animate-marquee-fast'
              : scheduleForm.marqueeSpeed === 'ultra_fast'
              ? 'animate-marquee-ultra-fast'
              : 'animate-marquee-normal';

            const fontSizeClass = scheduleForm.marqueeFontSize === 'sm'
              ? 'text-xs sm:text-sm font-bold'
              : scheduleForm.marqueeFontSize === 'lg'
              ? 'text-base sm:text-lg font-black'
              : scheduleForm.marqueeFontSize === 'xl'
              ? 'text-lg sm:text-xl font-black'
              : 'text-sm sm:text-base font-extrabold';

            const badgeIcon = scheduleForm.marqueeBadgeIcon || '';
            const badgeText = scheduleForm.marqueeBadgeText || (marqueePreviewSession === 'exit' ? 'SESI PULANG' : 'PENGUMUMAN');
            
            const mainText = marqueePreviewSession === 'exit'
              ? (scheduleForm.announcementTextExit || scheduleForm.announcementText || 'Selamat Pulang Siswa-Siswi & Guru SMK EKONOMIKA DEPOK! Hati-hati di perjalanan pulang.')
              : (scheduleForm.announcementTextEntry || scheduleForm.announcementText || 'Selamat Datang di SMK EKONOMIKA DEPOK! Harap selalu melakukan Tap Kartu RFID.');

            return (
              <div className="card-container space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Pratinjau Live Banner Monitor Kiosk:</span>
                    </span>
                    {/* Preview Session Switcher */}
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-700 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setMarqueePreviewSession('entry')}
                        className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                          marqueePreviewSession === 'entry'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Sesi Masuk
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarqueePreviewSession('exit')}
                        className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                          marqueePreviewSession === 'exit'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Sesi Pulang
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700">Tema: <strong className="text-white capitalize">{themeConfig.name}</strong></span>
                    <span className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700">Mode: <strong className="text-white">{isCentered ? (isPulsing ? 'Center Pulse' : 'Center Static') : 'Marquee Scroll'}</strong></span>
                  </div>
                </div>

                {/* Banner Simulator Canvas */}
                <div className={`${themeConfig.bgClass} border-2 ${themeConfig.borderClass} ${themeConfig.accentGlowClass} rounded-md h-14 sm:h-16 flex items-center px-4 overflow-hidden shadow-sm w-full relative transition-all duration-300`}>
                  
                  {/* Badge */}
                  <div className={`flex items-center gap-1.5 ${themeConfig.badgeBgClass} px-3.5 py-1.5 rounded text-xs font-black shrink-0 shadow-sm z-10 mr-3 select-none`}>
                    {badgeIcon && <span className="text-sm leading-none">{badgeIcon}</span>}
                    <span className={`uppercase tracking-wider text-[11px] sm:text-xs ${themeConfig.badgeTextClass} font-black`}>
                      {badgeText}
                    </span>
                  </div>

                  {/* Mode Content */}
                  {isCentered ? (
                    <div className="flex-1 flex items-center justify-center text-center overflow-hidden px-2">
                      <div className={`flex items-center justify-center gap-2 max-w-full ${isPulsing ? 'animate-pulse-glow' : ''}`}>
                        <span className={`${fontSizeClass} ${themeConfig.textClass} uppercase tracking-wide truncate block`}>
                          {mainText}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden whitespace-nowrap flex-1 flex items-center">
                      <div className={`${speedClass} gap-12 flex items-center`}>
                        <span className={`shrink-0 ${fontSizeClass} ${themeConfig.textClass} uppercase tracking-wide`}>
                          {mainText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                        </span>
                        <span className={`shrink-0 ${fontSizeClass} ${themeConfig.textClass} uppercase tracking-wide`}>
                          {mainText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Live Status Indicator */}
                  <div className="hidden sm:flex items-center gap-1.5 ml-3 shrink-0 z-10">
                    <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400" />
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider">LIVE</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. KOLEKSI VARIASI KATA-KATA HARI RAYA & HARI SPESIAL (1-CLICK PRESET) */}
          <div className="card-container space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Koleksi Kata-Kata Hari Raya & Acara Spesial Sekolah</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pilih salah satu ucapan di bawah ini untuk langsung memuat teks, ikon, mode posisi, dan tema warna yang serasi.
                </p>
              </div>

              {/* Search Presets */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari hari raya / momen..."
                  value={holidaySearchQuery}
                  onChange={(e) => setHolidaySearchQuery(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {HOLIDAY_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedHolidayCategory(cat.id)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedHolidayCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-900/70 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                  }`}
                >
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Preset Cards Grid */}
            {(() => {
              const filteredPresets = HOLIDAY_GREETINGS_PRESETS.filter(p => {
                const matchesCat = selectedHolidayCategory === 'all' || p.category === selectedHolidayCategory;
                const query = holidaySearchQuery.toLowerCase().trim();
                const matchesSearch = !query || 
                  p.title.toLowerCase().includes(query) ||
                  p.mainText.toLowerCase().includes(query) ||
                  p.categoryLabel.toLowerCase().includes(query) ||
                  p.description.toLowerCase().includes(query);
                return matchesCat && matchesSearch;
              });

              if (filteredPresets.length === 0) {
                return (
                  <div className="card-container-compact p-8 text-center text-slate-400 text-xs">
                    Tidak ditemukan ucapan untuk kata kunci "{holidaySearchQuery}".
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 max-h-[500px] overflow-y-auto pr-1 no-scrollbar w-full">
                  {filteredPresets.map(preset => {
                    const theme = MARQUEE_THEMES_CONFIG[preset.theme] || MARQUEE_THEMES_CONFIG.gold;
                    const isCenterMode = preset.displayMode === 'center_pulse' || preset.displayMode === 'center_static';
                    
                    return (
                      <div
                        key={preset.id}
                        className="card-container-compact hover:border-emerald-500/60 p-4 flex flex-col justify-between gap-3 transition-all group min-w-0 overflow-hidden"
                      >
                        <div className="space-y-2 min-w-0">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-1.5 font-bold text-white text-xs min-w-0 flex-1">
                              <span className="truncate">{preset.title}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase shrink-0 whitespace-nowrap ${theme.badgeBgClass} ${theme.badgeTextClass}`}>
                              {theme.shortName || theme.name}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-300 font-sans leading-relaxed line-clamp-3 bg-slate-950/60 p-2.5 rounded border border-slate-800 break-words">
                            "{preset.mainText}"
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                            <span className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 truncate max-w-full">
                              {isCenterMode ? 'Teks Tengah' : 'Marquee Meluncur'}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 truncate max-w-full">
                              Badge: {preset.badgeText}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplyHolidayPreset(preset)}
                          className="w-full py-2 bg-slate-800 hover:bg-emerald-600 text-emerald-300 hover:text-white font-bold text-xs rounded border border-emerald-500/40 hover:border-emerald-500 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs mt-1"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>Terapkan Ucapan Ini</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* 3. PENGATURAN KUSTOMISASI DETAIL (STYLE, POSISI, SPEED & FONT) */}
          <div className="card-container space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Kustomisasi Gaya Tampilan, Posisi & Format Running Text</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Sesuaikan posisi teks (tengah / berjalan), palet tema warna, kecepatan gerak, dan badge info.
              </p>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-6">
              
              {/* OPSI 1: MODE TAMPILAN POSISI */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                  1. Mode Posisi & Animasi Teks
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, marqueeDisplayMode: 'center_pulse' })}
                    className={`p-3.5 rounded border text-left transition-all cursor-pointer ${
                      (scheduleForm.marqueeDisplayMode || 'marquee_scroll') === 'center_pulse'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-xs'
                        : 'bg-slate-900/70 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-400">
                      <AlignCenter className="w-4 h-4" />
                      <span>Tengah Bercahaya (Pulse Glow)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Teks berada persis di <strong>tengah (Center)</strong> dengan efek nafas bercahaya lembut. Sangat pas untuk ucapan hari raya khidmat.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, marqueeDisplayMode: 'center_static' })}
                    className={`p-3.5 rounded border text-left transition-all cursor-pointer ${
                      scheduleForm.marqueeDisplayMode === 'center_static'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-900/70 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-300">
                      <AlignCenter className="w-4 h-4" />
                      <span>Tengah Statis (Center Clean)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Teks di posisi <strong>tengah</strong> tanpa animasi bergulir. Tampilan bersih, mantap, dan mudah dibaca dari kejauhan.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, marqueeDisplayMode: 'marquee_scroll' })}
                    className={`p-3.5 rounded border text-left transition-all cursor-pointer ${
                      (scheduleForm.marqueeDisplayMode || 'marquee_scroll') === 'marquee_scroll'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-900/70 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-400">
                      <AlignLeft className="w-4 h-4" />
                      <span>Marquee Meluncur (Scrolling)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Teks bergerak meluncur tanpa henti dari kanan ke kiri. Ideal untuk pengumuman panjang sekolah & tata tertib.
                    </p>
                  </button>

                </div>
              </div>

              {/* OPSI 2: PILIHAN TEMA WARNA (6 TEMA EKSKLUSIF) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Pilihan Palet Tema Warna Banner</span>
                </label>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {(Object.keys(MARQUEE_THEMES_CONFIG) as Array<keyof typeof MARQUEE_THEMES_CONFIG>).map(themeKey => {
                    const theme = MARQUEE_THEMES_CONFIG[themeKey];
                    const isSelected = (scheduleForm.marqueeTheme || 'gold') === themeKey;
                    return (
                      <button
                        key={themeKey}
                        type="button"
                        onClick={() => setScheduleForm({ ...scheduleForm, marqueeTheme: themeKey })}
                        className={`p-3 rounded border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between h-22 ${
                          isSelected
                            ? 'ring-2 ring-emerald-400 border-emerald-400 shadow-sm bg-slate-900'
                            : 'border-slate-700/70 bg-slate-900/70 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white capitalize">{theme.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        
                        {/* Mini Color Strip */}
                        <div className={`h-4 w-full rounded ${theme.bgClass} border ${theme.borderClass} flex items-center px-1.5`}>
                          <span className={`w-2 h-2 rounded-full ${theme.badgeBgClass}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* OPSI 3: KECEPATAN MARQUEE & UKURAN HURUF */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Kecepatan */}
                <div className="card-container-compact space-y-2">
                  <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Kecepatan Animasi Marquee</span>
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'slow', label: 'Lambat (38s)' },
                      { id: 'normal', label: 'Standar (24s)' },
                      { id: 'fast', label: 'Cepat (16s)' },
                      { id: 'ultra_fast', label: 'Kilat (10s)' }
                    ].map(spd => (                      <button
                        key={spd.id}
                        type="button"
                        onClick={() => setScheduleForm({ ...scheduleForm, marqueeSpeed: spd.id as any })}
                        className={`p-2 rounded text-center border text-[11px] font-bold transition-all cursor-pointer ${
                          (scheduleForm.marqueeSpeed || 'normal') === spd.id
                            ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <div className="text-[10px] font-bold">{spd.label}</div>
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Hanya berlaku saat mode Marquee Meluncur aktif.
                  </span>
                </div>

                {/* Ukuran Font */}
                <div className="card-container-compact space-y-2">
                  <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ukuran Huruf Teks Utama</span>
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'sm', label: 'Sedang (SM)' },
                      { id: 'base', label: 'Standar (MD)' },
                      { id: 'lg', label: 'Besar (LG)' },
                      { id: 'xl', label: 'Ekstra (XL)' }
                    ].map(fnt => (
                      <button
                        key={fnt.id}
                        type="button"
                        onClick={() => setScheduleForm({ ...scheduleForm, marqueeFontSize: fnt.id as any })}
                        className={`p-2 rounded text-center border text-[11px] font-bold transition-all cursor-pointer ${
                          (scheduleForm.marqueeFontSize || 'lg') === fnt.id
                            ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <div className="text-[10px] font-bold">{fnt.label}</div>
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Pilih ukuran huruf agar proporsional dengan panjang kalimat Anda.
                  </span>
                </div>

              </div>

              {/* OPSI 4: BADGE ICON & BADGE TEXT */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Badge Icon / Tag */}
                <div className="card-container-compact space-y-2.5">
                  <label className="block text-xs font-bold text-slate-200">
                    Pilih Kategori Badge
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['PENGUMUMAN', 'INFORMASI', 'AGENDA', 'DISIPLIN', 'PERINGATAN', 'HARI BESAR'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setScheduleForm({ ...scheduleForm, marqueeBadgeIcon: tag })}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                          scheduleForm.marqueeBadgeIcon === tag
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Badge Text */}
                <div className="card-container-compact space-y-2.5">
                  <label className="block text-xs font-bold text-slate-200">
                    Teks Label Badge
                  </label>
                  <input
                    type="text"
                    value={scheduleForm.marqueeBadgeText || 'PENGUMUMAN'}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, marqueeBadgeText: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold uppercase"
                    placeholder="Contoh: PENGUMUMAN, HARI RAYA..."
                  />
                  <div className="flex flex-wrap gap-1">
                    {['PENGUMUMAN', 'INFO TERKINI', 'HARI RAYA', 'HUT RI', 'UJIAN', 'DISIPLIN 5S'].map(quickBadge => (
                      <button
                        key={quickBadge}
                        type="button"
                        onClick={() => setScheduleForm({ ...scheduleForm, marqueeBadgeText: quickBadge })}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300 font-bold cursor-pointer"
                      >
                        {quickBadge}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* OPSI 5: EDIT ISI TEKS BERJALAN SESI MASUK & SESI PULANG */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                      5. Isi Kalimat Running Text (Sesi Masuk & Sesi Pulang)
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Tentukan pesan yang tampil di layar saat jam kedatangan pagi vs saat jam kepulangan siang/sore.
                    </p>
                  </div>

                  {/* Switcher Edit Tab */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setMarqueeActiveEditTab('entry')}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        marqueeActiveEditTab === 'entry'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Sesi Masuk</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarqueeActiveEditTab('exit')}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        marqueeActiveEditTab === 'exit'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Sesi Pulang</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarqueeActiveEditTab('all')}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        marqueeActiveEditTab === 'all'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Umum / Cadangan</span>
                    </button>
                  </div>
                </div>

                {/* 1. Teks Sesi Masuk */}
                {(marqueeActiveEditTab === 'entry' || marqueeActiveEditTab === 'all') && (
                  <div className="card-container border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <span>Teks Berjalan Sesi Masuk (Pagi)</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, announcementTextEntry: (scheduleForm.announcementTextEntry || scheduleForm.announcementText || '').toUpperCase() })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-emerald-300 font-bold cursor-pointer"
                        >
                          HURUF BESAR
                        </button>
                        <button
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, announcementTextEntry: `${scheduleForm.announcementTextEntry || scheduleForm.announcementText || ''} • ` })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-amber-300 font-bold cursor-pointer"
                        >
                          + Titik (•)
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={scheduleForm.announcementTextEntry ?? scheduleForm.announcementText}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, announcementTextEntry: e.target.value })}
                      className="w-full bg-slate-900 border border-emerald-500/40 rounded p-3 text-xs text-white focus:outline-none focus:border-emerald-400 font-sans shadow-inner"
                      placeholder="Tuliskan ucapan selamat pagi dan instruksi tap kartu saat siswa/guru datang..."
                      required
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Panjang Teks Masuk: <strong className="font-mono tabular-nums">{(scheduleForm.announcementTextEntry ?? scheduleForm.announcementText)?.length || 0}</strong> karakter</span>
                      <span className="text-emerald-400 font-semibold font-mono tabular-nums">Tampil pada jam {scheduleForm.entryStartTime} - {scheduleForm.exitStartTime} WIB</span>
                    </div>
                  </div>
                )}

                {/* 2. Teks Sesi Pulang */}
                {(marqueeActiveEditTab === 'exit' || marqueeActiveEditTab === 'all') && (
                  <div className="card-container border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                        <span>Teks Berjalan Sesi Pulang (Siang / Sore)</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, announcementTextExit: (scheduleForm.announcementTextExit || scheduleForm.announcementText || '').toUpperCase() })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-blue-300 font-bold cursor-pointer"
                        >
                          HURUF BESAR
                        </button>
                        <button
                          type="button"
                          onClick={() => setScheduleForm({ ...scheduleForm, announcementTextExit: `${scheduleForm.announcementTextExit || scheduleForm.announcementText || ''} • ` })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-amber-300 font-bold cursor-pointer"
                        >
                          + Titik (•)
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={scheduleForm.announcementTextExit ?? scheduleForm.announcementText}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, announcementTextExit: e.target.value })}
                      className="w-full bg-slate-900 border border-blue-500/40 rounded p-3 text-xs text-white focus:outline-none focus:border-blue-400 font-sans shadow-inner"
                      placeholder="Tuliskan ucapan selamat jalan / hati-hati di perjalanan saat kepulangan..."
                      required
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Panjang Teks Pulang: <strong className="font-mono tabular-nums">{(scheduleForm.announcementTextExit ?? scheduleForm.announcementText)?.length || 0}</strong> karakter</span>
                      <span className="text-blue-400 font-semibold font-mono tabular-nums">Tampil pada jam {scheduleForm.exitStartTime} - {scheduleForm.exitEndTime || '17:00'} WIB</span>
                    </div>
                  </div>
                )}

                {/* 3. Teks Cadangan / Fallback Umum */}
                {marqueeActiveEditTab === 'all' && (
                  <div className="card-container space-y-2">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <span>Teks Pengumuman Cadangan (Fallback General)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={scheduleForm.announcementText}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, announcementText: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-sans shadow-inner"
                      placeholder="Teks umum default jika teks sesi masuk atau pulang kosong..."
                    />
                  </div>
                )}
              </div>

              {/* SAVE BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="btn-primary-sharp px-8 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2.5 w-full sm:w-auto"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan & Siarkan Realtime Ke Semua Layar Monitor</span>
                </button>
              </div>
            </form>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: PENGATURAN - SIMULATOR & DEBUGGING RFID */}
      {/* ========================================================================= */}
      {activeTab === 'rfid_simulator' && (
        <div className="space-y-6 w-full">
          {/* Header Card */}
          <div className="card-container flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                  <Radio className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-bold text-white">
                  Simulator & Debugging RFID Kiosk
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
                Uji coba tap kartu secara virtual, buka/tutup kunci gerbang manual override untuk testing, dan tinjau modal visual kartu yang tampil sebelum digunakan di Kiosk fisik.
              </p>
            </div>
            <div>
              {scheduleForm.manualGateOverride ? (
                <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 rounded-sm text-amber-300 text-xs font-bold font-mono">
                  <span className="w-1.5 h-1.5 rounded-xs bg-amber-400" />
                  <span>OVERRIDE AKTIF: BEBAS TAP 24/7</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-sm text-emerald-300 text-xs font-bold font-mono">
                  <span className="w-1.5 h-1.5 rounded-xs bg-emerald-400" />
                  <span>STATUS NORMAL: SESUAI JADWAL</span>
                </div>
              )}
            </div>
          </div>

          {/* 1. KONTROL MANUAL OVERRIDE GERBANG */}
          <div className="card-container border-amber-500/30 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-amber-400" />
                  <span>Buka Kunci Sesi Gerbang (Manual Override Uji Coba)</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  Di luar jam operasional (lewat batas jam tap pulang), monitor Kiosk beralih ke layar Standby jam digital & pengumuman sekolah tanpa tombol tap kartu. Aktifkan opsi ini untuk mengabaikan batasan jam agar kartu RFID fisik atau simulator dapat diuji coba kapan saja.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleManualGateOverride}
                className={`px-4 py-2.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 shadow-lg ${
                  scheduleForm.manualGateOverride
                    ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400'
                    : 'bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500'
                }`}
              >
                {scheduleForm.manualGateOverride ? (
                  <>
                    <Lock className="w-4 h-4 text-white" />
                    <span>Kunci Kembali (Ikuti Jadwal Normal)</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 text-emerald-400" />
                    <span>Buka Kunci Sesi Gerbang Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 2. FORM SIMULATOR TAP KARTU */}
          <div className="card-container space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>Panel Eksekusi Uji Coba Tap Kartu</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pilih siswa dari database atau masukkan nomor UID kartu untuk menguji validasi kehadiran, perhitungan keterlambatan, dan melihat pop-up hasil yang muncul di Kiosk.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Target Siswa */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  Pilih Siswa Terdaftar:
                </label>
                <select
                  value={simulatorSelectedStudentId}
                  onChange={(e) => {
                    setSimulatorSelectedStudentId(e.target.value);
                    if (e.target.value) {
                      const std = students.find(s => s.id === e.target.value);
                      if (std?.rfidUid) setSimulatorManualUid(std.rfidUid);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Atau Input Manual UID Di Bawah --</option>
                  {students.map(std => (
                    <option key={std.id} value={std.id}>
                      {std.name} ({std.class}) - UID: {std.rfidUid || 'Belum Terdaftar'}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 block">
                  Memilih siswa akan otomatis menyalin nomor UID RFID miliknya.
                </span>
              </div>

              {/* Manual UID Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  Nomor UID Kartu RFID (Hex / Dec):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={simulatorManualUid}
                    onChange={(e) => {
                      setSimulatorManualUid(e.target.value);
                      setSimulatorSelectedStudentId('');
                    }}
                    placeholder="Contoh: 0014283941 atau A1B2C3D4"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const registered = students.find(s => s.rfidUid);
                      if (registered) {
                        setSimulatorSelectedStudentId(registered.id);
                        setSimulatorManualUid(registered.rfidUid);
                      } else {
                        setSimulatorManualUid('0014283941');
                      }
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-emerald-300 font-bold cursor-pointer"
                  >
                    Sampel Siswa Terdaftar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSimulatorSelectedStudentId('');
                      setSimulatorManualUid('9999999999');
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-rose-300 font-bold cursor-pointer"
                  >
                    Sampel Kartu Baru (Non-Reg)
                  </button>
                </div>
              </div>

              {/* Lokasi Gerbang */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  Lokasi Gerbang Kiosk:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSimulatorGate('pintu_depan')}
                    className={`p-2.5 rounded text-center border text-xs font-bold transition-all cursor-pointer ${
                      simulatorGate === 'pintu_depan'
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Pintu Depan
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatorGate('pintu_belakang')}
                    className={`p-2.5 rounded text-center border text-xs font-bold transition-all cursor-pointer ${
                      simulatorGate === 'pintu_belakang'
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Pintu Belakang
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Simulasikan perangkat scanner RFID yang menerima sinyal kartu.
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-start">
              <button
                type="button"
                onClick={handleExecuteSimulatedTap}
                className="btn-primary-sharp px-6 py-3 text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Radio className="w-4 h-4 text-emerald-200 animate-pulse" />
                <span>Eksekusi Tap Kartu & Tinjau Modal Hasil</span>
              </button>
            </div>
          </div>

          {/* 3. LOG HASIL SIMULASI SESI INI */}
          <div className="card-container space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>Log Riwayat Uji Coba Tap ({simulatorLogs.length} Catatan)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Daftar eksekusi pengujian tap kartu RFID yang telah dicoba pada sesi admin saat ini.
                </p>
              </div>
              {simulatorLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSimulatorLogs([])}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs font-bold cursor-pointer"
                >
                  Bersihkan Log
                </button>
              )}
            </div>

            <div className="table-container-sharp overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">UID Kartu</th>
                    <th className="py-2.5 px-3">Nama Target</th>
                    <th className="py-2.5 px-3">Peran</th>
                    <th className="py-2.5 px-3">Gerbang</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Respon Sistem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-medium">
                  {simulatorLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Belum ada pengujian tap kartu. Pilih siswa atau masukkan nomor UID di atas lalu klik &ldquo;Eksekusi Tap Kartu&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    simulatorLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                          {log.timestamp} WIB
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400 whitespace-nowrap">
                          {log.uid}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                          {log.name}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                            {log.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                          {log.gate}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`badge-sharp font-bold ${
                            log.success
                              ? log.status === 'TERLAMBAT'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-xs truncate">
                          {log.reason || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: BACKUP & DATABASE CLOUD (MULTI-DEVICE FIRESTORE PERSISTENCE) */}
      {/* ========================================================================= */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Cloud Database Status Card */}
          <div className="card-container border-emerald-500/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white">Database Cloud Real-Time (Firestore)</h3>
                    <span className="px-2 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold rounded-sm flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400" />
                      AKTIF & TERHUBUNG
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Data tidak lagi hanya tersimpan di browser lokal. Seluruh perangkat dapat membaca dan menulis data secara bersamaan.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOfflineModalOpen(true)}
                  className={`px-3.5 py-2 rounded text-xs font-bold border flex items-center gap-2 cursor-pointer transition-colors ${
                    offlinePendingCount > 0
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 ring-1 ring-amber-400/50'
                      : 'bg-slate-900 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto-Save Offline</span>
                  {offlinePendingCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black font-mono tabular-nums">
                      {offlinePendingCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={refreshAllData}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold border border-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sinkronisasi Ulang</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="card-container-compact p-3">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Akses Multi-Perangkat</span>
                <strong className="text-emerald-300 font-bold block mt-0.5">Laptop, Tablet, HP & Kiosk</strong>
                <p className="text-[10px] text-slate-500 mt-1">Data sinkron realtime saat kartu di-tap</p>
              </div>
              <div className="card-container-compact p-3">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Penyimpanan Terpusat</span>
                <strong className="text-emerald-400 font-bold block mt-0.5 font-mono tabular-nums">{students.length} Siswa • {classes.length} Kelas</strong>
                <p className="text-[10px] text-slate-500 mt-1">Tersimpan aman di Google Cloud Firestore</p>
              </div>
              <div className="card-container-compact p-3">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Offline Resilience</span>
                <strong className="text-blue-300 font-bold block mt-0.5">Cache Lokal Otomatis</strong>
                <p className="text-[10px] text-slate-500 mt-1">Kiosk tetap bisa tap jika koneksi internet terputus</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Download Backup Section */}
            <div className="card-container space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-white">Cadangkan Database (Backup JSON)</h4>
                    <p className="text-[11px] text-slate-400">Unduh seluruh snapshot database ke komputer/laptop</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Fitur ini akan menghasilkan berkas cadangan terenkripsi berformat <code className="text-emerald-300 font-mono">.json</code> yang berisi seluruh data siswa, NISN, UID kartu RFID, daftar kelas, jadwal sekolah, dan seluruh riwayat absensi.
                </p>

                <div className="card-container-compact p-3 space-y-1.5 text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ringkasan Data yang Akan Dicadangkan:</span>
                  <div className="grid grid-cols-3 gap-2 font-mono pt-1">
                    <div className="card-container-compact p-2 text-center">
                      <span className="text-[10px] text-slate-400 block">Siswa</span>
                      <strong className="text-sm text-emerald-400 font-mono tabular-nums">{students.length}</strong>
                    </div>
                    <div className="card-container-compact p-2 text-center">
                      <span className="text-[10px] text-slate-400 block">Kelas</span>
                      <strong className="text-sm text-emerald-400 font-mono tabular-nums">{classes.length}</strong>
                    </div>
                    <div className="card-container-compact p-2 text-center">
                      <span className="text-[10px] text-slate-400 block">Log Absen</span>
                      <strong className="text-sm text-amber-400 font-mono tabular-nums">{attendanceRecords.length}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  AttendanceStorage.downloadBackupFile();
                  showToast('Berkas cadangan database berhasil diunduh!');
                }}
                className="btn-primary-sharp w-full py-3 text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Unduh File Cadangan Database (.JSON)</span>
              </button>
            </div>

            {/* Restore Database Section */}
            <div className="card-container space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-white">Pulihkan Database (Restore JSON)</h4>
                    <p className="text-[11px] text-slate-400">Unggah berkas cadangan untuk memulihkan seluruh data</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Pilih file cadangan <code className="text-amber-300 font-mono">.json</code> yang sebelumnya pernah Anda unduh. Sistem akan memvalidasi struktur data dan memperbarui database Cloud serta perangkat lokal.
                </p>

                {/* Upload File Input */}
                <div className="card-container-compact p-4 border-2 border-dashed border-slate-700 hover:border-emerald-500/60 text-center space-y-2 transition-colors">
                  <input
                    type="file"
                    id="restore-file-input"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (loadEvt) => {
                        try {
                          const parsed = JSON.parse(loadEvt.target?.result as string);
                          if (!parsed || !parsed.data || !Array.isArray(parsed.data.students)) {
                            alert('Format file cadangan tidak valid!');
                            return;
                          }
                          setRestorePreview(parsed);
                        } catch (err) {
                          alert('Gagal membaca file JSON: Format rusak!');
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                  <label
                    htmlFor="restore-file-input"
                    className="flex flex-col items-center justify-center cursor-pointer py-1"
                  >
                    <Upload className="w-7 h-7 text-slate-400 mb-1.5" />
                    <span className="text-xs font-bold text-white">Pilih File Cadangan (.JSON)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">atau seret file ke area ini</span>
                  </label>
                </div>

                {/* Preview Box if file selected */}
                {restorePreview && (
                  <div className="card-container-compact border-emerald-500/40 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-emerald-300">
                      <span className="font-bold uppercase text-[10px]">Ringkasan File Cadangan:</span>
                      <button
                        onClick={() => setRestorePreview(null)}
                        className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-300 space-y-1">
                      <p><strong>Sekolah:</strong> {restorePreview.schoolName || restorePreview.data?.schedule?.schoolName || '-'}</p>
                      <p><strong>Waktu Ekspor:</strong> {new Date(restorePreview.exportDate).toLocaleString('id-ID')}</p>
                      <p><strong>Isi Data:</strong> <span className="font-mono tabular-nums">{restorePreview.data?.students?.length || 0}</span> Siswa, <span className="font-mono tabular-nums">{restorePreview.data?.classes?.length || 0}</span> Kelas, <span className="font-mono tabular-nums">{restorePreview.data?.attendanceRecords?.length || 0}</span> Log Absensi</p>
                    </div>
                  </div>
                )}
              </div>

              {restorePreview ? (
                <button
                  disabled={isRestoring}
                  onClick={async () => {
                    if (!confirm(`Konfirmasi: Pulihkan database sekarang? Seluruh data (${restorePreview.data?.students?.length || 0} siswa) akan dimuat ke Cloud Firestore.`)) {
                      return;
                    }
                    setIsRestoring(true);
                    const res = await AttendanceStorage.restoreBackupData(restorePreview);
                    setIsRestoring(false);
                    if (res.success) {
                      setRestorePreview(null);
                      refreshAllData();
                      showToast(res.message);
                    } else {
                      alert(res.message);
                    }
                  }}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs rounded shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
                  <span>{isRestoring ? 'Memulihkan Data ke Cloud...' : 'Konfirmasi & Pulihkan Database'}</span>
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-3 bg-slate-800 text-slate-500 font-extrabold text-xs rounded flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Pilih File Terlebih Dahulu</span>
                </button>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: KELOLA AKUN PENGGUNA SISTEM & HAK AKSES (CRUD SYSTEM USERS) */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <UserManagement
          showToast={showToast}
          currentUsername={currentUser?.username}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB: ARSIP AKADEMIK & ALUMNI LULUS (TAHUN AJARAN ROLLOVER & REKAP TAHUNAN) */}
      {/* ========================================================================= */}
      {activeTab === 'alumni_archive' && (
        <ErrorBoundary fallbackTitle="Arsip Akademik Belum Dapat Ditampilkan">
          <AlumniArchiveManagement
            showToast={showToast}
            onOpenRolloverModal={() => setIsAcademicRolloverModalOpen(true)}
          />
        </ErrorBoundary>
      )}

      {/* ========================================================================= */}
      {/* TAB: REKAP MATRIKS BULANAN PER KELAS (BLANGKO ABSENSI TANGGAL 1 - 31)    */}
      {/* ========================================================================= */}
      {activeTab === 'monthly_matrix' && (
        <ErrorBoundary fallbackTitle="Rekap Matriks Bulanan Belum Dapat Ditampilkan">
          <StudentMonthlyMatrixReport
            students={students}
            records={attendanceRecords}
            classes={classes}
            schedule={schedule}
          />
        </ErrorBoundary>
      )}

      {/* ========================================================================= */}
      {/* TAB: URUTAN & PERINGKAT GURU / KARYAWAN (TOP TERPAGI & TERLAMBAT)       */}
      {/* ========================================================================= */}
      {activeTab === 'teacher_leaderboard' && (
        <ErrorBoundary fallbackTitle="Peringkat Guru Belum Dapat Ditampilkan">
          <TeacherLeaderboard
            teachers={teachers}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
          />
        </ErrorBoundary>
      )}

      {/* ========================================================================= */}
      {/* STUDENT ADD/EDIT MODAL (NISN RESTORED, NIS & PARENT PHONE REMOVED) */}
      {/* ========================================================================= */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="modal-dialog-container max-w-lg w-full space-y-4">
            <h3 className="text-base font-bold text-white tracking-tight">
              {editingStudent ? 'Edit Biodata & Kartu Siswa' : 'Tambah Siswa Baru'}
            </h3>
            <form onSubmit={handleSaveStudent} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nama Lengkap Siswa *</label>
                <input
                  type="text"
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Ahmad Rizky Pratama"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">NIS (Nomor Induk)</label>
                  <input
                    type="text"
                    value={studentForm.nis}
                    onChange={(e) => setStudentForm({ ...studentForm, nis: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. 26270115"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">NISN (Nasional)</label>
                  <input
                    type="text"
                    value={studentForm.nisn}
                    onChange={(e) => setStudentForm({ ...studentForm, nisn: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. 0068492011"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-300">Kelas *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setAddClassMode('single');
                        setIsAddClassModalOpen(true);
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold"
                    >
                      + Tambah Kelas
                    </button>
                  </div>
                  <select
                    value={studentForm.class}
                    onChange={(e) => setStudentForm({ ...studentForm, class: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                    required
                  >
                    {uniqueClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Jenis Kelamin</label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value as 'L' | 'P' })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-400 mb-1">RFID Tag UID *</label>
                  <input
                    type="text"
                    value={studentForm.rfidUid}
                    onChange={(e) => setStudentForm({ ...studentForm, rfidUid: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. 0008451293 atau A34F221C"
                    required
                  />
                </div>
              </div>

              {/* FOTO PROFIL SECTION WITH FILE UPLOAD & PREVIEW */}
              <div className="card-container-compact space-y-3">
                <label className="block text-xs font-bold text-slate-300">Foto Profil Siswa (Pasfoto 3x4)</label>
                
                <div className="flex items-center gap-4">
                  {/* Photo Preview - Pasfoto 3x4 Ratio */}
                  <div className="relative group shrink-0">
                    <UserAvatar
                      name={studentForm.name || 'Siswa'}
                      avatarUrl={studentForm.avatarUrl}
                      gender={studentForm.gender}
                      role="SISWA"
                      size="lg"
                      shape="passport"
                    />
                    {studentForm.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setStudentForm({ ...studentForm, avatarUrl: '' })}
                        className="absolute -top-1.5 -right-1.5 p-1 bg-rose-600 hover:bg-rose-500 text-white rounded shadow transition-colors cursor-pointer"
                        title="Hapus foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Upload Actions */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded border border-slate-700 cursor-pointer transition-all">
                        <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Upload File Foto (JPG/PNG)</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressedBase64 = await processAndCompressImage(file, 256, 256, 0.82);
                                setStudentForm(prev => ({ ...prev, avatarUrl: compressedBase64 }));
                                showToast('Foto siswa berhasil diunggah & siap disimpan ke database!');
                              } catch (err: any) {
                                alert(err.message || 'Gagal memproses file foto');
                              }
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* URL Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={studentForm.avatarUrl}
                        onChange={(e) => setStudentForm({ ...studentForm, avatarUrl: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                        placeholder="Atau tempel URL foto lokal/CDN (https://...)"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Avatar Presets */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
                  <span>Format Pasfoto:</span>
                  <span className="font-mono text-slate-300">Rasio 3:4 Resmi</span>
                  <span className="text-slate-600">/</span>
                  <button
                    type="button"
                    onClick={() => setStudentForm({ ...studentForm, avatarUrl: '' })}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] cursor-pointer"
                  >
                    Gunakan Monogram Inisial
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="btn-secondary-sharp"
                >
                  Batal
                </button>
                
                <button
                  type="submit"
                  className="btn-primary-sharp"
                >
                  Simpan Siswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TAMBAH KELAS (SATUAN / MASSAL) */}
      {/* ========================================================================= */}
      {isAddClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="modal-dialog-container max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Tambah Data Kelas Baru</h3>
                  <p className="text-[11px] text-slate-400">Pilih metode input satuan atau sekaligus banyak (massal)</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddClassModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => setAddClassMode('single')}
                className={`py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer ${
                  addClassMode === 'single'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                + Tambah 1 Kelas
              </button>
              <button
                type="button"
                onClick={() => setAddClassMode('batch')}
                className={`py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer ${
                  addClassMode === 'batch'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                + Tambah Banyak (Massal)
              </button>
            </div>

            {addClassMode === 'single' ? (
              <form onSubmit={handleAddSingleClass} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Kelas *
                  </label>
                  <input
                    type="text"
                    value={singleClassName}
                    onChange={(e) => setSingleClassName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold input-control-sharp"
                    placeholder="Contoh: X RPL 1, XI MIPA 2, XII OTKP 3"
                    autoFocus
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Format disarankan: [Tingkat] [Jurusan] [Nomor], contoh: <span className="text-emerald-400 font-mono">X RPL 1</span>
                  </p>
                </div>

                {/* Quick chip suggestions */}
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400">Contoh format cepat:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['X RPL 1', 'XI TKJ 1', 'XII OTKP 1', 'X MIPA 1', 'XI IPS 2'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setSingleClassName(chip)}
                        className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px] font-mono cursor-pointer transition-colors"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddClassModalOpen(false)}
                    className="btn-secondary-sharp text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-sharp text-xs shadow-sm cursor-pointer"
                  >
                    Simpan Kelas
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddBatchClasses} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Daftar Nama Kelas (Pisahkan dengan Baris Baru atau Koma) *
                  </label>
                  <textarea
                    rows={6}
                    value={batchClassInput}
                    onChange={(e) => setBatchClassInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                    placeholder={`X RPL 1\nX RPL 2\nXI TKJ 1\nXI TKJ 2\nXII AKL 1\nXII AKL 2`}
                    autoFocus
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Anda dapat menyalin daftar nama kelas langsung dari Excel, Google Sheets, atau notepad.
                  </p>
                </div>

                {/* Preset Fast Buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400">Template Cepat:</span>
                  <button
                    type="button"
                    onClick={() => setBatchClassInput(`X RPL 1\nX RPL 2\nX TKJ 1\nX TKJ 2\nXI RPL 1\nXI RPL 2\nXI TKJ 1\nXI TKJ 2\nXII RPL 1\nXII RPL 2\nXII TKJ 1\nXII TKJ 2`)}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Template SMK (RPL/TKJ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchClassInput(`X MIPA 1\nX MIPA 2\nX IPS 1\nX IPS 2\nXI MIPA 1\nXI MIPA 2\nXI IPS 1\nXI IPS 2\nXII MIPA 1\nXII MIPA 2\nXII IPS 1\nXII IPS 2`)}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Template SMA (MIPA/IPS)
                  </button>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddClassModalOpen(false)}
                    className="btn-secondary-sharp text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-sharp text-xs shadow-sm cursor-pointer"
                  >
                    Tambah Semua Kelas
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BULK DELETE KELAS */}
      {/* ========================================================================= */}
      {isBulkDeleteClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="modal-dialog-container border-rose-500/40 max-w-lg w-full space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Konfirmasi Hapus Massal Kelas</h3>
                <p className="text-xs text-slate-400">Tindakan ini akan menghapus {selectedClassNames.length} kelas terpilih</p>
              </div>
            </div>

            {/* List of classes to be deleted */}
            <div className="p-3 bg-slate-950 rounded border border-slate-800 max-h-40 overflow-y-auto space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Daftar Kelas yang akan dihapus:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedClassNames.map((cls) => {
                  const studentCount = classStudentCounts[cls] || 0;
                  return (
                    <span
                      key={cls}
                      className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-200 rounded text-xs font-mono font-bold flex items-center gap-1.5"
                    >
                      <span>{cls}</span>
                      {studentCount > 0 && (
                        <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded text-[10px]">
                          {studentCount} siswa
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Warning if there are students in the classes */}
            {(() => {
              const totalAffectedStudents = selectedClassNames.reduce((acc, cls) => acc + (classStudentCounts[cls] || 0), 0);
              return (
                <div className="space-y-3">
                  {totalAffectedStudents > 0 ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs space-y-2">
                      <p className="font-bold text-amber-300 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Terdapat total {totalAffectedStudents} siswa di dalam kelas-kelas ini!</span>
                      </p>
                      <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={deleteClassWithStudents}
                          onChange={(e) => setDeleteClassWithStudents(e.target.checked)}
                          className="mt-0.5 rounded border-slate-700 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                        />
                        <span>
                          <strong>Hapus juga seluruh data siswa</strong> di kelas tersebut dari database. (Jika tidak dicentang, data siswa tetap ada namun tanpa kelas).
                        </span>
                      </label>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Seluruh kelas yang dipilih kosong (0 siswa), aman untuk dihapus.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsBulkDeleteClassModalOpen(false);
                  setDeleteClassWithStudents(false);
                }}
                className="btn-secondary-sharp text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDeleteClasses}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold shadow-lg transition-all cursor-pointer"
              >
                Ya, Hapus ({selectedClassNames.length}) Kelas Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: UBAH / RENAME NAMA KELAS */}
      {/* ========================================================================= */}
      {editingClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="modal-dialog-container max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Ubah Nama Kelas</h3>
                  <p className="text-[11px] text-slate-400">Ubah nama kelas "{editingClassModal.oldName}"</p>
                </div>
              </div>
              <button
                onClick={() => setEditingClassModal(null)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRenameClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Kelas Baru *
                </label>
                <input
                  type="text"
                  value={editingClassModal.newName}
                  onChange={(e) => setEditingClassModal({ ...editingClassModal, newName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 input-control-sharp"
                  autoFocus
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Seluruh siswa dan data absensi yang saat ini berada di kelas <span className="text-emerald-400 font-bold">{editingClassModal.oldName}</span> akan otomatis ter-update ke nama kelas baru ini.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClassModal(null)}
                  className="btn-secondary-sharp text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary-sharp text-xs shadow-sm cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: KONFIRMASI RESET ABSENSI HARI INI */}
      {/* ========================================================================= */}
      {isResetTodayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="modal-dialog-container border-rose-500/40 max-w-md w-full space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded border border-rose-500/30">
                  <RotateCcw className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Reset Absensi Hari Ini</h3>
                  <p className="text-[11px] text-rose-300/80">Konfirmasi Pembersihan Log Hari Ini</p>
                </div>
              </div>
              <button
                onClick={() => setIsResetTodayModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-rose-950/30 rounded border border-rose-500/30 text-xs text-slate-300 space-y-2">
              <p className="font-bold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                Tindakan ini akan menghapus seluruh rekaman tap masuk & pulang tanggal:
              </p>
              <div className="p-2 bg-slate-950 rounded text-center font-mono font-bold text-amber-300 text-sm border border-slate-800">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pt-1">
                <li>Cocok digunakan jika ada pengujian atau kesalahan pembacaan kartu RFID.</li>
                <li><strong className="text-emerald-400">Aman:</strong> Data master siswa, kelas, nomor RFID, dan riwayat hari sebelumnya <strong>TIDAK</strong> akan terhapus.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetTodayModalOpen(false)}
                className="btn-secondary-sharp text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetTodayAttendance}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ya, Reset Absensi Hari Ini</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MIFARE SCANNER RECOGNITION MODAL */}
      <MifareScannerModal
        isOpen={isMifareScannerOpen}
        onClose={() => setIsMifareScannerOpen(false)}
        onStudentUpdated={refreshAllData}
      />

      {/* BULK IMPORT MODAL */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={refreshAllData}
      />

      {/* MIFARE REGISTRATION GUIDE MODAL */}
      <MifareGuideModal
        isOpen={isMifareGuideOpen}
        onClose={() => setIsMifareGuideOpen(false)}
        onOpenScanner={() => setIsMifareScannerOpen(true)}
        onOpenBulkImport={() => setIsBulkImportOpen(true)}
      />

      {/* DAILY ARCHIVE RECAP & DAY ROLLOVER MODAL */}
      {activeRecapData && (
        <DayRolloverModal
          isOpen={isArchiveRecapModalOpen}
          onClose={() => setIsArchiveRecapModalOpen(false)}
          previousDate={activeRecapData.previousDate}
          newDate={activeRecapData.newDate}
          recap={activeRecapData.recap}
          onViewReports={() => setActiveTab('reports')}
        />
      )}

      {/* OFFLINE AUTO-SAVE & RESILIENCE MODAL */}
      <OfflineSyncModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
        onSyncCompleted={refreshAllData}
      />

      {/* ACADEMIC YEAR ROLLOVER & PROMOTION WIZARD MODAL */}
      <AcademicRolloverModal
        isOpen={isAcademicRolloverModalOpen}
        onClose={() => setIsAcademicRolloverModalOpen(false)}
        onRolloverSuccess={(msg) => {
          refreshAllData();
          showToast(msg);
        }}
        currentSchedule={scheduleForm}
        adminName={currentUser?.name || 'Super Administrator'}
        onNavigateToStudents={() => setActiveTab('students')}
        onNavigateToAlumni={() => setActiveTab('alumni_archive')}
      />

      {/* MODAL: DETAIL RIWAYAT ABSENSI SISWA PER PERIODE */}
      {selectedStudentPeriodicDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="modal-dialog-container max-w-3xl w-full p-5 sm:p-6 space-y-5 relative my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedStudentPeriodicDetail.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    NISN: <span className="font-mono text-amber-300 font-bold">{selectedStudentPeriodicDetail.nisn || '-'}</span> · Kelas: <span className="text-emerald-400 font-bold">{selectedStudentPeriodicDetail.className}</span> · {periodTitleLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentPeriodicDetail(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4 KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card-container-compact space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Total Hadir</span>
                <p className="text-xl font-black text-emerald-400 font-mono tabular-nums">{selectedStudentPeriodicDetail.totalPresent} Hari</p>
              </div>
              <div className="card-container-compact space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Tepat Waktu</span>
                <p className="text-xl font-black text-emerald-300 font-mono tabular-nums">{selectedStudentPeriodicDetail.onTimeCount} Hari ({selectedStudentPeriodicDetail.punctualityRate}%)</p>
              </div>
              <div className="card-container-compact space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Terlambat</span>
                <p className="text-xl font-black text-amber-400 font-mono tabular-nums">{selectedStudentPeriodicDetail.lateCount} Hari</p>
              </div>
              <div className="card-container-compact space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Total Menit Terlambat</span>
                <p className="text-xl font-black text-amber-300 font-mono tabular-nums">+{selectedStudentPeriodicDetail.totalLateMinutes} m</p>
              </div>
            </div>

            {/* Daily History Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Catatan Presensi Harian ({selectedStudentPeriodicDetail.dailyLogs.length} Catatan)
              </h4>
              <div className="table-container-sharp max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-700 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Tap Masuk</th>
                      <th className="py-2.5 px-3">Tap Pulang</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-medium">
                    {selectedStudentPeriodicDetail.dailyLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          Tidak ada catatan presensi pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      selectedStudentPeriodicDetail.dailyLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                            {formatToDDMMYYYY(log.dateFormatted)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono text-emerald-400 font-bold">
                              {log.entryTime !== '-' ? `${log.entryTime} WIB` : '-'}
                            </span>
                            {log.entryGate && log.entryGate !== '-' && (
                              <span className="text-[10px] text-slate-400 block">{log.entryGate}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono text-blue-400 font-bold">
                              {log.exitTime !== 'Belum Pulang' ? `${log.exitTime} WIB` : 'Belum Pulang'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`badge-sharp font-mono tabular-nums ${
                              log.entryStatus === 'TEPAT_WAKTU'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : log.entryStatus === 'TERLAMBAT'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {log.entryStatus === 'TEPAT_WAKTU' ? 'Tepat Waktu' : log.entryStatus === 'TERLAMBAT' ? `Terlambat +${log.lateMinutes}m` : log.entryStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[180px]">
                            {log.notes || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedStudentPeriodicDetail(null)}
                className="btn-secondary-sharp text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RFID SIMULATOR MODAL PRESENTATION */}
      {simulatedResultModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-container max-w-lg w-full space-y-5 border-2 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            {/* Header with Close */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs">
                  <Radio className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Hasil Pratinjau Modal Kiosk
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Tampilan persis seperti yang muncul pada monitor Kiosk gerbang
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSimulatedResultModal(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated Kiosk Card Display */}
            <div className={`p-6 rounded-md border-2 text-center space-y-4 shadow-lg text-white ${
              simulatedResultModal.success
                ? simulatedResultModal.record?.type === 'PULANG'
                  ? 'bg-[#07132a] border-blue-500'
                  : simulatedResultModal.status === 'TERLAMBAT'
                  ? 'bg-[#181308] border-amber-500'
                  : 'bg-[#071a14] border-emerald-500'
                : 'bg-[#1a0808] border-rose-500'
            }`}>
              {/* Avatar / Monogram */}
              <div className="flex justify-center">
                {simulatedResultModal.student?.avatarUrl || simulatedResultModal.teacher?.avatarUrl ? (
                  <img
                    src={simulatedResultModal.student?.avatarUrl || simulatedResultModal.teacher?.avatarUrl}
                    alt={simulatedResultModal.student?.name || simulatedResultModal.teacher?.name}
                    className="w-20 h-24 rounded-sm object-cover border-2 border-slate-700 shadow-md"
                  />
                ) : (
                  <div className="w-20 h-24 rounded-sm flex flex-col items-center justify-center border-2 border-slate-700 bg-[#0d1c3a] text-white shadow-md">
                    <span className="text-2xl font-black text-blue-300 font-mono tracking-wider">
                      {(simulatedResultModal.student?.name || simulatedResultModal.teacher?.name || 'ID').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest font-mono">
                      {simulatedResultModal.teacher ? 'GURU' : 'SISWA'}
                    </span>
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="inline-block">
                <span className={`px-3 py-1 rounded-sm text-xs font-black uppercase tracking-wider ${
                  simulatedResultModal.success
                    ? simulatedResultModal.record?.type === 'PULANG'
                      ? 'bg-blue-600 text-white border border-blue-500'
                      : simulatedResultModal.status === 'TERLAMBAT'
                      ? 'bg-amber-500 text-slate-950 border border-amber-400'
                      : 'bg-emerald-600 text-white border border-emerald-500'
                    : 'bg-rose-600 text-white border border-rose-500'
                }`}>
                  {simulatedResultModal.success
                    ? simulatedResultModal.record?.type === 'PULANG'
                      ? 'PRESENSI PULANG DITERIMA'
                      : simulatedResultModal.status === 'TERLAMBAT'
                      ? `TERLAMBAT (+${simulatedResultModal.lateMinutes || simulatedResultModal.record?.lateMinutes || 0}m)`
                      : 'PRESENSI TEPAT WAKTU'
                    : simulatedResultModal.reason === 'UNREGISTERED_CARD'
                    ? 'KARTU BELUM TERDAFTAR'
                    : 'PRESENSI DITOLAK'}
                </span>
              </div>

              {/* Name & Target */}
              <div>
                <h4 className="text-xl font-black text-white tracking-tight">
                  {simulatedResultModal.student?.name ||
                   simulatedResultModal.teacher?.name ||
                   (simulatedResultModal.reason === 'UNREGISTERED_CARD' ? 'Kartu RFID Anonim' : 'Presensi Tidak Sah')}
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  {simulatedResultModal.student ? (
                    <>Kelas: <strong>{simulatedResultModal.student.class}</strong> &bull; NISN: <strong className="font-mono tabular-nums">{simulatedResultModal.student.nisn}</strong></>
                  ) : simulatedResultModal.teacher ? (
                    <>Guru / PTK: <strong>{simulatedResultModal.teacher.position}</strong> &bull; NIP: <strong className="font-mono tabular-nums">{simulatedResultModal.teacher.nip}</strong></>
                  ) : (
                    <span>UID: <strong className="font-mono">{simulatedResultModal.rfidUid || '-'}</strong></span>
                  )}
                </p>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-2 text-left bg-[#070e20] p-3 rounded-sm border border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Waktu Tap Scanner</span>
                  <span className="font-mono font-bold text-white tabular-nums">{simulatedResultModal.scanTime || `${new Date().toLocaleTimeString('id-ID')} WIB`}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Lokasi Gerbang</span>
                  <span className="font-bold text-emerald-400">{simulatedResultModal.gateName || 'Pintu Depan'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Nomor UID Kartu</span>
                  <span className="font-mono text-amber-300">{simulatedResultModal.student?.rfidUid || simulatedResultModal.teacher?.rfidUid || simulatedResultModal.rfidUid || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Urutan Kedatangan</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {simulatedResultModal.arrivalRankText || (simulatedResultModal.arrivalRank ? `#${simulatedResultModal.arrivalRank}` : '-')}
                  </span>
                </div>
              </div>

              {/* Message / Audio Simulation Text */}
              <div className="p-2.5 rounded-sm bg-[#070e20] border border-slate-800 text-xs text-slate-300 text-left">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">Pesan Suara / Respon Kiosk:</span>
                <p className="font-medium text-slate-200 mt-0.5">
                  &ldquo;{simulatedResultModal.message}&rdquo;
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSimulatedResultModal(null)}
                className="btn-primary-sharp px-5 py-2 text-xs cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>

      {/* REALTIME TOAST NOTIFICATION POPUP */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-600 text-white font-bold px-5 py-3 rounded shadow-lg border border-emerald-400 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0" />
          <span className="text-xs sm:text-sm">{toastMessage}</span>
        </div>
      )}

    </div>
  );
};
