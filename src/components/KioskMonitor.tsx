import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GateLocation, SchoolSchedule, AttendanceAttemptResult, AttendanceRecord, AttendanceStats, Role, Student, Teacher } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { soundEngine } from '../lib/audio';
import { SchoolLogo } from './SchoolLogo';
import { MARQUEE_THEMES_CONFIG } from '../data/holidayGreetings';
import { 
  Clock, 
  MapPin, 
  CheckCircle,
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  CreditCard, 
  Megaphone,
  Sparkles,
  ShieldCheck,
  Building2,
  Bell,
  BellOff,
  Sun,
  Moon,
  Sunset,
  Users,
  LogOut,
  UserCheck,
  Info,
  Activity,
  Calendar,
  Wifi,
  WifiOff,
  Database,
  HardDrive,
  Maximize2,
  Minimize2,
  Monitor,
  Menu,
  X,
  ChevronRight,
  Sliders,
  SlidersHorizontal,
  Award,
  GraduationCap,
  Lock,
  Unlock,
  KeyRound,
  TrendingDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { KioskPinModal } from './KioskPinModal';
import { OfflineSyncModal } from './OfflineSyncModal';
import { EarlyCheckoutModal } from './EarlyCheckoutModal';
import { UserAvatar } from './UserAvatar';

interface KioskMonitorProps {
  gateLocation: GateLocation;
  setGateLocation: (gate: GateLocation) => void;
  schedule: SchoolSchedule;
  isMuted: boolean;
  setIsMuted?: (muted: boolean) => void;
  onOpenLogin: () => void;
  currentUser: { username: string; role: Role; name: string } | null;
  onLogout: () => void;
  onOpenDashboard: (role: Role) => void;
}

export const KioskMonitor: React.FC<KioskMonitorProps> = ({
  gateLocation,
  setGateLocation,
  schedule,
  isMuted,
  setIsMuted,
  onOpenLogin,
  currentUser,
  onLogout,
  onOpenDashboard
}) => {
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [currentHour, setCurrentHour] = useState<number>(new Date().getHours());
  const [currentSchedule, setCurrentSchedule] = useState<SchoolSchedule>(schedule);
  const [recentLogs, setRecentLogs] = useState<AttendanceRecord[]>([]);
  const [allTodayLogs, setAllTodayLogs] = useState<AttendanceRecord[]>([]);
  const [arrivalFeedTab, setArrivalFeedTab] = useState<'all' | 'students' | 'teachers'>('all');

  // Kiosk Lock Screen & Security PIN state
  const [isKioskLocked, setIsKioskLocked] = useState<boolean>(() => AttendanceStorage.isKioskLocked());
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pinModalTitle, setPinModalTitle] = useState<string>('Buka Kunci Layar Kiosk');
  const [pendingProtectedAction, setPendingProtectedAction] = useState<(() => void) | null>(null);

  // Early Checkout (Siswa Pulang Lebih Awal di Tengah KBM)
  const [isEarlyCheckoutModalOpen, setIsEarlyCheckoutModalOpen] = useState<boolean>(false);
  const [earlyCheckoutStudent, setEarlyCheckoutStudent] = useState<Student | null>(null);

  useEffect(() => {
    setCurrentSchedule(schedule);
  }, [schedule]);

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

  // Last Tap Result Overlay state
  const [activeOverlay, setActiveOverlay] = useState<AttendanceAttemptResult | null>(null);
  const [hoveredLogId, setHoveredLogId] = useState<string | null>(null);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss active tap overlay strictly after 3 seconds
  useEffect(() => {
    if (!activeOverlay) return;
    const timer = setTimeout(() => {
      setActiveOverlay(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeOverlay]);

  // Buffer for USB RFID Card Reader wedge keyboard inputs
  const [keystrokeBuffer, setKeystrokeBuffer] = useState<string>('');
  const bufferTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Network & Database Real-time Health State
  const [isOnline, setIsOnline] = useState<boolean>(() => AttendanceStorage.isNetworkOnline());
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() => AttendanceStorage.getPendingSyncQueue().length);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Baru saja');
  const [isDbInfoModalOpen, setIsDbInfoModalOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMobileKioskMenuOpen, setIsMobileKioskMenuOpen] = useState<boolean>(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState<boolean>(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsActionMenuOpen(false);
      }
    };

    if (isActionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionMenuOpen]);

  // Protected action executor that checks lock status
  const executeProtectedAction = (action: () => void, title: string = 'Buka Kunci Layar Kiosk') => {
    if (isKioskLocked) {
      setPinModalTitle(title);
      setPendingProtectedAction(() => action);
      setIsPinModalOpen(true);
    } else {
      action();
    }
  };

  const handleUnlockSuccess = () => {
    setIsPinModalOpen(false);
    if (pendingProtectedAction) {
      const action = pendingProtectedAction;
      setPendingProtectedAction(null);
      action();
    } else {
      setIsKioskLocked(false);
      AttendanceStorage.setKioskLocked(false);
      try {
        if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
          (navigator as any).keyboard.unlock();
        }
      } catch {
        // Ignore if not supported
      }
    }
  };

  const handleToggleLock = () => {
    if (isKioskLocked) {
      setPinModalTitle('Buka Kunci Layar Kiosk');
      setPendingProtectedAction(() => {
        setIsKioskLocked(false);
        AttendanceStorage.setKioskLocked(false);
        try {
          if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
            (navigator as any).keyboard.unlock();
          }
        } catch {
          // Ignore
        }
      });
      setIsPinModalOpen(true);
    } else {
      setIsKioskLocked(true);
      AttendanceStorage.setKioskLocked(true);

      // Otomatis aktifkan layar penuh (Fullscreen) saat mengunci layar kiosk
      const docEl = document.documentElement as any;
      const isCurrentlyFs = !!(document.fullscreenElement || docEl.webkitFullscreenElement || docEl.mozFullScreenElement || docEl.msFullscreenElement);
      if (!isCurrentlyFs) {
        const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (reqFs) {
          reqFs.call(docEl).then(() => {
            try {
              if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
                (navigator as any).keyboard.lock(['Escape', 'F11', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12']).catch(() => {});
              }
            } catch {
              // Ignore
            }
          }).catch(() => {});
        }
      } else {
        try {
          if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
            (navigator as any).keyboard.lock(['Escape', 'F11', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12']).catch(() => {});
          }
        } catch {
          // Ignore
        }
      }
    }
  };

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;
      const isCurrentlyFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);

      if (!isCurrentlyFs) {
        const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (reqFs) {
          reqFs.call(docEl).then(() => {
            if (isKioskLocked) {
              try {
                if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
                  (navigator as any).keyboard.lock(['Escape', 'F11', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12']).catch(() => {});
                }
              } catch {}
            }
          }).catch(() => {});
        }
      } else {
        const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
        if (exitFs) {
          exitFs.call(doc).catch(() => {});
        }
      }
    } catch {
      // Ignore if blocked
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const active = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
      setIsFullscreen(active);

      if (active && isKioskLocked) {
        try {
          if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
            (navigator as any).keyboard.lock(['Escape', 'F11', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12']).catch(() => {});
          }
        } catch {
          // Ignore
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [isKioskLocked]);

  // Prevent context menu (right click) when Kiosk is locked
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (isKioskLocked) {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [isKioskLocked]);

  // Check Database & Network Health
  const checkDatabaseHealth = () => {
    try {
      if (typeof window !== 'undefined') {
        const testKey = '__rfid_db_health_test__';
        localStorage.setItem(testKey, Date.now().toString());
        localStorage.removeItem(testKey);
        setIsDbConnected(true);
        setLastSyncTime(new Date().toLocaleTimeString('id-ID'));
      }
    } catch {
      setIsDbConnected(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkDatabaseHealth();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check & interval heartbeat
    checkDatabaseHealth();
    const interval = setInterval(() => {
      checkDatabaseHealth();
      if (typeof navigator !== 'undefined') {
        setIsOnline(navigator.onLine);
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  // Students and Teachers cache for fast UID lookup, 3x4 photos, and rich hover biodata
  const [allStudents, setAllStudents] = useState<Student[]>(() => AttendanceStorage.getStudents());
  const [allTeachers, setAllTeachers] = useState<Teacher[]>(() => AttendanceStorage.getTeachers());

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    allStudents.forEach(s => {
      if (s.id) map.set(s.id, s);
      if (s.rfidUid) map.set(s.rfidUid.toUpperCase().trim(), s);
    });
    return map;
  }, [allStudents]);

  const teacherMap = useMemo(() => {
    const map = new Map<string, Teacher>();
    allTeachers.forEach(t => {
      if (t.id) map.set(t.id, t);
      if (t.rfidUid) map.set(t.rfidUid.toUpperCase().trim(), t);
    });
    return map;
  }, [allTeachers]);

  // Refresh recent logs & stats for today ONLY (fresh daily start)
  const refreshLogsAndStats = () => {
    AttendanceStorage.checkAndProcessDayRollover();
    const all = AttendanceStorage.getAttendanceRecords();
    const todayStr = AttendanceStorage.getTodayDate();
    const todayLogs = all.filter(r => r.dateFormatted === todayStr);
    setAllTodayLogs(todayLogs);
    setRecentLogs(todayLogs.slice(0, 10)); // Keep up to 10 most recent taps
    setStats(AttendanceStorage.getStatsToday());
    setAllStudents(AttendanceStorage.getStudents());
    setAllTeachers(AttendanceStorage.getTeachers());
  };

  // Chronological arrival ranking today (separate for Student vs Teacher)
  const studentArrivalsToday = useMemo(() => {
    return allTodayLogs
      .filter(r => r.type === 'MASUK' && (r.userType === 'STUDENT' || (!r.userType && r.studentId)))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [allTodayLogs]);

  const teacherArrivalsToday = useMemo(() => {
    return allTodayLogs
      .filter(r => r.type === 'MASUK' && (r.userType === 'TEACHER' || !!r.teacherId))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [allTodayLogs]);

  const studentRankMap = useMemo(() => {
    const map = new Map<string, number>();
    studentArrivalsToday.forEach((rec, idx) => {
      if (rec.studentId) map.set(rec.studentId, idx + 1);
      map.set(rec.id, idx + 1);
    });
    return map;
  }, [studentArrivalsToday]);

  const teacherRankMap = useMemo(() => {
    const map = new Map<string, number>();
    teacherArrivalsToday.forEach((rec, idx) => {
      if (rec.teacherId) map.set(rec.teacherId, idx + 1);
      map.set(rec.id, idx + 1);
    });
    return map;
  }, [teacherArrivalsToday]);

  // Open full-screen tap overlay for any log (from click or hover inspection)
  const handlePreviewLog = (log: AttendanceRecord) => {
    const isTeacher = log.userType === 'TEACHER' || !!log.teacherId || !!log.teacherName;
    const student = !isTeacher ? studentMap.get(log.studentId || log.rfidUid) : undefined;
    const teacher = isTeacher ? teacherMap.get(log.teacherId || log.rfidUid) : undefined;
    
    const rankNum = log.type === 'MASUK'
      ? (isTeacher
          ? (log.teacherId ? teacherRankMap.get(log.teacherId) : undefined)
          : (log.studentId ? studentRankMap.get(log.studentId) : undefined))
      : undefined;

    const rankText = rankNum
      ? (isTeacher ? `Guru Ke-${rankNum}` : `Siswa Ke-${rankNum}`)
      : undefined;

    setActiveOverlay({
      success: true,
      message: log.type === 'MASUK'
        ? (log.status === 'TERLAMBAT' ? 'Presensi Masuk (Terlambat)' : 'Presensi Masuk (Tepat Waktu)')
        : 'Presensi Pulang Tercatat',
      userType: isTeacher ? 'TEACHER' : 'STUDENT',
      status: log.status,
      record: log,
      student,
      teacher,
      rfidUid: log.rfidUid,
      scanTime: `${log.timeFormatted} WIB`,
      arrivalRank: rankNum,
      arrivalRankText: rankText
    });

    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      setActiveOverlay(null);
    }, 3000);
  };

  // Date watcher for automatic midnight / next-day rollover
  const [currentDateKey, setCurrentDateKey] = useState(() => AttendanceStorage.getTodayDate());

  useEffect(() => {
    const checkDateInterval = setInterval(() => {
      const todayStr = AttendanceStorage.getTodayDate();
      if (todayStr !== currentDateKey) {
        setCurrentDateKey(todayStr);
        AttendanceStorage.checkAndProcessDayRollover();
        refreshLogsAndStats();
      }
    }, 30000);
    return () => clearInterval(checkDateInterval);
  }, [currentDateKey]);

  useEffect(() => {
    refreshLogsAndStats();

    const updateConnHealth = () => {
      setIsOnline(AttendanceStorage.isNetworkOnline());
      setPendingOfflineCount(AttendanceStorage.getPendingSyncQueue().length);
      const lastSync = AttendanceStorage.getLastSyncTime();
      if (lastSync) {
        setLastSyncTime(new Date(lastSync).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
      }
    };

    updateConnHealth();
    window.addEventListener('online', updateConnHealth);
    window.addEventListener('offline', updateConnHealth);
    
    // Subscribe to realtime changes from other windows/tabs
    const unsubscribe = AttendanceStorage.subscribeToSync((evt) => {
      if (
        evt.type === 'ATTENDANCE_UPDATED' ||
        evt.type === 'STUDENTS_UPDATED' ||
        evt.type === 'SCHEDULE_UPDATED' ||
        evt.type === 'STORAGE_UPDATED' ||
        evt.type === 'DAY_CHANGED' ||
        evt.type === 'DAILY_RECAP_SAVED'
      ) {
        refreshLogsAndStats();
        setCurrentSchedule(AttendanceStorage.getSchedule());
      }
      if (evt.type === 'KIOSK_LOCK_CHANGED') {
        setIsKioskLocked(AttendanceStorage.isKioskLocked());
      }
      if (
        evt.type === 'OFFLINE_QUEUE_UPDATED' ||
        evt.type === 'OFFLINE_SYNC_COMPLETED' ||
        evt.type === 'NETWORK_STATUS_CHANGED' ||
        evt.type === 'SIMULATE_OFFLINE_CHANGED'
      ) {
        updateConnHealth();
        refreshLogsAndStats();
      }
    });

    return () => {
      window.removeEventListener('online', updateConnHealth);
      window.removeEventListener('offline', updateConnHealth);
      unsubscribe();
    };
  }, []);

  // Realtime clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('id-ID', { hour12: false }));
      setDateStr(now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }));
      setCurrentHour(now.getHours());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper to parse time string "HH:MM" to minutes from midnight
  const parseTimeToMinutes = (timeStr?: string, defaultMins = 0): number => {
    if (!timeStr) return defaultMins;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h)) return defaultMins;
    return h * 60 + (isNaN(m) ? 0 : m);
  };

  // Dynamic Greeting based strictly on hour: Pagi, Siang, Sore, Malam (hanya salam saja)
  const getDynamicGreeting = (hour: number): string => {
    if (hour >= 4 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const dynamicGreeting = getDynamicGreeting(currentHour);

  // Operational schedules in minutes
  const entryStartMins = parseTimeToMinutes(currentSchedule.entryStartTime, 6 * 60);
  const entryEndMins = parseTimeToMinutes(currentSchedule.entryEndTime || currentSchedule.entryDeadlineTime, 8 * 60 + 30);
  const exitStartMins = parseTimeToMinutes(currentSchedule.exitStartTime, 13 * 60);
  const exitEndMins = parseTimeToMinutes(currentSchedule.exitEndTime, 17 * 60);

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Active operational windows
  const isWithinEntryHours = currentMins >= entryStartMins && currentMins <= entryEndMins;
  const isWithinExitHours = currentMins >= exitStartMins && currentMins <= exitEndMins;
  const hasManualOverride = Boolean(currentSchedule.manualGateOverride);

  // Machine is ready only during official operational hours (entry or exit) or if manual override is active
  const isOperationalActive = hasManualOverride || isWithinEntryHours || isWithinExitHours;
  const isKioskClosed = !isOperationalActive;

  // Session type: Pulang vs Masuk
  const isCheckoutSession = isWithinExitHours || (hasManualOverride && currentMins >= exitStartMins);
  const isEntrySession = isWithinEntryHours || (hasManualOverride && !isCheckoutSession);

  // Global Keypress Listener for USB RFID Card Readers, Fullscreen/F11 Interception & Custom Simulator Tap Event
  useEffect(() => {
    const handleCustomTap = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail && customEvt.detail.uid) {
        handleRfidCardTap(customEvt.detail.uid);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Intercept F11 (Fullscreen Toggle / Minimize)
      if (e.key === 'F11' || e.code === 'F11' || (e as any).keyCode === 122) {
        e.preventDefault();
        e.stopPropagation();
        if (isKioskLocked) {
          setPinModalTitle('Buka Kunci Layar Kiosk untuk Ubah Layar Penuh / Minimize');
          setPendingProtectedAction(() => {
            toggleFullscreen();
          });
          setIsPinModalOpen(true);
        } else {
          toggleFullscreen();
        }
        return;
      }

      // 2. Intercept Escape when locked (Prevent exiting fullscreen without PIN)
      if (e.key === 'Escape' || e.code === 'Escape' || (e as any).keyCode === 27) {
        if (isKioskLocked) {
          e.preventDefault();
          e.stopPropagation();
          if (!isPinModalOpen && !isDbInfoModalOpen && !isMobileKioskMenuOpen) {
            setPinModalTitle('Buka Kunci Layar Kiosk untuk Keluar');
            setPendingProtectedAction(() => {
              const doc = document as any;
              const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
              if (exitFs) {
                exitFs.call(doc).catch(() => {});
              }
            });
            setIsPinModalOpen(true);
          }
          return;
        }
      }

      // 3. Block Developer tools shortcuts and window close if Kiosk is locked
      if (isKioskLocked) {
        if (
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k'].includes(e.key)) ||
          (e.ctrlKey && ['u', 'U', 'r', 'R', 'w', 'W'].includes(e.key))
        ) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Don't capture when explicitly typing in form inputs (like search bars or modal text fields)
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (keystrokeBuffer.trim().length > 0) {
          try {
            window.focus();
          } catch {
            // Ignore if window focus restricted by browser
          }
          handleRfidCardTap(keystrokeBuffer.trim());
          setKeystrokeBuffer('');
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setKeystrokeBuffer(prev => prev + e.key);

        if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
        bufferTimerRef.current = setTimeout(() => {
          setKeystrokeBuffer('');
        }, 1500);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('rfid_tap_event', handleCustomTap);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('rfid_tap_event', handleCustomTap);
    };
  }, [keystrokeBuffer, gateLocation, schedule, isMuted, isKioskClosed, isKioskLocked, isPinModalOpen, isDbInfoModalOpen, isMobileKioskMenuOpen]);

  // Execute Tap Processing
  const handleRfidCardTap = (rfidUid: string) => {
    // Jika sistem absensi berada di luar jam operasional, tolak tap kartu
    if (isKioskClosed) {
      if (!isMuted) {
        soundEngine.playWarning();
        soundEngine.speakText('Perhatian, Mesin Terkunci. Silahkan Tap Kartu pada Jam Operasional.');
      }
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setActiveOverlay({
        success: false,
        message: 'Mesin Terkunci Silahkan Tap Kartu pada Jam Operasional',
        reason: 'OUTSIDE_HOURS',
        rfidUid,
        scanTime: `${new Date().toLocaleTimeString('id-ID')} WIB`,
      });
      overlayTimerRef.current = setTimeout(() => {
        setActiveOverlay(null);
      }, 3500);
      return;
    }

    const result = AttendanceStorage.processRfidTap(rfidUid, gateLocation);
    
    // Deteksi jika siswa tap di tengah jam KBM sebelum jam pulang dibuka untuk izin pulang awal
    if (result.reason === 'ALREADY_CHECKED_IN' && result.student && !isCheckoutSession) {
      setEarlyCheckoutStudent(result.student);
      setIsEarlyCheckoutModalOpen(true);
      return;
    }

    // Clear existing timer if any
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);

    // Show the enlarged 3-second presentation overlay as requested
    setActiveOverlay({
      ...result,
      scanTime: `${new Date().toLocaleTimeString('id-ID')} WIB`,
    });

    if (result.success) {
      // Audio & TTS Greeting Feedback
      if (!isMuted) {
        if (result.userType === 'TEACHER' && result.teacher) {
          if (result.status === 'TERLAMBAT') {
            soundEngine.playWarning();
            soundEngine.speakText(`Perhatian Bapak Ibu ${result.teacher.name}, Presensi Terlambat.`);
          } else if (result.record?.type === 'PULANG') {
            soundEngine.playSuccess();
            soundEngine.speakText(`Selamat Siang Bapak Ibu ${result.teacher.name}! Terima kasih dan hati-hati di jalan.`);
          } else {
            soundEngine.playSuccess();
            soundEngine.speakText(`Selamat Pagi Bapak Ibu ${result.teacher.name}! Presensi Diterima.`);
          }
        } else {
          if (result.status === 'TERLAMBAT') {
            soundEngine.playWarning();
            if (result.student) {
              soundEngine.speakText(`Perhatian! ${result.student.name}, Absen Terlambat`);
            }
          } else if (result.record?.type === 'PULANG') {
            soundEngine.playSuccess();
            if (result.student) {
              soundEngine.speakText(`SELAMAT SIANG, ${result.student.name}! Hati-hati di jalan.`);
            }
          } else {
            soundEngine.playSuccess();
            if (result.student) {
              soundEngine.speakText(`Selamat PAGI, ${result.student.name}! Absen Diterima.`);
            }
          }
        }
      }

      // Immediately refresh recent logs feed and dashboard stats
      refreshLogsAndStats();
    } else {
      // Rejection feedback with clear audio explanation
      if (!isMuted) {
        soundEngine.playError();
        if (result.reason === 'COOLDOWN_ACTIVE') {
          soundEngine.speakText(`Presensi Ditolak. Mohon tunggu beberapa detik sebelum tap ulang.`);
        } else if (result.reason === 'ALREADY_CHECKED_IN') {
          soundEngine.speakText(`Presensi Ditolak. Sudah tercatat absen masuk hari ini.`);
        } else if (result.reason === 'ALREADY_CHECKED_OUT') {
          soundEngine.speakText(`Presensi Ditolak. Sudah tercatat absen pulang hari ini.`);
        } else if (result.reason === 'UNREGISTERED_CARD') {
          soundEngine.speakText(`Presensi Ditolak. Kartu RFID belum terdaftar di sistem.`);
        } else {
          soundEngine.speakText(`Presensi Ditolak.`);
        }
      }
    }

    // Auto dismiss overlay after exactly 3 seconds as requested
    overlayTimerRef.current = setTimeout(() => {
      setActiveOverlay(null);
    }, 3000);
  };

  const gateTitle = gateLocation === 'pintu_depan' ? 'PINTU DEPAN' : 'PINTU BELAKANG';

  return (
    <div className="h-full w-full max-w-full overflow-hidden bg-[#f8fafc] text-slate-800 flex flex-col justify-between p-2 sm:p-3.5 font-sans select-none relative">
      
      {/* SCREEN AMBIENT RADIAL FLASH / BORDER GLOW ON TAP */}
      <AnimatePresence>
        {activeOverlay && (
          <motion.div
            key={`edge-glow-${activeOverlay.scanTime}`}
            initial={{ opacity: 0.85 }}
            animate={{ opacity: [0.85, 0.4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            className={`fixed inset-0 pointer-events-none z-40 border-[8px] sm:border-[12px] ${
              activeOverlay.success
                ? activeOverlay.status === 'TERLAMBAT'
                  ? 'border-amber-500 shadow-[inset_0_0_80px_rgba(245,158,11,0.35)]'
                  : activeOverlay.record?.type === 'PULANG'
                  ? 'border-blue-600 shadow-[inset_0_0_80px_rgba(37,99,235,0.35)]'
                  : 'border-emerald-500 shadow-[inset_0_0_80px_rgba(16,185,129,0.35)]'
                : 'border-rose-500 shadow-[inset_0_0_80px_rgba(244,63,94,0.35)]'
            }`}
          />
        )}
      </AnimatePresence>
      
      {/* 1. KIOSK TOP INFO HEADER (AUTOMATICALLY HIDES ON TAP FOR 3 SECONDS TO HIGHLIGHT USER DATA) */}
      <AnimatePresence>
        {!activeOverlay && (
          <motion.div
            key="kiosk-top-navbar"
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="bg-white border border-slate-200/90 rounded-lg p-2 sm:p-2.5 px-3 sm:px-4 shadow-sm shrink-0 w-full max-w-full text-slate-900"
          >
            
            {/* DESKTOP HEADER (LARGE SCREENS: MATHEMATICALLY CENTERED CLOCK & LARGER TYPOGRAPHY) */}
            <div className="hidden lg:grid grid-cols-[1fr_auto_1fr] items-center gap-2 xl:gap-4 w-full min-w-0">
              {/* Left: School Logo & Brand Title matching requested design */}
              <div className="justify-self-start flex items-center gap-2.5 xl:gap-3.5 shrink-0">
                <div className="bg-white p-1 xl:p-1.5 rounded-lg border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                  <SchoolLogo size="sm" variant="full" />
                </div>
                
                <div className="flex flex-col justify-center min-w-0">
                  <span className="font-black text-sm sm:text-base xl:text-lg text-blue-950 tracking-tight uppercase leading-tight select-none">
                    SMK EKONOMIKA DEPOK
                  </span>
                  <span className="text-[9px] sm:text-[10px] xl:text-[11px] font-black text-blue-600 tracking-wider uppercase leading-tight select-none mt-0.5">
                    SMART SYSTEM RFID ATTENDANCE
                  </span>
                </div>
              </div>

              {/* Center: Date Display & Realtime Clock (MATHEMATICALLY CENTERED & ENLARGED) */}
              <div className="justify-self-center flex items-center justify-center gap-2.5 xl:gap-3.5 text-center min-w-0 shrink">
                <div className="hidden xl:block min-w-0 text-right pr-1">
                  <span className="text-sm xl:text-base font-black text-slate-800 uppercase tracking-wide block truncate">
                    {dateStr}
                  </span>
                </div>
                <div className="hidden xl:block h-7 w-px bg-slate-300 shrink-0" />
                <div className="bg-blue-50/90 px-3.5 xl:px-4 py-1.5 xl:py-2 rounded-lg border border-blue-200/90 shadow-xs shrink-0">
                  <div className="text-2xl xl:text-3xl font-mono font-black text-blue-700 tracking-wider whitespace-nowrap">
                    {timeStr || '00:00:00'}
                  </div>
                </div>
              </div>

              {/* Right: Consolidated Action Container (Single Parent Button) */}
              <div className="justify-self-end relative shrink-0" ref={actionMenuRef}>
                <button
                  onClick={() => setIsActionMenuOpen(prev => !prev)}
                  className={`relative flex items-center justify-center w-9 h-9 rounded-lg border transition-all cursor-pointer shadow-xs ${
                    isActionMenuOpen 
                      ? 'bg-[#13234d] text-white border-blue-500 shadow-md ring-2 ring-blue-500/30' 
                      : 'bg-[#0a1228] hover:bg-[#13234d] text-slate-200 border-blue-900/50 hover:border-blue-700/60'
                  }`}
                  title="Menu Kontrol Kiosk"
                  aria-label="Menu Kontrol Kiosk"
                  aria-expanded={isActionMenuOpen}
                >
                  {isActionMenuOpen ? (
                    <X className="w-4 h-4 text-slate-200" />
                  ) : (
                    <SlidersHorizontal className="w-4 h-4 text-slate-200" />
                  )}

                  {/* Ambient Status Dot: Indicates system status at a glance without text clutter */}
                  <span 
                    className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-[#0a1228] ${
                      !isOnline || pendingOfflineCount > 0
                        ? 'bg-amber-400 animate-pulse'
                        : isKioskLocked 
                        ? 'bg-amber-400' 
                        : 'bg-emerald-400'
                    }`}
                  />
                </button>

                {/* DARK GLASSMORPHISM POPOVER DROPDOWN */}
                <AnimatePresence>
                  {isActionMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#0a1228]/95 backdrop-blur-md rounded-xl border border-blue-900/60 shadow-2xl shadow-blue-950/80 p-3 z-50 text-slate-200 divide-y divide-blue-900/30 space-y-2.5"
                    >
                      {/* Dropdown Header */}
                      <div className="flex items-center justify-between pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-blue-950/80 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
                            <Monitor className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-white tracking-wide uppercase truncate">
                              Kontrol Kiosk RFID
                            </div>
                            <div className="text-[10px] text-blue-300 font-medium truncate">
                              {currentSchedule.schoolName}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setIsActionMenuOpen(false)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
                          title="Tutup Menu"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 1. Status Koneksi Cloud & Antrean Offline */}
                      <div className="pt-2.5">
                        <button
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            setIsDbInfoModalOpen(true);
                          }}
                          className={`w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                            isOnline && pendingOfflineCount === 0
                              ? 'bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-200 border-emerald-500/30'
                              : pendingOfflineCount > 0
                              ? 'bg-amber-950/30 hover:bg-amber-900/40 text-amber-200 border-amber-500/30 ring-1 ring-amber-400/50'
                              : 'bg-amber-950/30 hover:bg-amber-900/40 text-amber-200 border-amber-500/30'
                          }`}
                          title="Klik untuk melihat Status Koneksi & Antrean Offline"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isOnline ? (
                              pendingOfflineCount > 0 ? (
                                <Activity className="w-4 h-4 text-amber-300 animate-spin shrink-0" />
                              ) : (
                                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                              )
                            ) : (
                              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold leading-tight truncate">
                                {!isOnline 
                                  ? `Auto-Save Offline (${pendingOfflineCount})` 
                                  : pendingOfflineCount > 0 
                                  ? `Sinkronisasi (${pendingOfflineCount})...` 
                                  : 'Cloud Firestore Terhubung'}
                              </div>
                              <div className="text-[10px] text-slate-400 leading-tight">
                                Status Database & Antrean
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                      </div>

                      {/* 2. Keamanan Layar Kiosk */}
                      <div className="pt-2.5">
                        <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                          isKioskLocked
                            ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                            : 'bg-[#0f1b3b]/60 border-blue-900/40 text-slate-200'
                        }`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {isKioskLocked ? (
                              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <Unlock className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold leading-tight">
                                {isKioskLocked ? 'Layar Kiosk Terkunci' : 'Layar Kiosk Terbuka'}
                              </div>
                              <div className="text-[10px] text-slate-400 leading-tight">
                                {isKioskLocked ? 'Dilindungi PIN Keamanan' : 'Proteksi Operasional'}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setIsActionMenuOpen(false);
                              handleToggleLock();
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-black cursor-pointer transition-all shrink-0 ${
                              isKioskLocked
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                          >
                            {isKioskLocked ? 'Buka PIN' : 'Kunci'}
                          </button>
                        </div>
                      </div>

                      {/* 3. Pengaturan Perangkat: Layar Penuh & Suara Bel */}
                      <div className="pt-2.5 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Pengaturan Perangkat
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              setIsActionMenuOpen(false);
                              executeProtectedAction(toggleFullscreen, 'Buka Kunci untuk Mengubah Mode Layar Penuh');
                            }}
                            className="p-2 rounded-lg border border-blue-900/40 bg-[#0f1b3b]/60 hover:bg-[#182852] text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs font-medium"
                            title={isFullscreen ? 'Keluar dari Layar Penuh' : 'Masuk ke Layar Penuh'}
                          >
                            {isFullscreen ? (
                              <Minimize2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <Maximize2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            )}
                            <span className="truncate">{isFullscreen ? 'Normal' : 'Fullscreen'}</span>
                          </button>

                          {setIsMuted && (
                            <button
                              onClick={() => setIsMuted(!isMuted)}
                              className={`p-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                isMuted 
                                  ? 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/40' 
                                  : 'bg-[#0f1b3b]/60 text-slate-200 border-blue-900/40 hover:bg-[#182852]'
                              }`}
                              title={isMuted ? 'Suara Bel Dimatikan' : 'Suara Bel Aktif'}
                            >
                              {isMuted ? (
                                <BellOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              ) : (
                                <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span className="truncate">{isMuted ? 'Senyap' : 'Suara On'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 4. Lokasi Pintu Gerbang RFID */}
                      <div className="pt-2.5 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Pintu Gerbang RFID</span>
                          <span className="text-[9px] text-blue-400 font-normal">
                            {gateLocation === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              executeProtectedAction(() => {
                                setGateLocation('pintu_depan');
                                setIsActionMenuOpen(false);
                              }, 'Buka Kunci untuk Ganti Gerbang');
                            }}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              gateLocation === 'pintu_depan'
                                ? 'bg-blue-600 text-white shadow-xs font-black'
                                : 'bg-[#0f1b3b]/60 text-slate-300 hover:bg-[#182852] border border-blue-900/40'
                            }`}
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Depan</span>
                          </button>
                          <button
                            onClick={() => {
                              executeProtectedAction(() => {
                                setGateLocation('pintu_belakang');
                                setIsActionMenuOpen(false);
                              }, 'Buka Kunci untuk Ganti Gerbang');
                            }}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              gateLocation === 'pintu_belakang'
                                ? 'bg-blue-600 text-white shadow-xs font-black'
                                : 'bg-[#0f1b3b]/60 text-slate-300 hover:bg-[#182852] border border-blue-900/40'
                            }`}
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Belakang</span>
                          </button>
                        </div>
                      </div>

                      {/* 5. Akses Akun Petugas & Super Admin */}
                      <div className="pt-2.5">
                        {currentUser ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs px-1">
                              <span className="text-slate-400">Akun Aktif:</span>
                              <span className="font-bold text-blue-300 truncate max-w-[140px]">
                                {currentUser.name || (currentUser.role === 'admin' ? 'Super Admin' : 'Guru Piket')}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <button
                                onClick={() => {
                                  setIsActionMenuOpen(false);
                                  onOpenDashboard(currentUser.role);
                                }}
                                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                <span>Kembali ke Dashboard {currentUser.role === 'admin' ? 'Admin' : 'Guru Piket'}</span>
                              </button>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => {
                                    setIsActionMenuOpen(false);
                                    onOpenLogin();
                                  }}
                                  className="py-1.5 px-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-all flex items-center justify-center gap-1 cursor-pointer"
                                  title="Buka Dialog Login / Ganti Akun"
                                >
                                  <Lock className="w-3 h-3 shrink-0" />
                                  <span>Dialog Login</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setIsActionMenuOpen(false);
                                    onLogout();
                                  }}
                                  className="py-1.5 px-2 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[11px] font-medium transition-all flex items-center justify-center gap-1 cursor-pointer"
                                  title="Keluar dari Akun (Logout)"
                                >
                                  <LogOut className="w-3 h-3 shrink-0" />
                                  <span>Keluar</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setIsActionMenuOpen(false);
                              onOpenLogin();
                            }}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                          >
                            <Lock className="w-4 h-4" />
                            <span>Login</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* MOBILE / TABLET COMPACT HEADER (ZERO HORIZONTAL OVERFLOW) */}
            <div className="flex lg:hidden items-center justify-between gap-2 w-full">
              {/* Left: Compact Logo & School Title */}
              <div className="flex items-center gap-2 min-w-0 shrink">
                <div className="bg-white p-1 rounded-lg border border-blue-900/40 shadow-xs flex items-center justify-center shrink-0">
                  <SchoolLogo size="xs" variant="full" />
                </div>
                <div className="min-w-0 flex flex-col justify-center">
                  <span className="text-xs sm:text-sm font-black text-white uppercase leading-tight truncate">
                    SMK EKONOMIKA DEPOK
                  </span>
                  <span className="text-[9px] font-black text-blue-300 uppercase tracking-wide truncate">
                    SMART SYSTEM RFID ATTENDANCE
                  </span>
                </div>
              </div>

              {/* Center: Digital Clock */}
              <div className="bg-[#070d1e] px-2 py-1 rounded border border-blue-900/50 shadow-xs shrink-0">
                <div className="text-xs sm:text-sm font-mono font-black text-amber-300 tracking-wider">
                  {timeStr || '00:00:00'}
                </div>
              </div>

              {/* Right: Consolidated Action Button */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setIsMobileKioskMenuOpen(true)}
                  className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-blue-900/50 bg-[#0a1228] hover:bg-[#13234d] text-slate-200 transition-all shrink-0 cursor-pointer shadow-xs"
                  title="Menu Kontrol Kiosk"
                  aria-label="Buka Menu Kiosk"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-200" />
                  <span 
                    className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ring-1 ring-[#0a1228] ${
                      !isOnline || pendingOfflineCount > 0
                        ? 'bg-amber-400 animate-pulse'
                        : isKioskLocked 
                        ? 'bg-amber-400' 
                        : 'bg-emerald-400'
                    }`}
                  />
                </button>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE KIOSK CONTROL MODAL / DRAWER */}
      {isMobileKioskMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            className="fixed inset-0"
            onClick={() => setIsMobileKioskMenuOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm bg-slate-900 rounded-md p-4 shadow-2xl border border-slate-700 space-y-3.5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto text-slate-100">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center font-black">
                  <Monitor className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Kontrol Kiosk RFID</h3>
                  <p className="text-[10px] text-slate-400">{currentSchedule.schoolName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileKioskMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lock status banner in mobile drawer */}
            <div className={`p-2.5 rounded border flex items-center justify-between gap-2 text-xs ${
              isKioskLocked ? 'bg-amber-950/40 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}>
              <div className="flex items-center gap-2">
                {isKioskLocked ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-slate-400" />}
                <span className="font-bold">{isKioskLocked ? 'Mode Kiosk Terkunci' : 'Kiosk Tidak Terkunci'}</span>
              </div>
              <button
                onClick={() => {
                  setIsMobileKioskMenuOpen(false);
                  handleToggleLock();
                }}
                className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[10px] cursor-pointer"
              >
                {isKioskLocked ? 'Buka PIN' : 'Kunci'}
              </button>
            </div>

            {/* Gate Location Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                Lokasi Pintu Gate RFID
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    executeProtectedAction(() => {
                      setGateLocation('pintu_depan');
                      setIsMobileKioskMenuOpen(false);
                    }, 'Buka Kunci untuk Ganti Gerbang');
                  }}
                  className={`py-2 px-3 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    gateLocation === 'pintu_depan'
                      ? 'bg-blue-600 text-white shadow-md font-black'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Pintu Depan</span>
                </button>
                <button
                  onClick={() => {
                    executeProtectedAction(() => {
                      setGateLocation('pintu_belakang');
                      setIsMobileKioskMenuOpen(false);
                    }, 'Buka Kunci untuk Ganti Gerbang');
                  }}
                  className={`py-2 px-3 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    gateLocation === 'pintu_belakang'
                      ? 'bg-blue-600 text-white shadow-md font-black'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Pintu Belakang</span>
                </button>
              </div>
            </div>

            {/* Quick Actions & Toggles */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <button
                onClick={() => {
                  executeProtectedAction(() => {
                    toggleFullscreen();
                    setIsMobileKioskMenuOpen(false);
                  }, 'Buka Kunci untuk Mengubah Mode Layar Penuh');
                }}
                className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span>{isFullscreen ? 'Keluar Mode Layar Penuh' : 'Layar Penuh (Fullscreen)'}</span>
              </button>

              {setIsMuted && (
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`w-full py-2.5 px-3 border rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    isMuted
                      ? 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border-rose-600/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  {isMuted ? <BellOff className="w-3.5 h-3.5 text-rose-400" /> : <Bell className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{isMuted ? 'Suara Bel Notifikasi: Senyap' : 'Suara Bel Notifikasi: Aktif'}</span>
                </button>
              )}

              <button
                onClick={() => {
                  executeProtectedAction(() => {
                    setIsDbInfoModalOpen(true);
                    setIsMobileKioskMenuOpen(false);
                  }, 'Buka Kunci untuk Lihat Auto-Save Offline');
                }}
                className={`w-full py-2.5 px-3 border rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isOnline && pendingOfflineCount === 0
                    ? 'bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border-emerald-600/40'
                    : 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-600/40'
                }`}
              >
                {isOnline && pendingOfflineCount === 0 ? (
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>
                  {isOnline && pendingOfflineCount === 0
                    ? 'Status Database Cloud'
                    : `Auto-Save Offline (${pendingOfflineCount} antrean)`}
                </span>
              </button>

              {currentUser ? (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      onOpenDashboard(currentUser.role);
                      setIsMobileKioskMenuOpen(false);
                    }}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Kembali ke Dashboard {currentUser.role === 'admin' ? 'Admin' : 'Guru Piket'}</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        onOpenLogin();
                        setIsMobileKioskMenuOpen(false);
                      }}
                      className="py-2 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Dialog Login</span>
                    </button>
                    <button
                      onClick={() => {
                        onLogout();
                        setIsMobileKioskMenuOpen(false);
                      }}
                      className="py-2 px-2 rounded bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar Akun</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    onOpenLogin();
                    setIsMobileKioskMenuOpen(false);
                  }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <LogOut className="w-4 h-4 rotate-180" />
                  <span>Login</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 2. MAIN CENTER CONTENT CONTAINER (12 COLS FULL WIDTH + INLINE RESULT + HORIZONTAL RECENT LOGS) */}
      <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-2.5 my-1.5 overflow-hidden">
        
        {/* TOP MAIN BOX: KOLOM TAP KARTU RFID (12 COLS FULL WIDTH WITH INLINE TAP RESULT) */}
        <div className="bg-white border border-slate-200/90 rounded-lg p-3 sm:p-4 flex flex-col justify-between gap-2.5 relative shadow-sm overflow-hidden flex-1 min-h-0 text-slate-900">
          
          {/* HIGH-CONTRAST SESSION HEADER & PROMINENT SCHEDULE HIGHLIGHT (HIDES ON TAP FOR EXPANDED HOVER VIEW) */}
          <AnimatePresence>
            {!activeOverlay && (
              <motion.div
                key="session-header-strip"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 shrink-0 overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {/* Clean Session Title Badge */}
                  <span className={`px-3 py-1 rounded text-xs sm:text-sm font-black uppercase tracking-wider shadow-xs ${
                    isKioskClosed
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : isCheckoutSession
                      ? 'bg-blue-600 text-white border border-blue-500'
                      : 'bg-emerald-600 text-white border border-emerald-500'
                  }`}>
                    {isKioskClosed ? 'OPERASIONAL TUTUP' : isCheckoutSession ? 'SESI PULANG' : 'SESI MASUK'}
                  </span>

                  {/* HIGH-CONTRAST HIGHLIGHTED TIME SCHEDULES */}
                  {isKioskClosed ? (
                    <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 px-3 py-1 rounded text-xs">
                      <span className="text-slate-600 font-bold uppercase">Status Gerbang:</span>
                      <strong className="font-mono text-xs sm:text-sm font-black text-amber-700">
                        {currentMins < entryStartMins
                          ? `Terkunci • Sesi Masuk Dibuka ${currentSchedule.entryStartTime} WIB`
                          : currentMins < exitStartMins
                          ? `Terkunci • Sesi Pulang Dibuka ${currentSchedule.exitStartTime} WIB`
                          : `Selesai • Sesi Masuk Besok ${currentSchedule.entryStartTime} WIB`}
                      </strong>
                    </div>
                  ) : isCheckoutSession ? (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded text-xs">
                      <span className="text-blue-700 font-bold uppercase">Jam Pulang:</span>
                      <strong className="font-mono text-sm sm:text-base font-black text-blue-900">
                        {currentSchedule.exitStartTime} - {currentSchedule.exitEndTime || '17:00'} WIB
                      </strong>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded">
                        <span className="text-emerald-700 font-bold uppercase">Jam Masuk:</span>
                        <strong className="font-mono text-sm sm:text-base font-black text-emerald-900">
                          {currentSchedule.entryStartTime} - {currentSchedule.entryEndTime || currentSchedule.entryDeadlineTime} WIB
                        </strong>
                      </div>
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
                        <span className="text-amber-700 font-bold uppercase">Batas Tepat Waktu:</span>
                        <strong className="font-mono text-sm sm:text-base font-black text-amber-900">
                          {currentSchedule.entryDeadlineTime} WIB
                        </strong>
                      </div>
                      <div className="hidden lg:flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded">
                        <span className="text-blue-700 font-bold uppercase">Jam Pulang:</span>
                        <strong className="font-mono text-sm font-black text-blue-900">
                          {currentSchedule.exitStartTime} WIB
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Clean Unified Gate Switcher Below Navbar */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        executeProtectedAction(() => {
                          setGateLocation('pintu_depan');
                        }, 'Buka Kunci untuk Ganti Gerbang');
                      }}
                      className={`px-3 py-1 rounded font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                        gateLocation === 'pintu_depan'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Pintu Depan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        executeProtectedAction(() => {
                          setGateLocation('pintu_belakang');
                        }, 'Buka Kunci untuk Ganti Gerbang');
                      }}
                      className={`px-3 py-1 rounded font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                        gateLocation === 'pintu_belakang'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Pintu Belakang</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN INLINE TAP CARD CONTAINER (STANDBY WELCOME SCREEN OR ENLARGED INLINE RESULT OR ACTIVE TAP TARGET) */}
          <div className="flex-1 min-h-0 flex flex-col justify-center items-center w-full relative overflow-hidden">
            <AnimatePresence mode="popLayout">
              {isKioskClosed ? (
                /* STANDBY / WELCOME DISPLAY (SWISS/FUNCTIONAL - PRECISION CLOCK & ANNOUNCEMENT) */
                <motion.div
                  key="closed-standby-screen"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full p-6 lg:p-8 rounded-md border border-slate-200 bg-slate-900 text-center flex flex-col items-center justify-center gap-3.5 shadow-sm overflow-y-auto text-white"
                >
                  {/* Dynamic Greeting on Standby (hanya salam saja) + School Wordmark */}
                  <div className="space-y-1 max-w-xl shrink-0">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-semibold text-slate-300">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="font-bold text-amber-300">{dynamicGreeting}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-300 font-bold uppercase tracking-wider">{currentSchedule.schoolName || 'SMK EKONOMIKA DEPOK'}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                      Sistem Presensi Kartu RFID
                    </h2>
                  </div>

                  {/* Big Real-time Digital Clock & Indonesian Date */}
                  <div className="my-1 px-8 py-4 bg-slate-950/80 rounded-md border border-slate-800 text-center max-w-md w-full shrink-0">
                    <div className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-emerald-400 tabular-nums">
                      {timeStr} <span className="text-sm sm:text-base font-semibold text-emerald-500/80">WIB</span>
                    </div>
                    <div className="text-xs sm:text-sm font-medium text-slate-400 mt-1.5 border-t border-slate-800/80 pt-1.5">
                      {dateStr}
                    </div>
                  </div>

                  {/* Status Indicator: EXACT USER REQUIREMENT "Mesin Terkunci Silahkan Tap Kartu pada Jam Operasional" */}
                  <div className="inline-flex items-center gap-2 bg-amber-500/15 text-amber-300 px-4 py-2 rounded border border-amber-500/40 text-xs sm:text-sm font-bold shrink-0">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Mesin Terkunci Silahkan Tap Kartu pada Jam Operasional</span>
                  </div>

                  {/* School Announcement & Next Session Schedule */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-md p-3.5 max-w-xl w-full text-slate-200 text-xs sm:text-sm space-y-2.5 shrink-0">
                    {currentSchedule.announcementText && (
                      <div className="p-3 bg-slate-900 rounded border border-slate-800 text-left">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block mb-1">Pengumuman Sekolah:</span>
                        <p className="text-xs text-slate-300 leading-relaxed font-medium">
                          {currentSchedule.announcementText}
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
                      <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-center">
                        <span className="text-slate-400 font-semibold block uppercase text-[10px] tracking-wider">Jam Masuk</span>
                        <strong className="text-emerald-400 font-bold text-sm font-mono block mt-1 tabular-nums">
                          {currentSchedule.entryStartTime} - {currentSchedule.entryEndTime || currentSchedule.entryDeadlineTime} WIB
                        </strong>
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-center">
                        <span className="text-slate-400 font-semibold block uppercase text-[10px] tracking-wider">Jam Pulang</span>
                        <strong className="text-blue-400 font-bold text-sm font-mono block mt-1 tabular-nums">
                          {currentSchedule.exitStartTime} - {currentSchedule.exitEndTime || '17:00'} WIB
                        </strong>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : activeOverlay ? (
                /* ENLARGED TAP RESULT CARD (EXPANDS TO FILL SCREEN & HIDES OTHER PANELS FOR 3 SECONDS) */
                <motion.div
                  key={`inline-result-${activeOverlay.teacher?.id || activeOverlay.student?.id || activeOverlay.rfidUid}-${activeOverlay.scanTime}`}
                  initial={{ opacity: 0, scale: 0.86, y: 20 }}
                  animate={{ opacity: 1, scale: [0.86, 1.04, 1], y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: -20 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className={`w-full h-full p-4 sm:p-6 lg:p-8 rounded-md border-2 text-center flex flex-col items-center justify-between relative overflow-hidden shadow-lg transition-all text-white ${
                    activeOverlay.success
                      ? activeOverlay.status === 'TERLAMBAT'
                        ? 'bg-[#181308] border-amber-500'
                        : activeOverlay.record?.type === 'PULANG'
                        ? 'bg-[#07132a] border-blue-500'
                        : 'bg-[#071a14] border-emerald-500'
                      : activeOverlay.reason === 'OUTSIDE_HOURS'
                      ? 'bg-[#181308] border-amber-500'
                      : 'bg-[#1a0808] border-rose-500'
                  }`}
                >
                  {/* Official School Header - Centered with Logo */}
                  <div className="w-full relative flex flex-col items-center justify-center pb-3 border-b border-slate-800 mb-2">
                    {/* Manual Close / Dismiss Button */}
                    <button
                      type="button"
                      onClick={() => setActiveOverlay(null)}
                      className="absolute right-0 top-0 p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-sm transition-all border border-slate-700 cursor-pointer z-10"
                      title="Tutup Hasil Tap"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>

                    <div className="flex items-center justify-center py-1">
                      <SchoolLogo size="lg" variant="full" />
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-8 lg:gap-10 w-full max-w-5xl mx-auto my-auto py-2">
                    {/* Enlarged High-Res Avatar Photo (Proporsional Rasio 3x4 Bersih Tanpa Label Tag) */}
                    <div className="relative shrink-0">
                      {activeOverlay.reason === 'UNREGISTERED_CARD' ? (
                        <div className="w-40 sm:w-52 lg:w-56 aspect-[3/4] rounded-sm border-2 border-rose-500 bg-[#1f0b0b] text-rose-400 flex flex-col items-center justify-center p-4 text-center">
                          <AlertTriangle className="w-12 h-12 text-rose-500 mb-3" />
                          <span className="text-xs font-black uppercase tracking-wider text-rose-300">KARTU BELUM TERDAFTAR</span>
                          <span className="text-xs font-mono text-rose-400 mt-1 font-bold">UID: {activeOverlay.rfidUid || '-'}</span>
                        </div>
                      ) : activeOverlay.reason === 'OUTSIDE_HOURS' ? (
                        <div className="w-40 sm:w-52 lg:w-56 aspect-[3/4] rounded-sm border-2 border-amber-500 bg-[#1f160b] text-amber-400 flex flex-col items-center justify-center p-4 text-center">
                          <Lock className="w-12 h-12 text-amber-400 mb-3" />
                          <span className="text-xs font-black uppercase tracking-wider text-amber-300">MESIN TERKUNCI</span>
                          <span className="text-xs font-mono text-amber-400 mt-1 font-bold">Di Luar Jam Operasional</span>
                        </div>
                      ) : (
                        <div className={`relative w-40 sm:w-52 lg:w-56 aspect-[3/4] rounded-sm overflow-hidden bg-slate-950 border-2 transition-all flex items-center justify-center ${
                          activeOverlay.success 
                            ? activeOverlay.status === 'TERLAMBAT' 
                              ? 'border-amber-500' 
                              : activeOverlay.record?.type === 'PULANG'
                              ? 'border-blue-500'
                              : 'border-emerald-500' 
                            : 'border-rose-500'
                        }`}>
                          {activeOverlay.teacher?.avatarUrl || activeOverlay.student?.avatarUrl ? (
                            <img
                              src={activeOverlay.teacher?.avatarUrl || activeOverlay.student?.avatarUrl}
                              alt={activeOverlay.teacher?.name || activeOverlay.student?.name || "Kartu RFID"}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1c3a] text-white">
                              <span className="text-3xl sm:text-4xl font-black text-blue-300 font-mono tracking-wider">
                                {(activeOverlay.teacher?.name || activeOverlay.student?.name || 'ID').slice(0, 2).toUpperCase()}
                              </span>
                              <span className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-mono">
                                {activeOverlay.teacher ? 'GURU / PTK' : 'SISWA'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Details Info with Enlarged Typography */}
                    <div className="text-left space-y-3 flex-1 min-w-0 w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Role Indicator Badge */}
                        <span className={`inline-block px-2.5 py-1 rounded-sm text-xs font-black uppercase tracking-wider ${
                          activeOverlay.teacher || activeOverlay.userType === 'TEACHER'
                            ? 'bg-slate-900 text-white border border-slate-700'
                            : activeOverlay.reason === 'UNREGISTERED_CARD'
                            ? 'bg-rose-950 text-rose-200 border border-rose-800'
                            : activeOverlay.reason === 'OUTSIDE_HOURS'
                            ? 'bg-amber-950 text-amber-200 border border-amber-800'
                            : 'bg-blue-950 text-blue-200 border border-blue-800'
                        }`}>
                          {activeOverlay.teacher || activeOverlay.userType === 'TEACHER' 
                            ? 'GURU / TENAGA KEPENDIDIKAN' 
                            : activeOverlay.reason === 'UNREGISTERED_CARD'
                            ? 'KARTU RFID TIDAK DIKENALI'
                            : activeOverlay.reason === 'OUTSIDE_HOURS'
                            ? 'SISTEM PRESENSI TERKUNCI'
                            : 'SISWA'}
                        </span>

                        <span className={`inline-block px-3 py-1 rounded-sm text-xs font-black uppercase tracking-wider ${
                          activeOverlay.success
                            ? activeOverlay.status === 'TERLAMBAT'
                              ? 'bg-amber-500 text-slate-950 border border-amber-400'
                              : activeOverlay.record?.type === 'PULANG'
                              ? 'bg-blue-600 text-white border border-blue-500'
                              : 'bg-emerald-600 text-white border border-emerald-500'
                            : activeOverlay.reason === 'OUTSIDE_HOURS'
                            ? 'bg-amber-600 text-white border border-amber-500'
                            : 'bg-rose-600 text-white border border-rose-500'
                        }`}>
                          {activeOverlay.success
                            ? activeOverlay.status === 'TERLAMBAT'
                              ? 'PRESENSI DITERIMA (TERLAMBAT)'
                              : activeOverlay.record?.type === 'PULANG'
                              ? 'PRESENSI PULANG DITERIMA'
                              : 'PRESENSI DITERIMA (TEPAT WAKTU)'
                            : activeOverlay.reason === 'OUTSIDE_HOURS'
                            ? 'MESIN TERKUNCI: DI LUAR JAM OPERASIONAL'
                            : activeOverlay.reason === 'UNREGISTERED_CARD'
                            ? 'PRESENSI DITOLAK: KARTU BELUM TERDAFTAR'
                            : activeOverlay.reason === 'COOLDOWN_ACTIVE'
                            ? 'PRESENSI DITOLAK: JEDA COOLDOWN AKTIF'
                            : activeOverlay.reason === 'ALREADY_CHECKED_IN'
                            ? 'PRESENSI DITOLAK: SUDAH ABSEN MASUK'
                            : activeOverlay.reason === 'ALREADY_CHECKED_OUT'
                            ? 'PRESENSI DITOLAK: SUDAH ABSEN PULANG'
                            : 'PRESENSI DITOLAK'}
                        </span>

                        <span className="px-3 py-1 bg-white/90 text-slate-700 rounded text-xs font-mono font-bold border border-slate-300 shadow-2xs">
                          {gateTitle}
                        </span>

                        {activeOverlay.success && activeOverlay.record?.type === 'MASUK' && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-400 text-slate-950 rounded text-xs sm:text-sm font-black border border-amber-500 shadow-xs">
                            <Award className="w-4 h-4 text-amber-900" />
                            <span>
                              {activeOverlay.arrivalRankText ||
                                (activeOverlay.teacher || activeOverlay.userType === 'TEACHER'
                                  ? `Guru Ke-${(activeOverlay.teacher?.id && teacherRankMap.get(activeOverlay.teacher.id)) || (teacherArrivalsToday.length)}`
                                  : `Siswa Ke-${(activeOverlay.student?.id && studentRankMap.get(activeOverlay.student.id)) || (studentArrivalsToday.length)}`)}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Main Full Name */}
                      <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight break-words whitespace-normal">
                        {activeOverlay.teacher?.name || 
                         activeOverlay.student?.name || 
                         (activeOverlay.reason === 'UNREGISTERED_CARD' 
                           ? 'Kartu RFID Belum Terdaftar' 
                           : activeOverlay.reason === 'OUTSIDE_HOURS' 
                           ? 'Mesin Terkunci' 
                           : 'Presensi Ditolak')}
                      </h3>

                      {/* Full Descriptive Message / Reason Explanation */}
                      <p className="text-slate-300 text-xs sm:text-sm font-medium leading-relaxed break-words whitespace-normal">
                        {activeOverlay.reason === 'UNREGISTERED_CARD'
                          ? `Kartu RFID dengan nomor UID [${activeOverlay.rfidUid || '-'}] belum terdaftar dalam sistem sekolah. Silakan daftarkan kartu ini melalui menu Master Siswa atau Master Guru.`
                          : activeOverlay.reason === 'COOLDOWN_ACTIVE'
                          ? `Kartu baru saja di-tap. Mohon tunggu beberapa detik sebelum tap ulang untuk mencegah pencatatan ganda.`
                          : activeOverlay.reason === 'OUTSIDE_HOURS'
                          ? 'Mesin Terkunci Silahkan Tap Kartu pada Jam Operasional'
                          : activeOverlay.message}
                      </p>

                      {/* Offline Auto-Save Notification Banner */}
                      {activeOverlay.isOfflineSaved && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-bold">
                          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Auto-Save Offline Aktif: Presensi tersimpan aman di penyimpanan lokal dan akan otomatis diunggah ke cloud saat online.</span>
                        </div>
                      )}

                      {/* Swiss / Functional Info Grid */}
                      {activeOverlay.teacher || activeOverlay.userType === 'TEACHER' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">JABATAN / MAPEL</span>
                            <strong className="text-white text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.teacher?.position || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">NIP / NUPTK</span>
                            <strong className="text-white font-mono text-sm font-bold break-words block mt-0.5 tabular-nums">
                              {activeOverlay.teacher?.nip || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">NOMOR KARTU RFID</span>
                            <strong className="text-amber-300 font-mono text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.teacher?.rfidUid || activeOverlay.rfidUid || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">JENIS KELAMIN</span>
                            <strong className="text-white text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.teacher?.gender === 'P' ? 'Perempuan (P)' : activeOverlay.teacher?.gender === 'L' ? 'Laki-laki (L)' : '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">LOKASI GERBANG</span>
                            <strong className="text-emerald-400 text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.record?.gateName || gateTitle}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">WAKTU TAP</span>
                            <strong className="text-blue-300 font-mono text-sm font-bold break-words block mt-0.5 tabular-nums">
                              {activeOverlay.record?.timeFormatted 
                                ? `${activeOverlay.record.timeFormatted} WIB` 
                                : activeOverlay.scanTime || `${new Date().toLocaleTimeString('id-ID')} WIB`}
                            </strong>
                          </div>
                        </div>
                      ) : activeOverlay.student ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">KELAS</span>
                            <strong className="text-white text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.student.class || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">NISN</span>
                            <strong className="text-white font-mono text-sm font-bold break-words block mt-0.5 tabular-nums">
                              {activeOverlay.student.nisn || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">NOMOR KARTU RFID</span>
                            <strong className="text-amber-300 font-mono text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.student.rfidUid || activeOverlay.rfidUid || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">JENIS KELAMIN</span>
                            <strong className="text-white text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.student.gender === 'P' ? 'Perempuan (P)' : activeOverlay.student.gender === 'L' ? 'Laki-laki (L)' : '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">LOKASI GERBANG</span>
                            <strong className="text-emerald-400 text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.record?.gateName || gateTitle}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">WAKTU TAP</span>
                            <strong className="text-blue-300 font-mono text-sm font-bold break-words block mt-0.5 tabular-nums">
                              {activeOverlay.record?.timeFormatted 
                                ? `${activeOverlay.record.timeFormatted} WIB` 
                                : activeOverlay.scanTime || `${new Date().toLocaleTimeString('id-ID')} WIB`}
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className={`${activeOverlay.reason === 'OUTSIDE_HOURS' ? 'text-amber-400' : 'text-rose-400'} text-[10px] font-bold block uppercase tracking-wider`}>
                              {activeOverlay.reason === 'OUTSIDE_HOURS' ? 'STATUS MESIN' : 'STATUS KARTU'}
                            </span>
                            <strong className={`${activeOverlay.reason === 'OUTSIDE_HOURS' ? 'text-amber-200' : 'text-rose-200'} text-sm font-bold break-words block mt-0.5`}>
                              {activeOverlay.reason === 'OUTSIDE_HOURS' ? 'Mesin Terkunci' : 'Belum Terdaftar'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">UID RFID TERBACA</span>
                            <strong className="text-amber-300 font-mono text-sm font-bold break-words block mt-0.5">
                              {activeOverlay.rfidUid || '-'}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">LOKASI GERBANG</span>
                            <strong className="text-white text-sm font-bold break-words block mt-0.5">
                              {gateTitle}
                            </strong>
                          </div>
                          <div className="bg-[#070e20] p-2.5 rounded-sm border border-slate-800">
                            <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">WAKTU TAP</span>
                            <strong className="text-blue-300 font-mono text-sm font-bold break-words block mt-0.5 tabular-nums">
                              {activeOverlay.scanTime || `${new Date().toLocaleTimeString('id-ID')} WIB`}
                            </strong>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3-Second Visual Countdown Progress Line */}
                  <div className="w-full max-w-3xl mx-auto space-y-1.5 pt-2 shrink-0">
                    <div className="w-full bg-slate-900 rounded-none h-1.5 overflow-hidden border border-slate-800">
                      <motion.div
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 3, ease: "linear" }}
                        className={`h-full ${
                          activeOverlay.success
                            ? activeOverlay.status === 'TERLAMBAT'
                              ? 'bg-amber-500'
                              : activeOverlay.record?.type === 'PULANG'
                              ? 'bg-blue-600'
                              : 'bg-emerald-500'
                            : 'bg-rose-600'
                        }`}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono tracking-wide flex items-center justify-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-xs bg-slate-500" />
                      <span>Layar tertutup otomatis dalam 3 detik</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* STANDBY TAP CARD TARGET BOX (HIGH CONTRAST & DYNAMIC GREETING ON STANDBY) */
                <motion.div
                  key="standby-target"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full p-4 sm:p-6 lg:p-8 rounded-md border-2 border-dashed border-blue-300 text-center flex flex-col items-center justify-center transition-all bg-blue-50/40 hover:bg-blue-50/70"
                >
                  {/* Main Dynamic Greeting Title (Swiss / Functional Typographic Focus) */}
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 uppercase tracking-tight mb-2 leading-tight">
                    {dynamicGreeting}
                  </h2>

                  <p className="text-slate-600 font-normal text-xs sm:text-sm max-w-xl mx-auto mb-4 leading-relaxed shrink-0">
                    {isCheckoutSession
                      ? 'Tempelkan Kartu Pelajar RFID Anda ke alat pembaca sebelum keluar area sekolah'
                      : 'Tempelkan Kartu Pelajar RFID Anda ke alat pembaca di gerbang untuk verifikasi kehadiran'}
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 shrink-0">
                    {/* Active Reader Status */}
                    <div className="inline-flex items-center gap-2 bg-[#081226] border border-emerald-500/50 text-emerald-300 px-3.5 py-1.5 rounded text-xs font-mono font-bold shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>MESIN RFID READY ({gateTitle})</span>
                      {keystrokeBuffer.length > 0 && (
                        <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold font-mono ml-1.5 animate-pulse">
                          Membaca RFID...
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Quick Stats Row (DYNAMIC METRICS BASED ON OPERATIONAL SESSION) */}
          <AnimatePresence>
            {!activeOverlay && (
              <motion.div
                key="bottom-stats-row"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-center text-xs shrink-0 overflow-hidden"
              >
                {isKioskClosed ? (
                  /* LUAR JAM OPERASIONAL: TOTAL SISWA, HADIR HARI INI, SUDAH PULANG, TIDAK HADIR */
                  <>
                    <div className="bg-slate-50 p-1.5 sm:p-2 rounded-lg border border-slate-200 shadow-xs">
                      <span className="text-slate-500 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TOTAL SISWA</span>
                      <strong className="text-slate-900 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalStudents}</strong>
                    </div>
                    <div className="bg-emerald-50/80 p-1.5 sm:p-2 rounded-lg border border-emerald-200 shadow-xs">
                      <span className="text-emerald-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">HADIR HARI INI</span>
                      <strong className="text-emerald-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalPresentToday}</strong>
                    </div>
                    <div className="bg-blue-50/80 p-1.5 sm:p-2 rounded-lg border border-blue-200 shadow-xs">
                      <span className="text-blue-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">SUDAH PULANG</span>
                      <strong className="text-blue-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalCheckoutsToday}</strong>
                    </div>
                    <div className="bg-rose-50/80 p-1.5 sm:p-2 rounded-lg border border-rose-200 shadow-xs">
                      <span className="text-rose-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TIDAK HADIR</span>
                      <strong className="text-rose-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalAlpha}</strong>
                    </div>
                  </>
                ) : isCheckoutSession ? (
                  /* SESI PULANG: TOTAL SISWA, SISWA MASUK, SUDAH PULANG, BELUM PULANG */
                  <>
                    <div className="bg-slate-50 p-1.5 sm:p-2 rounded-lg border border-slate-200 shadow-xs">
                      <span className="text-slate-500 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TOTAL SISWA</span>
                      <strong className="text-slate-900 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalStudents}</strong>
                    </div>
                    <div className="bg-emerald-50/80 p-1.5 sm:p-2 rounded-lg border border-emerald-200 shadow-xs">
                      <span className="text-emerald-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">SISWA MASUK</span>
                      <strong className="text-emerald-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalPresentToday}</strong>
                    </div>
                    <div className="bg-blue-50/80 p-1.5 sm:p-2 rounded-lg border border-blue-200 shadow-xs">
                      <span className="text-blue-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">SUDAH PULANG</span>
                      <strong className="text-blue-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalCheckoutsToday}</strong>
                    </div>
                    <div className="bg-amber-50/80 p-1.5 sm:p-2 rounded-lg border border-amber-200 shadow-xs">
                      <span className="text-amber-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">BELUM PULANG</span>
                      <strong className="text-amber-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{Math.max(0, stats.totalPresentToday - stats.totalCheckoutsToday)}</strong>
                    </div>
                  </>
                ) : (
                  /* SESI MASUK: TOTAL SISWA, TEPAT WAKTU, TERLAMBAT, TIDAK MASUK */
                  <>
                    <div className="bg-slate-50 p-1.5 sm:p-2 rounded-lg border border-slate-200 shadow-xs">
                      <span className="text-slate-500 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TOTAL SISWA</span>
                      <strong className="text-slate-900 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalStudents}</strong>
                    </div>
                    <div className="bg-emerald-50/80 p-1.5 sm:p-2 rounded-lg border border-emerald-200 shadow-xs">
                      <span className="text-emerald-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TEPAT WAKTU</span>
                      <strong className="text-emerald-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalOnTime}</strong>
                    </div>
                    <div className="bg-amber-50/80 p-1.5 sm:p-2 rounded-lg border border-amber-200 shadow-xs">
                      <span className="text-amber-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TERLAMBAT</span>
                      <strong className="text-amber-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalLate}</strong>
                    </div>
                    <div className="bg-rose-50/80 p-1.5 sm:p-2 rounded-lg border border-rose-200 shadow-xs">
                      <span className="text-rose-700 text-[9px] sm:text-[10px] block font-bold uppercase truncate">TIDAK MASUK</span>
                      <strong className="text-rose-800 text-xs sm:text-sm lg:text-base font-black font-mono tabular-nums">{stats.totalAlpha}</strong>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* BOTTOM HORIZONTAL STRIP: ABSENSI TERKINI (HIDES ON TAP FOR EXPANDED HOVER VIEW) */}
        <AnimatePresence>
          {!activeOverlay && (
            <motion.div
              key="recent-attendance-bar"
              initial={{ opacity: 0, height: 0, scale: 0.98 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="bg-white border border-slate-200/90 rounded-lg p-2.5 sm:p-3 flex flex-col justify-between shadow-sm shrink-0 w-full overflow-hidden text-slate-900"
            >
              
              <div className="flex flex-wrap items-center justify-between pb-1.5 border-b border-slate-200 shrink-0 mb-2 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                      {isKioskClosed ? 'Rekap Absensi Hari Ini' : 'Feed Absensi & Urutan Kedatangan'}
                    </h3>
                  </div>

                  {/* Filter Tabs: Semua / Siswa / Guru */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setArrivalFeedTab('all')}
                      className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                        arrivalFeedTab === 'all'
                          ? 'bg-blue-600 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua Terkini ({allTodayLogs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setArrivalFeedTab('students')}
                      className={`px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1 ${
                        arrivalFeedTab === 'students'
                          ? 'bg-emerald-600 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <GraduationCap className="w-3 h-3" />
                      <span>Urutan Siswa ({studentArrivalsToday.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setArrivalFeedTab('teachers')}
                      className={`px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1 ${
                        arrivalFeedTab === 'teachers'
                          ? 'bg-blue-600 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>Urutan Guru ({teacherArrivalsToday.length})</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border font-bold flex items-center gap-1.5 ${
                    isKioskClosed
                      ? 'bg-slate-800 text-slate-400 border-slate-700'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-2xs ${isKioskClosed ? 'bg-slate-500' : 'bg-emerald-400'}`} />
                    {isKioskClosed ? 'STANDBY' : 'LIVE FEED'}
                  </span>
                  {!isKioskClosed && (
                    <span className="text-[10px] text-slate-500 font-semibold hidden sm:inline-block">
                      • Cooldown: {currentSchedule.cooldownSeconds}s
                    </span>
                  )}
                </div>
              </div>

              {/* HORIZONTAL GRID FOR TAP LOGS WITH RANKING */}
              {(() => {
                const logsToRender = arrivalFeedTab === 'students'
                  ? studentArrivalsToday.slice(0, 8)
                  : arrivalFeedTab === 'teachers'
                  ? teacherArrivalsToday.slice(0, 8)
                  : recentLogs.slice(0, 8);

                if (logsToRender.length === 0) {
                  return (
                    <div className="col-span-full text-center py-3 text-slate-500 font-bold text-xs bg-slate-50 rounded border border-dashed border-slate-200 p-2">
                      {arrivalFeedTab === 'students' 
                        ? 'Belum ada siswa yang hadir masuk hari ini.' 
                        : arrivalFeedTab === 'teachers'
                        ? 'Belum ada guru yang hadir masuk hari ini.'
                        : 'Belum ada data tap kartu hari ini.'}
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2 w-full">
                    {logsToRender.map((log, idx) => {
                      const isTeacher = log.userType === 'TEACHER' || !!log.teacherId || !!log.teacherName;
                      const matchedStudent = !isTeacher ? studentMap.get(log.studentId || log.rfidUid) : undefined;
                      const matchedTeacher = isTeacher ? teacherMap.get(log.teacherId || log.rfidUid) : undefined;
                      
                      const displayName = isTeacher 
                        ? (log.teacherName || matchedTeacher?.name || 'Guru') 
                        : (log.studentName || matchedStudent?.name || 'Siswa');
                      const subLabel = isTeacher 
                        ? (log.teacherPosition || matchedTeacher?.position || 'Guru / PTK') 
                        : (log.studentClass || matchedStudent?.class || 'Siswa');
                      const isLatestTapped = activeOverlay?.record?.id === log.id || idx === 0;
                      
                      // Calculate arrival rank
                      const isEntry = log.type === 'MASUK';
                      const rankNum = isEntry 
                        ? (isTeacher 
                            ? (log.teacherId ? teacherRankMap.get(log.teacherId) : undefined)
                            : (log.studentId ? studentRankMap.get(log.studentId) : undefined))
                        : undefined;

                      return (
                        <div
                          key={log.id}
                          className={`p-2 border rounded-lg flex items-center gap-2 transition-all shadow-xs relative ${
                            isLatestTapped && activeOverlay
                              ? 'ring-2 ring-blue-500 scale-[1.02] shadow-sm bg-blue-50/90 border-blue-400'
                              : 'bg-slate-50 border-slate-200/90 hover:border-blue-400 hover:bg-blue-50/40'
                          }`}
                        >
                          {/* Foto Kecil Siswa / Guru (Avatar Thumbnail) */}
                          <div className="relative shrink-0">
                            <UserAvatar
                              name={displayName}
                              avatarUrl={isTeacher ? matchedTeacher?.avatarUrl : matchedStudent?.avatarUrl}
                              gender={isTeacher ? matchedTeacher?.gender : matchedStudent?.gender}
                              role={isTeacher ? 'GURU' : 'SISWA'}
                              size="xs"
                              shape="square"
                              className="w-7 h-7 sm:w-8 sm:h-8"
                            />
                            {/* Lencana Urutan Hadir (#1, #2, dst) */}
                            {rankNum !== undefined && (
                              <span
                                className={`absolute -top-1.5 -left-1 text-[8px] font-black px-1 rounded shadow-2xs leading-tight ${
                                  rankNum === 1
                                    ? 'bg-amber-400 text-slate-950 font-black ring-1 ring-amber-500'
                                    : rankNum === 2
                                    ? 'bg-slate-300 text-slate-900 font-black ring-1 ring-slate-400'
                                    : rankNum === 3
                                    ? 'bg-amber-700 text-amber-50 font-black'
                                    : 'bg-slate-700 text-white font-bold'
                                }`}
                                title={`Nomor Urut Hadir #${rankNum}`}
                              >
                                #{rankNum}
                              </span>
                            )}
                          </div>

                          {/* Info Identitas, Waktu & Status */}
                          <div className="min-w-0 flex-1 flex flex-col justify-between overflow-hidden">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] font-mono text-slate-600 font-bold leading-none shrink-0">
                                {log.timeFormatted}
                              </span>
                              <span className={`px-1 py-0.2 text-[8px] font-black uppercase rounded shrink-0 leading-tight ${
                                log.status === 'TEPAT_WAKTU'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : log.status === 'TERLAMBAT'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-blue-100 text-blue-800 border border-blue-300'
                              }`}>
                                {log.status === 'TEPAT_WAKTU' ? 'TEPAT' : log.status === 'TERLAMBAT' ? 'TERLAMBAT' : log.status === 'PULANG_CEPAT' ? 'AWAL' : 'PULANG'}
                              </span>
                            </div>

                            <div className="min-w-0 mt-0.5">
                              <p className="font-black text-slate-900 text-xs truncate leading-tight" title={displayName}>
                                {displayName}
                              </p>
                              <span className="text-[9px] text-slate-500 font-semibold block truncate leading-tight">
                                {subLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* 3. FOOTER MARQUEE BANNER (PROPORTIONAL & HIGH CONTRAST) */}
      {(() => {
        const themeConfig = MARQUEE_THEMES_CONFIG[currentSchedule.marqueeTheme || 'gold'] || MARQUEE_THEMES_CONFIG.gold;
        const displayMode = currentSchedule.marqueeDisplayMode || 'marquee_scroll';
        const isCentered = displayMode === 'center_pulse' || displayMode === 'center_static';
        const isPulsing = displayMode === 'center_pulse';
        
        const speedClass = currentSchedule.marqueeSpeed === 'slow'
          ? 'animate-marquee-slow'
          : currentSchedule.marqueeSpeed === 'fast'
          ? 'animate-marquee-fast'
          : currentSchedule.marqueeSpeed === 'ultra_fast'
          ? 'animate-marquee-ultra-fast'
          : 'animate-marquee-normal';

        const fontSizeClass = currentSchedule.marqueeFontSize === 'sm'
          ? 'text-xs sm:text-sm lg:text-base font-bold'
          : currentSchedule.marqueeFontSize === 'lg'
          ? 'text-base sm:text-lg lg:text-xl font-black'
          : currentSchedule.marqueeFontSize === 'xl'
          ? 'text-lg sm:text-xl lg:text-2xl font-black'
          : 'text-sm sm:text-base lg:text-lg font-extrabold';

        const badgeIcon = currentSchedule.marqueeBadgeIcon || (isCheckoutSession ? <LogOut className="w-3.5 h-3.5" /> : <Megaphone className="w-3.5 h-3.5" />);
        const badgeText = currentSchedule.marqueeBadgeText || (isCheckoutSession ? 'SESI PULANG' : 'PENGUMUMAN');
        const announcementText = isCheckoutSession
          ? (currentSchedule.announcementTextExit || currentSchedule.announcementText || 'Selamat Pulang Siswa-Siswi & Guru SMK Ekonomika Depok! Hati-hati di perjalanan pulang.')
          : (currentSchedule.announcementTextEntry || currentSchedule.announcementText || 'Selamat Datang di SMK Ekonomika Depok! Awali hari dengan disiplin & tap kartu RFID.');

        return (
          <div className={`${themeConfig.bgClass} border-2 ${themeConfig.borderClass} ${themeConfig.accentGlowClass} rounded-md h-12 sm:h-14 lg:h-16 flex items-center px-3 sm:px-4 overflow-hidden shadow-lg shrink-0 w-full relative transition-all duration-300`}>
            
            {/* Badge Indicator */}
            <div className={`flex items-center gap-1.5 ${themeConfig.badgeBgClass} px-3 sm:px-4 py-1 sm:py-1.5 rounded text-xs font-black shrink-0 shadow-md z-10 mr-3 select-none`}>
              <span className="text-sm leading-none flex items-center justify-center">{badgeIcon}</span>
              <span className={`uppercase tracking-wider text-[11px] sm:text-xs ${themeConfig.badgeTextClass} font-black hidden xs:inline`}>
                {badgeText}
              </span>
            </div>

            {/* Mode 1: Center Mode (Static or Pulsing Glow) */}
            {isCentered ? (
              <div className="flex-1 flex items-center justify-center text-center overflow-hidden px-2">
                <div className={`flex items-center justify-center gap-2 max-w-full ${isPulsing ? 'animate-pulse-glow' : ''}`}>
                  <span className={`${fontSizeClass} ${themeConfig.textClass} uppercase tracking-wide truncate block`}>
                    {announcementText}
                  </span>
                </div>
              </div>
            ) : (
              /* Mode 2: Continuous Marquee Scrolling */
              <div className="overflow-hidden whitespace-nowrap flex-1 flex items-center">
                <div className={`${speedClass} gap-12 flex items-center`}>
                  <span className={`shrink-0 ${fontSizeClass} ${themeConfig.textClass} uppercase tracking-wide`}>
                    {announcementText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  </span>
                  <span className={`shrink-0 ${fontSizeClass} ${themeConfig.textClass} uppercase tracking-wide`}>
                    {announcementText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  </span>
                </div>
              </div>
            )}

            <div className="hidden md:flex items-center gap-1.5 ml-3 shrink-0 z-10">
              <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400" />
              <span className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider">LIVE</span>
            </div>

          </div>
        );
      })()}

      {/* MODAL STATUS KONEKSI & DIAGNOSTIK DATABASE / AUTO-SAVE OFFLINE */}
      <OfflineSyncModal
        isOpen={isDbInfoModalOpen}
        onClose={() => setIsDbInfoModalOpen(false)}
        onSyncCompleted={() => {
          refreshLogsAndStats();
        }}
      />

      {/* KIOSK LOCKED & WINDOWED MODE WARNING / RE-ENTER FULLSCREEN GUARDIAN */}
      <AnimatePresence>
        {isKioskLocked && !isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-amber-500 text-slate-100 px-4 py-2.5 rounded-md shadow-2xl backdrop-blur-md flex items-center gap-3 max-w-lg w-[94%]"
          >
            <div className="p-2 rounded bg-amber-500/20 text-amber-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-300">Mode Kiosk Terkunci</p>
              <p className="text-[11px] text-slate-300 truncate">Layar penuh tidak aktif. Masuk kembali untuk mengunci tampilan.</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-black transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Layar Penuh</span>
              </button>
              <button
                type="button"
                onClick={handleToggleLock}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs transition-colors cursor-pointer"
                title="Buka Kunci PIN"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KIOSK PIN SECURITY MODAL */}
      <KioskPinModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingProtectedAction(null);
        }}
        onSuccess={handleUnlockSuccess}
        title={pinModalTitle}
        subtitle="Masukkan 4-6 Digit PIN Keamanan Kiosk untuk Melanjutkan"
      />

      {/* EARLY CHECKOUT MODAL (IZIN PULANG AWAL KBM) */}
      {earlyCheckoutStudent && (
        <EarlyCheckoutModal
          isOpen={isEarlyCheckoutModalOpen}
          student={earlyCheckoutStudent}
          gateLocation={gateLocation}
          isMuted={isMuted}
          onClose={() => {
            setIsEarlyCheckoutModalOpen(false);
            setEarlyCheckoutStudent(null);
          }}
          onSuccess={(res) => {
            refreshLogsAndStats();
            setActiveOverlay({
              ...res,
              scanTime: `${new Date().toLocaleTimeString('id-ID')} WIB`
            });
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => {
              setActiveOverlay(null);
            }, 3000);
          }}
        />
      )}

    </div>
  );
};
