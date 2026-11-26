import { 
  Student, 
  Teacher, 
  SchoolSchedule, 
  AttendanceRecord, 
  GateLocation, 
  AttendanceAttemptResult, 
  AttendanceStats, 
  TeacherAttendanceStats, 
  StudentLateRankItem, 
  StudentEarlyRankItem, 
  TeacherLateRankItem,
  TeacherEarlyRankItem,
  Role,
  SystemUser, 
  LateFollowUpAction, 
  LateFollowUpStatus, 
  UserSession,
  DailyAttendanceRecap,
  ClassAttendanceSummary,
  OfflineSyncQueueItem,
  OfflineSyncStatus,
  OfflineSyncSummary,
  AlumniStudent,
  AcademicYearArchive
} from '../types';
import { initialSchedule, initialStudents, initialTeachers, initialSystemUsers, getInitialAttendanceLogs } from '../data/initialData';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from './firebase';
import { createNewSession, detectDeviceInfo } from './deviceDetector';
import { getDefaultPermissionsForRole } from './permissions';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  query,
  limit,
  Unsubscribe
} from 'firebase/firestore';

const STORAGE_KEYS = {
  STUDENTS: 'rfid_app_students_v1',
  TEACHERS: 'rfid_app_teachers_v1',
  SCHEDULE: 'rfid_app_schedule_v1',
  ATTENDANCE: 'rfid_app_attendance_v1',
  CLASSES: 'rfid_app_classes_v1',
  SYSTEM_USERS: 'rfid_app_system_users_v1',
  LATE_FOLLOWUPS: 'rfid_app_late_followups_v1',
  DAILY_RECAPS: 'rfid_app_daily_recaps_v1',
  LAST_ACTIVE_DATE: 'rfid_app_last_active_date_v1',
  CLOUD_SYNC_STATUS: 'rfid_app_cloud_sync_v1',
  KIOSK_PIN: 'rfid_app_kiosk_pin_v1',
  KIOSK_LOCKED: 'rfid_app_kiosk_locked_v1',
  CURRENT_SESSION_ID: 'rfid_current_session_id',
  CURRENT_USER_ID: 'rfid_current_user_id',
  OFFLINE_PENDING_QUEUE: 'rfid_offline_pending_queue_v1',
  OFFLINE_SYNC_LOGS: 'rfid_offline_sync_logs_v1',
  SIMULATE_OFFLINE: 'rfid_simulate_offline_mode_v1',
  LAST_SYNC_TIME: 'rfid_last_sync_time_v1',
  ALUMNI: 'rfid_app_alumni_students_v1',
  ACADEMIC_ARCHIVES: 'rfid_app_academic_archives_v1',
  THEME: 'rfid_theme_preference_v1',
};

// Date helper for consistent local date calculation (WIB / Indonesian local timezone)
export function getLocalTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getIndonesianDayName(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[d.getDay()] || 'Senin';
}

// In-memory fallback for environments where window.localStorage is restricted or throws SecurityError
const inMemoryStorage = new Map<string, string>();

export function safeStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return inMemoryStorage.get(key) || null;
  try {
    const val = window.localStorage.getItem(key);
    return val !== null ? val : (inMemoryStorage.get(key) || null);
  } catch {
    return inMemoryStorage.get(key) || null;
  }
}

export function safeStorageSet(key: string, value: string): void {
  inMemoryStorage.set(key, value);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Memory store handles retention
  }
}

export function safeStorageRemove(key: string): void {
  inMemoryStorage.delete(key);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

// BroadcastChannel for cross-tab & cross-window instant real-time synchronization with try-catch guard
let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function') {
    syncChannel = new BroadcastChannel('rfid_attendance_sync_channel');
  }
} catch (e) {
  console.warn('BroadcastChannel not available or restricted:', e);
  syncChannel = null;
}

export const SESSION_MAX_DURATION_MS = 60 * 60 * 1000; // 1 Jam Maksimal (60 menit)
export const MAX_ACTIVE_DEVICES_PER_ACCOUNT = 2; // Maksimal 2 perangkat per akun

let isFirestoreInitialized = false;
let unsubscribers: Unsubscribe[] = [];

export interface DatabaseBackup {
  appVersion: string;
  exportDate: string;
  schoolName: string;
  counts: {
    students: number;
    teachers: number;
    classes: number;
    attendanceRecords: number;
    systemUsers?: number;
  };
  data: {
    students: Student[];
    teachers: Teacher[];
    classes: string[];
    schedule: SchoolSchedule;
    attendanceRecords: AttendanceRecord[];
    systemUsers?: SystemUser[];
  };
}

export class AttendanceStorage {
  private static isCloudConnected = true;

  // --- INITIALIZE CLOUD SYNC WITH FIRESTORE (MULTI-DEVICE REAL-TIME PERSISTENCE) ---
  static initCloudSync(onSyncChange?: (status: 'connected' | 'offline' | 'synced') => void) {
    if (typeof window === 'undefined' || isFirestoreInitialized) return;
    isFirestoreInitialized = true;

    try {
      // 1. Subscribe to Students Collection
      const studentsCol = collection(db, 'students');
      const unsubStudents = onSnapshot(studentsCol, (snapshot) => {
        const cloudStudents: Student[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as Student;
          if (data && data.id && data.name) {
            cloudStudents.push(data);
          }
        });
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(cloudStudents));
        this.broadcastSync('STUDENTS_UPDATED');
        if (onSyncChange) onSyncChange('synced');
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'students');
        this.isCloudConnected = false;
        if (onSyncChange) onSyncChange('offline');
      });

      // 2. Subscribe to Teachers Collection
      const teachersCol = collection(db, 'teachers');
      const unsubTeachers = onSnapshot(teachersCol, (snapshot) => {
        const cloudTeachers: Teacher[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as Teacher;
          if (data && data.id && data.name) {
            cloudTeachers.push(data);
          }
        });
        localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(cloudTeachers));
        this.broadcastSync('TEACHERS_UPDATED');
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'teachers');
      });

      // 3. Subscribe to Classes Collection
      const classesCol = collection(db, 'classes');
      const unsubClasses = onSnapshot(classesCol, (snapshot) => {
        const cloudClasses: string[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data?.name) cloudClasses.push(data.name);
        });
        const sorted = Array.from(new Set(cloudClasses)).sort();
        localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(sorted));
        this.broadcastSync('CLASSES_UPDATED', sorted);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'classes');
      });

      // 4. Subscribe to Settings / Schedule
      let hasSyncedScheduleOnce = false;
      const settingsDoc = doc(db, 'settings', 'school_schedule');
      const unsubSettings = onSnapshot(settingsDoc, (docSnap) => {
        if (docSnap.exists()) {
          const cloudSchedule = docSnap.data() as SchoolSchedule;
          localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(cloudSchedule));
          this.broadcastSync('SCHEDULE_UPDATED');
        } else if (!hasSyncedScheduleOnce) {
          hasSyncedScheduleOnce = true;
          const localSchedule = this.getSchedule();
          this.syncScheduleToCloud(localSchedule);
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'settings/school_schedule');
      });

      // 5. Subscribe to Attendance Records (Real-time Tap Log Sync Across Devices)
      const recordsCol = collection(db, 'attendance_records');
      const unsubRecords = onSnapshot(recordsCol, (snapshot) => {
        const cloudRecords: AttendanceRecord[] = [];
        if (!snapshot.empty) {
          snapshot.forEach(docSnap => {
            cloudRecords.push(docSnap.data() as AttendanceRecord);
          });
        }

        // Merge with locally pending offline records to prevent data loss!
        const pendingQueue = this.getPendingSyncQueue();
        const pendingRecordIds = new Set(pendingQueue.filter(q => q.entity === 'ATTENDANCE_RECORD').map(q => q.id));
        const currentLocal = this.getAttendanceRecords();
        const pendingLocal = currentLocal.filter(r => pendingRecordIds.has(r.id));

        const mergedMap = new Map<string, AttendanceRecord>();
        // Add cloud records
        cloudRecords.forEach(r => mergedMap.set(r.id, r));
        // Add pending local records that might not be in cloud yet
        pendingLocal.forEach(r => mergedMap.set(r.id, r));

        const finalList = Array.from(mergedMap.values());
        finalList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(finalList));
        this.broadcastSync('ATTENDANCE_UPDATED');
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'attendance_records');
        this.isCloudConnected = false;
        if (onSyncChange) onSyncChange('offline');
      });

      // 6. Subscribe to System Users Collection (Admin / Guru Piket / Kesiswaan Accounts)
      let hasSeededUsersOnce = false;
      const usersCol = collection(db, 'system_users');
      const unsubUsers = onSnapshot(usersCol, (snapshot) => {
        if (!snapshot.empty) {
          const cloudUsers: SystemUser[] = [];
          snapshot.forEach(docSnap => {
            cloudUsers.push(docSnap.data() as SystemUser);
          });
          localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(cloudUsers));
          this.broadcastSync('USERS_UPDATED');
        } else if (!hasSeededUsersOnce) {
          hasSeededUsersOnce = true;
          const localUsers = this.getSystemUsers();
          this.seedSystemUsersToCloud(localUsers);
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'system_users');
      });

      // 7. Subscribe to Late Follow-ups Collection (Tindak Lanjut Siswa Terlambat)
      const followUpsCol = collection(db, 'late_followups');
      const unsubFollowUps = onSnapshot(followUpsCol, (snapshot) => {
        if (!snapshot.empty) {
          const map: Record<string, LateFollowUpAction> = {};
          snapshot.forEach(docSnap => {
            const data = docSnap.data() as LateFollowUpAction;
            if (data.studentId) {
              map[data.studentId] = data;
            }
          });
          localStorage.setItem(STORAGE_KEYS.LATE_FOLLOWUPS, JSON.stringify(map));
          this.broadcastSync('FOLLOWUPS_UPDATED');
        } else {
          localStorage.setItem(STORAGE_KEYS.LATE_FOLLOWUPS, JSON.stringify({}));
          this.broadcastSync('FOLLOWUPS_UPDATED');
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'late_followups');
      });

      // 8. Subscribe to Daily Attendance Recaps Collection (Arsip Rekap Harian Otomatis)
      const recapsCol = collection(db, 'daily_attendance_recap');
      const unsubRecaps = onSnapshot(recapsCol, (snapshot) => {
        if (!snapshot.empty) {
          const cloudRecaps: DailyAttendanceRecap[] = [];
          snapshot.forEach(docSnap => {
            cloudRecaps.push(docSnap.data() as DailyAttendanceRecap);
          });
          cloudRecaps.sort((a, b) => b.dateFormatted.localeCompare(a.dateFormatted));
          localStorage.setItem(STORAGE_KEYS.DAILY_RECAPS, JSON.stringify(cloudRecaps));
          this.broadcastSync('DAILY_RECAPS_SYNCED');
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'daily_attendance_recap');
      });

      unsubscribers = [unsubStudents, unsubTeachers, unsubClasses, unsubSettings, unsubRecords, unsubUsers, unsubFollowUps, unsubRecaps];
      this.isCloudConnected = true;

      // Check day rollover on sync initialization
      this.checkAndProcessDayRollover();

      // Register browser network event listeners
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          this.isCloudConnected = true;
          this.broadcastSync('NETWORK_STATUS_CHANGED', { isOnline: true });
          if (onSyncChange) onSyncChange('connected');
          // Auto-sync pending offline queue immediately upon reconnect!
          this.processOfflineSyncQueue();
        });

        window.addEventListener('offline', () => {
          this.isCloudConnected = false;
          this.broadcastSync('NETWORK_STATUS_CHANGED', { isOnline: false });
          if (onSyncChange) onSyncChange('offline');
        });

        // Periodic background queue flush every 20 seconds if online and queue > 0
        setInterval(() => {
          if (this.isNetworkOnline() && this.getPendingSyncQueue().length > 0) {
            this.processOfflineSyncQueue();
          }
        }, 20000);
      }

      if (onSyncChange) onSyncChange('connected');
    } catch (err) {
      console.warn('Firestore real-time sync initialization fallback:', err);
      this.isCloudConnected = false;
      if (onSyncChange) onSyncChange('offline');
    }
  }

  // --- OFFLINE AUTO-SAVE & BACKGROUND SYNC ENGINE ---
  static getPendingSyncQueue(): OfflineSyncQueueItem[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_PENDING_QUEUE);
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static savePendingSyncQueue(queue: OfflineSyncQueueItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.OFFLINE_PENDING_QUEUE, JSON.stringify(queue));
    this.broadcastSync('OFFLINE_QUEUE_UPDATED', { count: queue.length });
  }

  static addToSyncQueue(item: OfflineSyncQueueItem): void {
    const queue = this.getPendingSyncQueue();
    const existingIdx = queue.findIndex(q => q.id === item.id && q.entity === item.entity);
    if (existingIdx >= 0) {
      queue[existingIdx] = {
        ...queue[existingIdx],
        ...item,
        retryCount: queue[existingIdx].retryCount + 1
      };
    } else {
      queue.push(item);
    }
    this.savePendingSyncQueue(queue);
  }

  static removeFromSyncQueue(id: string): void {
    const queue = this.getPendingSyncQueue();
    const filtered = queue.filter(q => q.id !== id);
    this.savePendingSyncQueue(filtered);
  }

  static clearSyncQueue(): void {
    this.savePendingSyncQueue([]);
  }

  static getSimulateOffline(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEYS.SIMULATE_OFFLINE) === 'true';
  }

  static setSimulateOffline(simulate: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.SIMULATE_OFFLINE, simulate ? 'true' : 'false');
    this.broadcastSync('SIMULATE_OFFLINE_CHANGED', { simulate });
    this.broadcastSync('NETWORK_STATUS_CHANGED', { isOnline: this.isNetworkOnline() });
  }

  static isNetworkOnline(): boolean {
    if (typeof window === 'undefined') return true;
    if (this.getSimulateOffline()) return false;
    const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return navOnline && this.isCloudConnected;
  }

  static getLastSyncTime(): string {
    if (typeof window === 'undefined') return 'Belum ada';
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME) || 'Belum ada';
  }

  static setLastSyncTime(timeStr: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, timeStr);
  }

  static getSyncSummary(): OfflineSyncSummary {
    const queue = this.getPendingSyncQueue();
    const isOnline = this.isNetworkOnline();
    const isSim = this.getSimulateOffline();

    let status: OfflineSyncStatus = 'online_synced';
    if (!isOnline) {
      status = 'offline_auto_save';
    } else if (queue.length > 0) {
      status = 'syncing';
    }

    return {
      isOnline,
      isSimulatedOffline: isSim,
      status,
      pendingQueueCount: queue.length,
      lastSyncTime: this.getLastSyncTime()
    };
  }

  static async processOfflineSyncQueue(): Promise<{
    success: boolean;
    total: number;
    syncedCount: number;
    failedCount: number;
    message: string;
  }> {
    const queue = this.getPendingSyncQueue();
    if (queue.length === 0) {
      return { success: true, total: 0, syncedCount: 0, failedCount: 0, message: 'Antrian offline kosong, semua data telah sinkron.' };
    }

    if (!this.isNetworkOnline()) {
      return { 
        success: false, 
        total: queue.length, 
        syncedCount: 0, 
        failedCount: queue.length, 
        message: 'Tidak dapat menyinkronkan: Perangkat sedang dalam mode offline.' 
      };
    }

    this.broadcastSync('OFFLINE_SYNC_STARTED', { count: queue.length });

    let syncedCount = 0;
    const remainingQueue: OfflineSyncQueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.entity === 'ATTENDANCE_RECORD') {
          await setDoc(doc(db, 'attendance_records', item.id), sanitizeForFirestore(item.payload));
          syncedCount++;
        } else if (item.entity === 'STUDENT') {
          await setDoc(doc(db, 'students', item.id), sanitizeForFirestore(item.payload));
          syncedCount++;
        } else if (item.entity === 'TEACHER') {
          await setDoc(doc(db, 'teachers', item.id), sanitizeForFirestore(item.payload));
          syncedCount++;
        } else if (item.entity === 'DAILY_RECAP') {
          await setDoc(doc(db, 'daily_attendance_recap', item.id), sanitizeForFirestore(item.payload));
          syncedCount++;
        } else if (item.entity === 'FOLLOWUP') {
          await setDoc(doc(db, 'late_followups', item.id), sanitizeForFirestore(item.payload));
          syncedCount++;
        } else {
          syncedCount++;
        }
      } catch (err) {
        console.warn(`Failed to sync offline item ${item.id}:`, err);
        remainingQueue.push({
          ...item,
          retryCount: item.retryCount + 1,
          lastError: err instanceof Error ? err.message : String(err)
        });
      }
    }

    this.savePendingSyncQueue(remainingQueue);
    const nowStr = new Date().toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
    this.setLastSyncTime(nowStr);

    this.broadcastSync('OFFLINE_SYNC_COMPLETED', {
      syncedCount,
      remainingCount: remainingQueue.length,
      timestamp: nowStr
    });

    const msg = syncedCount > 0 
      ? `Sinkronisasi selesai: ${syncedCount} data offline berhasil diunggah ke database online.`
      : `Sinkronisasi tertunda: Terjadi kendala koneksi ke database online.`;

    return {
      success: remainingQueue.length === 0,
      total: queue.length,
      syncedCount,
      failedCount: remainingQueue.length,
      message: msg
    };
  }

  // Emergency Backup Export Utilities (Offline Data Safety)
  static exportOfflineBackupJson(): void {
    const backupData = {
      appVersion: '2.5.0-offline-autosave',
      exportDate: new Date().toISOString(),
      schoolName: this.getSchedule().schoolName,
      stats: {
        totalAttendance: this.getAttendanceRecords().length,
        pendingQueueCount: this.getPendingSyncQueue().length,
        totalStudents: this.getStudents().length,
        totalTeachers: this.getTeachers().length
      },
      pendingQueue: this.getPendingSyncQueue(),
      attendanceRecords: this.getAttendanceRecords(),
      students: this.getStudents(),
      teachers: this.getTeachers(),
      dailyRecaps: this.getDailyRecaps()
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = this.getTodayDate();
    link.download = `Backup_Data_Offline_RFID_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static exportOfflinePendingCsv(): void {
    const queue = this.getPendingSyncQueue();
    const attendanceItems = queue.filter(q => q.entity === 'ATTENDANCE_RECORD');

    const headers = ['No', 'ID Catatan', 'Waktu Tap', 'Tipe', 'NISN / NIP', 'Nama', 'Kelas / Jabatan', 'Status', 'Pintu Gerbang', 'Keterangan'];
    const rows = attendanceItems.map((item, idx) => {
      const rec = item.payload as AttendanceRecord;
      return [
        idx + 1,
        `"${rec.id}"`,
        `"${rec.timestamp}"`,
        `"${rec.userType || 'STUDENT'}"`,
        `"${rec.nisn || rec.nip || '-'}"`,
        `"${rec.studentName || rec.teacherName || '-'}"`,
        `"${rec.studentClass || rec.teacherPosition || '-'}"`,
        `"${rec.status || '-'}"`,
        `"${rec.gateName || '-'}"`,
        `"${rec.notes || 'Dicatat dalam Mode Offline'}"`
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.map(h => `"${h}"`).join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Antrian_Absensi_Offline_${this.getTodayDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Helper cloud seeders
  private static async seedSystemUsersToCloud(users: SystemUser[]) {
    try {
      const batch = writeBatch(db);
      for (const u of users) {
        const ref = doc(db, 'system_users', u.id);
        batch.set(ref, sanitizeForFirestore(u));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_users');
    }
  }

  private static async seedStudentsToCloud(students: Student[]) {
    try {
      const batch = writeBatch(db);
      for (const s of students) {
        const ref = doc(db, 'students', s.id);
        batch.set(ref, sanitizeForFirestore(s));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    }
  }

  private static async seedTeachersToCloud(teachers: Teacher[]) {
    try {
      const batch = writeBatch(db);
      for (const t of teachers) {
        const ref = doc(db, 'teachers', t.id);
        batch.set(ref, sanitizeForFirestore(t));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'teachers');
    }
  }

  private static async seedClassesToCloud(classes: string[]) {
    try {
      const snap = await getDocs(collection(db, 'classes'));
      const batch = writeBatch(db);
      const cleanLower = new Set(classes.map(c => c.trim().toLowerCase()));

      snap.forEach(docSnap => {
        const data = docSnap.data();
        const docName = (data.name || '').trim().toLowerCase();
        const docId = docSnap.id.toLowerCase();
        if (!cleanLower.has(docName) && !cleanLower.has(docId)) {
          batch.delete(docSnap.ref);
        }
      });

      for (const c of classes) {
        const id = c.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const ref = doc(db, 'classes', id);
        batch.set(ref, sanitizeForFirestore({ id, name: c }));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'classes');
    }
  }

  private static async seedAttendanceToCloud(records: AttendanceRecord[]) {
    try {
      const batch = writeBatch(db);
      const slice = records.slice(0, 400);
      for (const r of slice) {
        const ref = doc(db, 'attendance_records', r.id);
        batch.set(ref, sanitizeForFirestore(r));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendance_records');
    }
  }

  private static async syncScheduleToCloud(schedule: SchoolSchedule) {
    try {
      await setDoc(doc(db, 'settings', 'school_schedule'), sanitizeForFirestore(schedule));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/school_schedule');
    }
  }

  // --- STUDENTS MANAGEMENT ---
  static getStudents(): Student[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (!data) return [];
    try {
      const parsed: Student[] = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async saveStudents(students: Student[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    this.broadcastSync('STUDENTS_UPDATED');

    // Sync in background to Cloud Firestore
    try {
      const snap = await getDocs(collection(db, 'students'));
      const activeIds = new Set(students.map(s => s.id));
      const batch = writeBatch(db);

      // Cleanly delete documents no longer present in current students list
      snap.forEach(docSnap => {
        if (!activeIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });

      // Upsert current students
      for (const s of students) {
        batch.set(doc(db, 'students', s.id), sanitizeForFirestore(s));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    }
  }

  static addStudent(student: Student) {
    const students = this.getStudents();
    const updated = [student, ...students];
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
    this.broadcastSync('STUDENTS_UPDATED');

    // Write to Firestore
    setDoc(doc(db, 'students', student.id), sanitizeForFirestore(student)).catch(err => {
      handleFirestoreError(err, OperationType.CREATE, `students/${student.id}`);
    });

    return updated;
  }

  static updateStudent(student: Student) {
    const students = this.getStudents();
    const updated = students.map(s => s.id === student.id ? student : s);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
    this.broadcastSync('STUDENTS_UPDATED');

    // Write to Firestore
    setDoc(doc(db, 'students', student.id), sanitizeForFirestore(student)).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
    });

    return updated;
  }

  static deleteStudent(studentId: string) {
    const students = this.getStudents();
    const updated = students.filter(s => s.id !== studentId);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
    this.broadcastSync('STUDENTS_UPDATED');

    // Delete from Firestore
    deleteDoc(doc(db, 'students', studentId)).catch(err => {
      handleFirestoreError(err, OperationType.DELETE, `students/${studentId}`);
    });

    return updated;
  }

  static bulkDeleteStudents(studentIds: string[]) {
    const idSet = new Set(studentIds);
    const students = this.getStudents();
    const updated = students.filter(s => !idSet.has(s.id));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
    this.broadcastSync('STUDENTS_UPDATED');

    // Atomic batch delete in Firestore
    try {
      const batch = writeBatch(db);
      for (const id of studentIds) {
        batch.delete(doc(db, 'students', id));
      }
      batch.commit().catch(err => {
        handleFirestoreError(err, OperationType.DELETE, 'students/bulk');
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'students/bulk');
    }

    return updated;
  }

  static async clearAllStudents() {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify([]));
    this.broadcastSync('STUDENTS_UPDATED');

    try {
      const snap = await getDocs(collection(db, 'students'));
      const batch = writeBatch(db);
      snap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'students/all');
    }
    return [];
  }

  // --- TEACHERS MANAGEMENT ---
  static getTeachers(): Teacher[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    if (!data) return [];
    try {
      const parsed: Teacher[] = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async saveTeachers(teachers: Teacher[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
    this.broadcastSync('TEACHERS_UPDATED');

    // Sync to Cloud Firestore with cleanup of removed docs
    try {
      const snap = await getDocs(collection(db, 'teachers'));
      const activeIds = new Set(teachers.map(t => t.id));
      const batch = writeBatch(db);

      snap.forEach(docSnap => {
        if (!activeIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });

      for (const t of teachers) {
        batch.set(doc(db, 'teachers', t.id), sanitizeForFirestore(t));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'teachers');
    }
  }

  static addTeacher(teacher: Teacher) {
    const teachers = this.getTeachers();
    const updated = [teacher, ...teachers];
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(updated));
    this.broadcastSync('TEACHERS_UPDATED');

    setDoc(doc(db, 'teachers', teacher.id), sanitizeForFirestore(teacher)).catch(err => {
      handleFirestoreError(err, OperationType.CREATE, `teachers/${teacher.id}`);
    });

    return updated;
  }

  static updateTeacher(teacher: Teacher) {
    const teachers = this.getTeachers();
    const updated = teachers.map(t => t.id === teacher.id ? teacher : t);
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(updated));
    this.broadcastSync('TEACHERS_UPDATED');

    setDoc(doc(db, 'teachers', teacher.id), sanitizeForFirestore(teacher)).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `teachers/${teacher.id}`);
    });

    return updated;
  }

  static deleteTeacher(teacherId: string) {
    const teachers = this.getTeachers();
    const updated = teachers.filter(t => t.id !== teacherId);
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(updated));
    this.broadcastSync('TEACHERS_UPDATED');

    deleteDoc(doc(db, 'teachers', teacherId)).catch(err => {
      handleFirestoreError(err, OperationType.DELETE, `teachers/${teacherId}`);
    });

    return updated;
  }

  static bulkDeleteTeachers(teacherIds: string[]) {
    const idSet = new Set(teacherIds);
    const teachers = this.getTeachers();
    const updated = teachers.filter(t => !idSet.has(t.id));
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(updated));
    this.broadcastSync('TEACHERS_UPDATED');

    try {
      const batch = writeBatch(db);
      for (const id of teacherIds) {
        batch.delete(doc(db, 'teachers', id));
      }
      batch.commit().catch(err => {
        handleFirestoreError(err, OperationType.DELETE, 'teachers/bulk');
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'teachers/bulk');
    }

    return updated;
  }

  static async clearAllTeachers() {
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify([]));
    this.broadcastSync('TEACHERS_UPDATED');

    try {
      const snap = await getDocs(collection(db, 'teachers'));
      const batch = writeBatch(db);
      snap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'teachers/all');
    }
    return [];
  }

  // --- RFID DUAL-ROLE CONFLICT CHECKER ---
  static isRfidUidTaken(
    uid: string,
    targetType: 'student' | 'teacher',
    excludeId?: string
  ): { taken: boolean; ownerType?: 'TEACHER' | 'STUDENT'; ownerName?: string; reason?: string } {
    const cleanUid = (uid || '').trim().toUpperCase();
    if (!cleanUid) return { taken: false };

    const students = this.getStudents();
    const teachers = this.getTeachers();

    // Check collision in teachers collection
    const matchedTeacher = teachers.find(t => 
      t.rfidUid && t.rfidUid.trim().toUpperCase() === cleanUid && t.id !== excludeId
    );
    if (matchedTeacher) {
      return {
        taken: true,
        ownerType: 'TEACHER',
        ownerName: matchedTeacher.name,
        reason: `UID [${cleanUid}] sudah terdaftar sebagai Guru/Pegawai: "${matchedTeacher.name}" (${matchedTeacher.position || 'Guru'})`
      };
    }

    // Check collision in students collection
    const matchedStudent = students.find(s => 
      s.rfidUid && s.rfidUid.trim().toUpperCase() === cleanUid && s.id !== excludeId
    );
    if (matchedStudent) {
      return {
        taken: true,
        ownerType: 'STUDENT',
        ownerName: matchedStudent.name,
        reason: `UID [${cleanUid}] sudah terdaftar sebagai Siswa: "${matchedStudent.name}" (${matchedStudent.class})`
      };
    }

    return { taken: false };
  }

  // --- CLASSES MANAGEMENT ---
  static getClasses(): string[] {
    if (typeof window === 'undefined') {
      return [];
    }
    const data = safeStorageGet(STORAGE_KEYS.CLASSES);
    if (!data) return [];
    try {
      const parsed: string[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(parsed.map(c => typeof c === 'string' ? c.trim() : '').filter(Boolean))).sort();
    } catch {
      return [];
    }
  }

  static saveClasses(classes: string[]) {
    if (typeof window === 'undefined') return [];
    const cleanList = Array.from(new Set(classes.map(c => typeof c === 'string' ? c.trim() : '').filter(Boolean))).sort();
    safeStorageSet(STORAGE_KEYS.CLASSES, JSON.stringify(cleanList));
    this.broadcastSync('CLASSES_UPDATED', cleanList);

    // Sync to Firestore
    this.seedClassesToCloud(cleanList);
    return cleanList;
  }

  static addClass(className: string): { success: boolean; message: string; classes: string[] } {
    const clean = className.trim();
    if (!clean) {
      return { success: false, message: 'Nama kelas tidak boleh kosong!', classes: this.getClasses() };
    }
    const current = this.getClasses();
    if (current.some(c => c.trim().toLowerCase() === clean.toLowerCase())) {
      return { success: false, message: `Kelas "${clean}" sudah ada dalam database!`, classes: current };
    }
    const updated = Array.from(new Set([...current, clean])).sort();
    this.saveClasses(updated);

    // Write to Firestore
    const classId = clean.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    setDoc(doc(db, 'classes', classId), { id: classId, name: clean }).catch(err => {
      handleFirestoreError(err, OperationType.CREATE, `classes/${classId}`);
    });

    return { success: true, message: `Kelas "${clean}" berhasil ditambahkan!`, classes: updated };
  }

  static addClasses(classNames: string[]): { success: boolean; addedCount: number; message: string; classes: string[] } {
    const current = this.getClasses();
    const currentLower = new Set(current.map(c => c.trim().toLowerCase()));
    let addedCount = 0;
    const toAdd: string[] = [];

    for (const raw of classNames) {
      const clean = (typeof raw === 'string' ? raw : '').trim();
      if (clean && !currentLower.has(clean.toLowerCase()) && !toAdd.some(t => t.toLowerCase() === clean.toLowerCase())) {
        toAdd.push(clean);
        addedCount++;
      }
    }

    if (toAdd.length === 0) {
      return { success: false, addedCount: 0, message: 'Tidak ada kelas baru yang valid atau kelas sudah ada!', classes: current };
    }

    const updated = Array.from(new Set([...current, ...toAdd])).sort();
    this.saveClasses(updated);
    return { success: true, addedCount, message: `Berhasil menambahkan ${addedCount} kelas baru!`, classes: updated };
  }

  static updateClass(oldName: string, newName: string): { success: boolean; message: string; classes: string[] } {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanNew) {
      return { success: false, message: 'Nama kelas baru tidak boleh kosong!', classes: this.getClasses() };
    }

    const current = this.getClasses();
    if (cleanOld.toLowerCase() !== cleanNew.toLowerCase() && current.some(c => c.trim().toLowerCase() === cleanNew.toLowerCase())) {
      return { success: false, message: `Kelas dengan nama "${cleanNew}" sudah ada!`, classes: current };
    }

    const updatedClasses = Array.from(new Set(current.map(c => c.trim().toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c.trim()))).sort();
    this.saveClasses(updatedClasses);

    // Update in Firestore
    const oldId = cleanOld.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const newId = cleanNew.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    deleteDoc(doc(db, 'classes', oldId)).catch(() => {});
    setDoc(doc(db, 'classes', newId), { id: newId, name: cleanNew }).catch(() => {});

    // Also update all students with old class name
    const students = this.getStudents();
    let studentsUpdated = false;
    const updatedStudents = students.map(s => {
      if ((s.class || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
        studentsUpdated = true;
        return { ...s, class: cleanNew };
      }
      return s;
    });

    if (studentsUpdated) {
      this.saveStudents(updatedStudents);
    }

    // Also update attendance records with old class name
    const records = this.getAttendanceRecords();
    let recordsUpdated = false;
    const updatedRecords = records.map(r => {
      if ((r.studentClass || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
        recordsUpdated = true;
        return { ...r, studentClass: cleanNew };
      }
      return r;
    });

    if (recordsUpdated) {
      this.saveAttendanceRecords(updatedRecords);
    }

    return { success: true, message: `Kelas "${cleanOld}" berhasil diubah menjadi "${cleanNew}"!`, classes: updatedClasses };
  }

  static deleteClass(className: string, options?: { deleteStudents?: boolean }): { success: boolean; message: string; classes: string[] } {
    const clean = className.trim();
    const current = this.getClasses();
    const updated = current.filter(c => c.trim().toLowerCase() !== clean.toLowerCase());
    
    // Save to local storage & broadcast immediately
    safeStorageSet(STORAGE_KEYS.CLASSES, JSON.stringify(updated));
    this.broadcastSync('CLASSES_UPDATED', updated);

    // Sync cloud immediately (removes class doc from Firestore)
    this.seedClassesToCloud(updated);

    const students = this.getStudents();
    if (options?.deleteStudents) {
      const studentsToDelete = students.filter(s => (s.class || '').trim().toLowerCase() === clean.toLowerCase());
      if (studentsToDelete.length > 0) {
        this.bulkDeleteStudents(studentsToDelete.map(s => s.id));
      }
    } else {
      let studentsUpdated = false;
      const modifiedStudents = students.map(s => {
        if ((s.class || '').trim().toLowerCase() === clean.toLowerCase()) {
          studentsUpdated = true;
          return { ...s, class: '' };
        }
        return s;
      });
      if (studentsUpdated) {
        this.saveStudents(modifiedStudents);
      }
    }

    return { success: true, message: `Kelas "${clean}" berhasil dihapus secara permanen!`, classes: updated };
  }

  static bulkDeleteClasses(classNames: string[], options?: { deleteStudents?: boolean }): { success: boolean; deletedCount: number; message: string; classes: string[] } {
    const targets = new Set(classNames.map(c => c.trim().toLowerCase()));
    const current = this.getClasses();
    const updated = current.filter(c => !targets.has(c.trim().toLowerCase()));
    const deletedCount = current.length - updated.length;

    // Save to local storage & broadcast immediately
    safeStorageSet(STORAGE_KEYS.CLASSES, JSON.stringify(updated));
    this.broadcastSync('CLASSES_UPDATED', updated);

    // Sync cloud immediately
    this.seedClassesToCloud(updated);

    const students = this.getStudents();
    if (options?.deleteStudents) {
      const studentsToDelete = students.filter(s => targets.has((s.class || '').trim().toLowerCase()));
      if (studentsToDelete.length > 0) {
        this.bulkDeleteStudents(studentsToDelete.map(s => s.id));
      }
    } else {
      let studentsUpdated = false;
      const modifiedStudents = students.map(s => {
        if (targets.has((s.class || '').trim().toLowerCase())) {
          studentsUpdated = true;
          return { ...s, class: '' };
        }
        return s;
      });
      if (studentsUpdated) {
        this.saveStudents(modifiedStudents);
      }
    }

    return {
      success: true,
      deletedCount,
      message: `Berhasil menghapus ${deletedCount} kelas terpilih!`,
      classes: updated
    };
  }

  // --- SYSTEM USERS & AUTHENTICATION MANAGEMENT ---
  static getSystemUsers(): SystemUser[] {
    if (typeof window === 'undefined') return initialSystemUsers;
    const data = localStorage.getItem(STORAGE_KEYS.SYSTEM_USERS);
    if (!data) {
      this.saveSystemUsers(initialSystemUsers);
      return initialSystemUsers;
    }
    try {
      const parsed: SystemUser[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      this.saveSystemUsers(initialSystemUsers);
      return initialSystemUsers;
    } catch {
      return initialSystemUsers;
    }
  }

  static async saveSystemUsers(users: SystemUser[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(users));
    this.broadcastSync('USERS_UPDATED');

    // Sync in background to Cloud Firestore
    try {
      const batch = writeBatch(db);
      for (const u of users) {
        batch.set(doc(db, 'system_users', u.id), sanitizeForFirestore(u));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_users');
    }
  }

  static addSystemUser(userData: Omit<SystemUser, 'id' | 'createdAt' | 'updatedAt'>): { success: boolean; message: string; user?: SystemUser } {
    const cleanUsername = userData.username.trim().toLowerCase();
    if (!cleanUsername) {
      return { success: false, message: 'Username tidak boleh kosong!' };
    }
    if (!userData.password || userData.password.trim().length < 4) {
      return { success: false, message: 'Password minimal 4 karakter!' };
    }
    if (!userData.name || userData.name.trim().length === 0) {
      return { success: false, message: 'Nama lengkap wajib diisi!' };
    }

    const currentUsers = this.getSystemUsers();
    if (currentUsers.some(u => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, message: `Username "${cleanUsername}" sudah digunakan oleh akun lain!` };
    }

    const now = new Date().toISOString();
    const newUser: SystemUser = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      username: cleanUsername,
      password: userData.password.trim(),
      name: userData.name.trim(),
      role: userData.role,
      allowedFeatures: Array.isArray(userData.allowedFeatures) && userData.allowedFeatures.length > 0
        ? userData.allowedFeatures
        : getDefaultPermissionsForRole(userData.role),
      phone: userData.phone?.trim() || undefined,
      email: userData.email?.trim() || undefined,
      isActive: userData.isActive !== false,
      createdAt: now,
      updatedAt: now
    };

    const updatedList = [newUser, ...currentUsers];
    localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(updatedList));
    this.broadcastSync('USERS_UPDATED');

    // Write to Firestore
    setDoc(doc(db, 'system_users', newUser.id), sanitizeForFirestore(newUser)).catch(err => {
      handleFirestoreError(err, OperationType.CREATE, `system_users/${newUser.id}`);
    });

    return { success: true, message: `Akun "${newUser.name}" (@${newUser.username}) berhasil ditambahkan!`, user: newUser };
  }

  static updateSystemUser(user: SystemUser): { success: boolean; message: string } {
    const cleanUsername = user.username.trim().toLowerCase();
    if (!cleanUsername) {
      return { success: false, message: 'Username tidak boleh kosong!' };
    }
    if (!user.name || user.name.trim().length === 0) {
      return { success: false, message: 'Nama pengguna wajib diisi!' };
    }

    const currentUsers = this.getSystemUsers();
    const duplicate = currentUsers.find(u => u.id !== user.id && u.username.toLowerCase() === cleanUsername);
    if (duplicate) {
      return { success: false, message: `Username "${cleanUsername}" sudah dipakai oleh pengguna lain!` };
    }

    const now = new Date().toISOString();
    const updatedUser: SystemUser = {
      ...user,
      username: cleanUsername,
      name: user.name.trim(),
      allowedFeatures: Array.isArray(user.allowedFeatures) && user.allowedFeatures.length > 0
        ? user.allowedFeatures
        : (user.allowedFeatures || getDefaultPermissionsForRole(user.role)),
      phone: user.phone?.trim() || undefined,
      email: user.email?.trim() || undefined,
      updatedAt: now
    };

    const updatedList = currentUsers.map(u => u.id === user.id ? updatedUser : u);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(updatedList));
    this.broadcastSync('USERS_UPDATED');

    // Update in Firestore
    setDoc(doc(db, 'system_users', user.id), sanitizeForFirestore(updatedUser)).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `system_users/${user.id}`);
    });

    return { success: true, message: `Data akun "${updatedUser.name}" berhasil diperbarui!` };
  }

  static deleteSystemUser(userId: string, currentLoggedInUsername?: string): { success: boolean; message: string } {
    const currentUsers = this.getSystemUsers();
    const target = currentUsers.find(u => u.id === userId);
    if (!target) {
      return { success: false, message: 'Akun tidak ditemukan!' };
    }

    // Protection: cannot delete own logged-in account
    if (currentLoggedInUsername && target.username.toLowerCase() === currentLoggedInUsername.toLowerCase()) {
      return { success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan login!' };
    }

    // Protection: ensure at least one active Admin exists
    const activeAdmins = currentUsers.filter(u => u.role === 'admin' && u.isActive && u.id !== userId);
    if (target.role === 'admin' && activeAdmins.length === 0) {
      return { success: false, message: 'Gagal: Sistem harus memiliki minimal satu akun Administrator yang aktif!' };
    }

    const updatedList = currentUsers.filter(u => u.id !== userId);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(updatedList));
    this.broadcastSync('USERS_UPDATED');

    // Delete in Firestore
    deleteDoc(doc(db, 'system_users', userId)).catch(err => {
      handleFirestoreError(err, OperationType.DELETE, `system_users/${userId}`);
    });

    return { success: true, message: `Akun "${target.name}" (@${target.username}) berhasil dihapus permanen!` };
  }

  static toggleUserStatus(userId: string, currentLoggedInUsername?: string): { success: boolean; message: string } {
    const currentUsers = this.getSystemUsers();
    const target = currentUsers.find(u => u.id === userId);
    if (!target) return { success: false, message: 'Akun tidak ditemukan!' };

    if (currentLoggedInUsername && target.username.toLowerCase() === currentLoggedInUsername.toLowerCase()) {
      return { success: false, message: 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang digunakan!' };
    }

    if (target.role === 'admin' && target.isActive) {
      const otherActiveAdmins = currentUsers.filter(u => u.role === 'admin' && u.isActive && u.id !== userId);
      if (otherActiveAdmins.length === 0) {
        return { success: false, message: 'Tidak dapat menonaktifkan satu-satunya Administrator yang aktif!' };
      }
    }

    const newStatus = !target.isActive;
    const now = new Date().toISOString();
    const updatedUser: SystemUser = {
      ...target,
      isActive: newStatus,
      updatedAt: now
    };

    const updatedList = currentUsers.map(u => u.id === userId ? updatedUser : u);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(updatedList));
    this.broadcastSync('USERS_UPDATED');

    setDoc(doc(db, 'system_users', userId), sanitizeForFirestore(updatedUser)).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `system_users/${userId}`);
    });

    return { 
      success: true, 
      message: `Akun "${target.name}" berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}!` 
    };
  }

  // --- DEVICE & SESSION MANAGEMENT (MAX 2 DEVICES PER ACCOUNT & 1-HOUR EXPIRY) ---
  static authenticateUser(username: string, password: string): { 
    success: boolean; 
    user?: SystemUser; 
    session?: UserSession; 
    message: string;
    displacedSessionName?: string;
  } {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Username dan kata sandi wajib diisi!' };
    }

    const users = this.getSystemUsers();
    let found = users.find(u => u.username.toLowerCase() === cleanUser);

    if (!found) {
      // Fallback for default hardcoded credentials if database has not seeded yet
      if (cleanUser === 'admin' && cleanPass === 'admin123') {
        found = initialSystemUsers[0];
      } else if ((cleanUser === 'gurupiket' || cleanUser === 'guru') && cleanPass === 'piket123') {
        found = initialSystemUsers[1];
      } else if ((cleanUser === 'kesiswaan' || cleanUser === 'bk') && cleanPass === 'kesiswaan123') {
        found = initialSystemUsers[2] || {
          id: "usr-kesiswaan-1",
          username: "kesiswaan",
          password: "kesiswaan123",
          name: "Tim Kesiswaan & Bimbingan Konseling (BK)",
          role: "kesiswaan",
          phone: "081234567891",
          email: "kesiswaan@sekolah.sch.id",
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } else {
        return { success: false, message: 'Username atau kata sandi yang Anda masukkan salah.' };
      }
    }

    if (found.password !== cleanPass) {
      return { success: false, message: 'Username atau kata sandi yang Anda masukkan salah.' };
    }

    if (!found.isActive) {
      return { 
        success: false, 
        message: 'Akun Anda sedang dinonaktifkan oleh Administrator. Silakan hubungi admin sekolah.' 
      };
    }

    // --- DEVICE & SESSION MANAGEMENT (MAX 2 DEVICES PER ACCOUNT & 1-HOUR EXPIRY) ---
    const newSession = createNewSession(found.id);
    const nowMs = Date.now();

    // Filter out same device ID and any expired sessions (> 1 Hour)
    const validExistingSessions = (found.activeSessions || []).filter(s => {
      if (s.deviceId === newSession.deviceId) return false;
      const loginTime = new Date(s.loginAt).getTime();
      return (nowMs - loginTime) < SESSION_MAX_DURATION_MS;
    });
    
    // Sort existing active sessions from oldest to newest
    validExistingSessions.sort((a, b) => new Date(a.loginAt).getTime() - new Date(b.loginAt).getTime());

    let displacedSessionName: string | undefined;
    let retainedSessions = validExistingSessions;

    // Enforce MAX 2 Devices: If 2 or more devices already active, kick the oldest device (FIFO)
    if (validExistingSessions.length >= MAX_ACTIVE_DEVICES_PER_ACCOUNT) {
      const oldest = validExistingSessions[0];
      displacedSessionName = oldest.deviceName;
      retainedSessions = validExistingSessions.slice(validExistingSessions.length - (MAX_ACTIVE_DEVICES_PER_ACCOUNT - 1));
    }

    const updatedSessions = [...retainedSessions, newSession];
    const now = new Date().toISOString();
    const updatedUser: SystemUser = {
      ...found,
      lastLogin: now,
      updatedAt: now,
      activeSessions: updatedSessions
    };

    // Save updated user with activeSessions to storage & Firestore
    const currentUsers = this.getSystemUsers();
    const isUserInList = currentUsers.some(u => u.id === found.id);
    const updatedList = isUserInList 
      ? currentUsers.map(u => u.id === found.id ? updatedUser : u)
      : [...currentUsers, updatedUser];

    safeStorageSet(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(updatedList));
    safeStorageSet(STORAGE_KEYS.CURRENT_SESSION_ID, newSession.sessionId);
    safeStorageSet(STORAGE_KEYS.CURRENT_USER_ID, found.id);
    this.broadcastSync('USERS_UPDATED');

    setDoc(doc(db, 'system_users', found.id), sanitizeForFirestore(updatedUser)).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `system_users/${found.id}`);
    });

    return {
      success: true,
      user: updatedUser,
      session: newSession,
      displacedSessionName,
      message: 'Login Berhasil'
    };
  }

  static getCurrentSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    return safeStorageGet(STORAGE_KEYS.CURRENT_SESSION_ID);
  }

  static getCurrentUserId(): string | null {
    if (typeof window === 'undefined') return null;
    return safeStorageGet(STORAGE_KEYS.CURRENT_USER_ID);
  }

  static getActiveAuthUser(): { id: string; username: string; role: Role; name: string; allowedFeatures?: string[] } | null {
    if (typeof window === 'undefined') return null;
    const uid = this.getCurrentUserId();
    const sid = this.getCurrentSessionId();
    if (!uid || !sid) return null;

    const validation = this.validateActiveSession(uid, sid);
    if (!validation.isValid || !validation.user) return null;

    return {
      id: validation.user.id,
      username: validation.user.username,
      role: validation.user.role as Role,
      name: validation.user.name,
      allowedFeatures: validation.user.allowedFeatures
    };
  }

  static validateActiveSession(userId: string, sessionId: string): {
    isValid: boolean;
    user?: SystemUser;
    isDisplaced?: boolean;
    isExpired?: boolean;
    reason?: string;
  } {
    const users = this.getSystemUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return { isValid: false, reason: 'Pengguna tidak ditemukan dalam sistem.' };
    }

    if (!user.isActive) {
      return { isValid: false, reason: 'Akun telah dinonaktifkan oleh Administrator.' };
    }

    // Check if session ID still exists in user.activeSessions
    const activeSessions = user.activeSessions || [];
    const targetSession = activeSessions.find(s => s.sessionId === sessionId);

    if (!targetSession) {
      return {
        isValid: false,
        isDisplaced: true,
        reason: 'Sesi Anda telah berakhir karena akun ini telah login di perangkat baru atau diputus oleh Admin. (Batas maksimal 2 perangkat per akun).'
      };
    }

    // Check 1-Hour Session Expiration Limit
    const loginTime = new Date(targetSession.loginAt).getTime();
    const now = Date.now();
    if (now - loginTime > SESSION_MAX_DURATION_MS) {
      this.revokeUserSession(userId, sessionId);
      return {
        isValid: false,
        isExpired: true,
        reason: 'Sesi login Anda telah berakhir (Maksimal durasi sesi 1 Jam). Silakan masuk kembali.'
      };
    }

    // Update last seen heartbeat (touch activity)
    this.touchSessionActivity(userId, sessionId);

    return { isValid: true, user };
  }

  static touchSessionActivity(userId: string, sessionId: string) {
    const users = this.getSystemUsers();
    const user = users.find(u => u.id === userId);
    if (!user || !user.activeSessions) return;

    const targetSession = user.activeSessions.find(s => s.sessionId === sessionId);
    if (targetSession) {
      const now = new Date().toISOString();
      const lastSeenMs = targetSession.lastSeenAt ? new Date(targetSession.lastSeenAt).getTime() : 0;
      // Only throttle updates to every 30 seconds
      if (Date.now() - lastSeenMs > 30000) {
        targetSession.lastSeenAt = now;
        localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(users));
      }
    }
  }

  static recordUserLogin(userId: string) {
    const users = this.getSystemUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      user.lastLogin = new Date().toISOString();
      this.saveSystemUsers(users);
    }
  }

  static logoutCurrentUser(userId?: string, sessionId?: string) {
    const uid = userId || this.getCurrentUserId();
    const sid = sessionId || this.getCurrentSessionId();

    if (uid && sid) {
      this.revokeUserSession(uid, sid);
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION_ID);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    }
  }

  static revokeUserSession(userId: string, sessionId: string): { success: boolean; message: string } {
    const users = this.getSystemUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan.' };

    const filteredSessions = (user.activeSessions || []).filter(s => s.sessionId !== sessionId);
    const updatedUser: SystemUser = {
      ...user,
      activeSessions: filteredSessions,
      updatedAt: new Date().toISOString()
    };

    const updatedList = users.map(u => u.id === userId ? updatedUser : u);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(updatedList));
    this.broadcastSync('USERS_UPDATED');

    setDoc(doc(db, 'system_users', userId), sanitizeForFirestore(updatedUser)).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `system_users/${userId}`);
    });

    return { success: true, message: 'Sesi perangkat berhasil diputus.' };
  }

  static getUserActiveSessions(userId: string): UserSession[] {
    const users = this.getSystemUsers();
    const user = users.find(u => u.id === userId);
    return user?.activeSessions || [];
  }

  // --- LATE FOLLOW-UPS MANAGEMENT (TINDAK LANJUT SISWA TERLAMBAT) ---
  static getLateFollowUps(): Record<string, LateFollowUpAction> {
    if (typeof window === 'undefined') return {};
    const data = localStorage.getItem(STORAGE_KEYS.LATE_FOLLOWUPS);
    if (!data) return {};
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  static getLateFollowUpForStudent(studentId: string): LateFollowUpAction | undefined {
    const all = this.getLateFollowUps();
    return all[studentId];
  }

  static setLateFollowUp(followUp: LateFollowUpAction): { success: boolean; message: string } {
    if (!followUp.studentId) {
      return { success: false, message: 'ID Siswa wajib ada.' };
    }

    const map = this.getLateFollowUps();
    const now = new Date().toISOString();
    const cleanAction: LateFollowUpAction = {
      ...followUp,
      id: followUp.id || `fu-${followUp.studentId}-${Date.now()}`,
      updatedAt: now
    };

    map[followUp.studentId] = cleanAction;
    localStorage.setItem(STORAGE_KEYS.LATE_FOLLOWUPS, JSON.stringify(map));
    this.broadcastSync('FOLLOWUPS_UPDATED');

    setDoc(doc(db, 'late_followups', followUp.studentId), sanitizeForFirestore(cleanAction)).catch(err => {
      handleFirestoreError(err, OperationType.WRITE, `late_followups/${followUp.studentId}`);
    });

    return { success: true, message: 'Tindak lanjut siswa berhasil dicatat & disinkronkan.' };
  }

  static deleteLateFollowUp(studentId: string): { success: boolean; message: string } {
    const map = this.getLateFollowUps();
    if (map[studentId]) {
      delete map[studentId];
      localStorage.setItem(STORAGE_KEYS.LATE_FOLLOWUPS, JSON.stringify(map));
      this.broadcastSync('FOLLOWUPS_UPDATED');

      deleteDoc(doc(db, 'late_followups', studentId)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, `late_followups/${studentId}`);
      });
    }
    return { success: true, message: 'Data tindak lanjut berhasil direset.' };
  }

  // --- SCHEDULE & SETTINGS ---
  static getSchedule(): SchoolSchedule {
    if (typeof window === 'undefined') return initialSchedule;
    const data = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
    if (!data) {
      this.saveSchedule(initialSchedule);
      return initialSchedule;
    }
    try {
      const parsed = JSON.parse(data);
      if (parsed.schoolName === "SMK / SMA UTAMA MANDIRI" || !parsed.schoolName) {
        parsed.schoolName = "SMK EKONOMIKA DEPOK";
        parsed.schoolAddress = "Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat";
      }
      // Ensure academicYear defaults to 2026/2027
      if (!parsed.academicYear || parsed.academicYear === '2024/2025' || parsed.academicYear === '2025/2026') {
        parsed.academicYear = '2026/2027';
      }
      // Ensure cooldownSeconds and antiSpamCooldownSeconds are properly populated and consistent
      const effectiveCooldown = Number(parsed.cooldownSeconds ?? parsed.antiSpamCooldownSeconds ?? 60);
      parsed.cooldownSeconds = effectiveCooldown;
      parsed.antiSpamCooldownSeconds = effectiveCooldown;
      parsed.deviceSecretPin = parsed.deviceSecretPin || '789012';
      return parsed;
    } catch {
      return initialSchedule;
    }
  }

  static saveSchedule(schedule: SchoolSchedule) {
    if (typeof window === 'undefined') return;
    const effectiveCooldown = Number(schedule.cooldownSeconds ?? schedule.antiSpamCooldownSeconds ?? 60);
    const normalizedSchedule: SchoolSchedule = {
      ...schedule,
      cooldownSeconds: effectiveCooldown,
      antiSpamCooldownSeconds: effectiveCooldown,
      deviceSecretPin: schedule.deviceSecretPin?.trim() || '789012'
    };
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(normalizedSchedule));
    this.broadcastSync('SCHEDULE_UPDATED');
    this.syncScheduleToCloud(normalizedSchedule);
  }

  // --- DEVICE AUTHORIZATION (DAILY GATEKEEPER) ---
  static isDeviceVerifiedToday(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      const explicitLocked = safeStorageGet('attendance_device_explicitly_locked');
      if (explicitLocked === 'true') {
        const verifiedDate = safeStorageGet('attendance_device_verified_date');
        const todayStr = this.getTodayDate();
        return verifiedDate === todayStr;
      }
      // By default in web app, auto-authorize terminal so the monitor is immediately visible & ready
      const todayStr = this.getTodayDate();
      safeStorageSet('attendance_device_verified_date', todayStr);
      return true;
    } catch {
      return true;
    }
  }

  static verifyDevicePin(pin: string): { success: boolean; message: string } {
    if (typeof window === 'undefined') return { success: false, message: 'Window tidak tersedia.' };
    const cleanedPin = pin.trim();
    if (!cleanedPin) {
      return { success: false, message: 'PIN otorisasi perangkat tidak boleh kosong.' };
    }
    const currentSchedule = this.getSchedule();
    const targetPin = (currentSchedule.deviceSecretPin || '789012').trim();

    if (cleanedPin === targetPin) {
      const todayStr = this.getTodayDate();
      safeStorageRemove('attendance_device_explicitly_locked');
      safeStorageSet('attendance_device_verified_date', todayStr);
      safeStorageSet('attendance_device_verified_at', new Date().toISOString());
      this.broadcastSync('DEVICE_AUTH_CHANGED');
      return { success: true, message: 'Otorisasi perangkat berhasil. Terminal absensi aktif.' };
    }

    return { 
      success: false, 
      message: 'PIN kunci rahasia perangkat tidak sesuai. Pastikan Anda memasukkan 6 digit PIN otorisasi resmi sekolah.' 
    };
  }

  static deauthorizeDevice(): void {
    if (typeof window === 'undefined') return;
    try {
      safeStorageSet('attendance_device_explicitly_locked', 'true');
      safeStorageRemove('attendance_device_verified_date');
      safeStorageRemove('attendance_device_verified_at');
    } catch {}
    this.broadcastSync('DEVICE_AUTH_CHANGED');
  }

  static getDeviceVerificationInfo(): { isVerified: boolean; verifiedDate?: string; verifiedAt?: string } {
    if (typeof window === 'undefined') return { isVerified: true };
    const verifiedDate = safeStorageGet('attendance_device_verified_date') || undefined;
    const verifiedAt = safeStorageGet('attendance_device_verified_at') || undefined;
    const todayStr = this.getTodayDate();
    const explicitLocked = safeStorageGet('attendance_device_explicitly_locked');
    return {
      isVerified: explicitLocked !== 'true' || verifiedDate === todayStr,
      verifiedDate,
      verifiedAt
    };
  }

  // --- ATTENDANCE RECORDS ---
  static getAttendanceRecords(): AttendanceRecord[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (!data) {
      const initialLogs = getInitialAttendanceLogs(this.getStudents());
      this.saveAttendanceRecords(initialLogs);
      return initialLogs;
    }
    try {
      const parsed: AttendanceRecord[] = JSON.parse(data);
      if (Array.isArray(parsed)) {
        // Filter out legacy dummy initial log entries (att-1001 s/d att-1005)
        const cleaned = parsed.filter(r => !['att-1001', 'att-1002', 'att-1003', 'att-1004', 'att-1005'].includes(r.id));
        if (cleaned.length !== parsed.length) {
          this.saveAttendanceRecords(cleaned);
        }
        return cleaned;
      }
      return [];
    } catch {
      return [];
    }
  }

  static saveAttendanceRecords(records: AttendanceRecord[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(records));
    this.broadcastSync('ATTENDANCE_UPDATED');
  }

  static async clearAllAttendanceData(): Promise<{ success: boolean; message: string }> {
    this.saveAttendanceRecords([]);
    this.broadcastSync('ATTENDANCE_UPDATED');
    
    // Clear all in cloud (attendance_records collection)
    try {
      const snapshot = await getDocs(collection(db, 'attendance_records'));
      if (!snapshot.empty) {
        const docs = snapshot.docs;
        const deletePromises = docs.map(docSnap => deleteDoc(doc(db, 'attendance_records', docSnap.id)));
        await Promise.all(deletePromises);
      }
      this.saveAttendanceRecords([]);
      this.broadcastSync('ATTENDANCE_UPDATED');
      return { success: true, message: 'Seluruh riwayat log presensi berhasil dikosongkan secara permanen.' };
    } catch (err) {
      console.warn('Error clearing attendance records in cloud:', err);
      // Fallback batch delete
      try {
        const snapshot = await getDocs(collection(db, 'attendance_records'));
        if (!snapshot.empty) {
          const batch = writeBatch(db);
          snapshot.docs.forEach(d => batch.delete(doc(db, 'attendance_records', d.id)));
          await batch.commit();
        }
      } catch (fallbackErr) {
        console.error('Fallback batch delete failed:', fallbackErr);
      }
      this.saveAttendanceRecords([]);
      this.broadcastSync('ATTENDANCE_UPDATED');
      return { success: true, message: 'Seluruh riwayat log presensi telah dikosongkan.' };
    }
  }

  static async deleteAttendanceRecordByIds(recordIds: string[]): Promise<{ success: boolean; deletedCount: number; message: string }> {
    if (!recordIds || recordIds.length === 0) return { success: false, deletedCount: 0, message: 'Tidak ada data log yang dipilih' };
    const idSet = new Set(recordIds);
    const allRecords = this.getAttendanceRecords();
    const remaining = allRecords.filter(r => !idSet.has(r.id));
    const deletedCount = allRecords.length - remaining.length;

    this.saveAttendanceRecords(remaining);
    this.broadcastSync('ATTENDANCE_UPDATED');

    // Remove from Firestore
    try {
      const deletePromises = recordIds.map(id => deleteDoc(doc(db, 'attendance_records', id)));
      await Promise.all(deletePromises);
    } catch (err) {
      console.warn('Error deleting records from cloud:', err);
    }

    return {
      success: true,
      deletedCount,
      message: `Berhasil menghapus ${deletedCount} riwayat log absensi.`
    };
  }

  static cleanOrphanAttendanceRecords(): { success: boolean; deletedCount: number; message: string } {
    const students = this.getStudents();
    const teachers = this.getTeachers();
    const validStudentUids = new Set(students.map(s => s.rfidUid.trim().toUpperCase()));
    const validStudentIds = new Set(students.map(s => s.id));
    const validTeacherUids = new Set(teachers.map(t => t.rfidUid.trim().toUpperCase()));
    const validTeacherIds = new Set(teachers.map(t => t.id));

    const allRecords = this.getAttendanceRecords();
    const orphanIds: string[] = [];

    const validRecords = allRecords.filter(r => {
      const uid = (r.rfidUid || '').trim().toUpperCase();
      const hasValidStudent = (r.studentId && validStudentIds.has(r.studentId)) || (uid && validStudentUids.has(uid)) || (r.studentName && r.studentName.trim().length > 0);
      const hasValidTeacher = (r.teacherId && validTeacherIds.has(r.teacherId)) || (uid && validTeacherUids.has(uid)) || (r.teacherName && r.teacherName.trim().length > 0);
      
      const isOrphan = !hasValidStudent && !hasValidTeacher;
      if (isOrphan) {
        orphanIds.push(r.id);
        return false;
      }
      return true;
    });

    const deletedCount = orphanIds.length;
    if (deletedCount > 0) {
      this.saveAttendanceRecords(validRecords);
      this.broadcastSync('ATTENDANCE_UPDATED');
      // Delete in Firestore
      try {
        const batch = writeBatch(db);
        for (const id of orphanIds.slice(0, 400)) {
          batch.delete(doc(db, 'attendance_records', id));
        }
        batch.commit().catch(() => {});
      } catch (err) {
        console.warn('Error deleting orphan records from cloud:', err);
      }
    }

    return {
      success: true,
      deletedCount,
      message: deletedCount > 0 
        ? `Berhasil membersihkan ${deletedCount} log absensi tidak bertuan / data kosong!`
        : 'Semua data absensi sudah bersih dan valid!'
    };
  }

  static autoHealAttendanceRecords(): { healedCount: number } {
    const students = this.getStudents();
    const teachers = this.getTeachers();
    const records = this.getAttendanceRecords();

    let healedCount = 0;
    const updated = records.map(r => {
      let changed = false;
      const cleanUid = (r.rfidUid || '').trim().toUpperCase();

      // Check student match if studentName is missing
      if (!r.studentName || r.studentName.trim() === '' || r.studentName === '-') {
        const match = students.find(s => (s.id && s.id === r.studentId) || (cleanUid && s.rfidUid.trim().toUpperCase() === cleanUid));
        if (match) {
          r.studentId = match.id;
          r.studentName = match.name;
          r.nisn = match.nisn || r.nisn;
          r.studentClass = match.class || r.studentClass;
          r.userType = 'STUDENT';
          changed = true;
        }
      }

      // Check teacher match if teacherName is missing
      const isTeacherOrUnknown = r.userType === 'TEACHER' || (!r.studentName && r.userType !== 'STUDENT');
      if (isTeacherOrUnknown) {
        if (!r.teacherName || r.teacherName.trim() === '' || r.teacherName === '-') {
          const match = teachers.find(t => (t.id && t.id === r.teacherId) || (cleanUid && t.rfidUid.trim().toUpperCase() === cleanUid));
          if (match) {
            r.teacherId = match.id;
            r.teacherName = match.name;
            r.nip = match.nip || r.nip;
            r.teacherPosition = match.position || r.teacherPosition;
            r.userType = 'TEACHER';
            changed = true;
          }
        }
      }

      if (changed) healedCount++;
      return r;
    });

    if (healedCount > 0) {
      this.saveAttendanceRecords(updated);
      // Update in cloud
      try {
        const batch = writeBatch(db);
        for (const r of updated.slice(0, 400)) {
          batch.set(doc(db, 'attendance_records', r.id), sanitizeForFirestore(r));
        }
        batch.commit().catch(() => {});
      } catch (err) {
        console.warn('Error saving healed records to cloud:', err);
      }
    }

    return { healedCount };
  }

  static getTodayDate(): string {
    return getLocalTodayDateString();
  }

  // --- AUTOMATED DAILY ATTENDANCE RESET & SNAPSHOT ARCHIVING ---
  static checkAndProcessDayRollover(): { rolledOver: boolean; previousDate?: string; newDate: string } {
    if (typeof window === 'undefined') return { rolledOver: false, newDate: this.getTodayDate() };
    const today = this.getTodayDate();
    const lastActive = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_DATE);

    if (!lastActive) {
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_DATE, today);
      return { rolledOver: false, newDate: today };
    }

    if (lastActive !== today) {
      console.log(`[Day Rollover] Previous Date: ${lastActive} -> Today: ${today}. Auto-archiving recap and resetting daily view to 0.`);
      
      // Update active date marker to today first to prevent duplicate trigger
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_DATE, today);

      // Auto-save snapshot of previous day's attendance to Database and Local storage
      this.saveDailyRecapSnapshot(lastActive, 'AUTO_DAY_ROLLOVER').then(res => {
        // Broadcast day change event with archived recap across tabs
        this.broadcastSync('DAY_CHANGED', { 
          previousDate: lastActive, 
          newDate: today,
          recap: res.recap
        });
        this.broadcastSync('ATTENDANCE_UPDATED');
      }).catch(err => {
        console.warn('Auto-archive on day rollover error:', err);
        this.broadcastSync('DAY_CHANGED', { previousDate: lastActive, newDate: today });
        this.broadcastSync('ATTENDANCE_UPDATED');
      });

      return { rolledOver: true, previousDate: lastActive, newDate: today };
    }

    return { rolledOver: false, newDate: today };
  }

  static async triggerManualArchiveAndReset(targetDateStr?: string): Promise<{ success: boolean; recap: DailyAttendanceRecap; message: string }> {
    const targetDate = targetDateStr || this.getTodayDate();
    const saveRes = await this.saveDailyRecapSnapshot(targetDate, 'MANUAL_BY_ADMIN');
    
    // Broadcast notification
    this.broadcastSync('DAY_CHANGED', {
      previousDate: targetDate,
      newDate: this.getTodayDate(),
      recap: saveRes.recap
    });
    this.broadcastSync('ATTENDANCE_UPDATED');

    return {
      success: true,
      recap: saveRes.recap,
      message: `Berhasil mengarsipkan rekap absensi tanggal ${targetDate} ke database Firestore!`
    };
  }

  static async saveDailyRecapSnapshot(
    targetDateStr?: string, 
    savedBy: string = 'MANUAL_SESSION_CLOSE'
  ): Promise<{ success: boolean; recap: DailyAttendanceRecap; message: string }> {
    const dateFormatted = targetDateStr || this.getTodayDate();
    const dayName = getIndonesianDayName(dateFormatted);
    const students = this.getStudents();
    const teachers = this.getTeachers();
    const allRecords = this.getAttendanceRecords();
    const dateRecords = allRecords.filter(r => r.dateFormatted === dateFormatted);
    const classes = this.getClasses();

    // Student statistics on target date
    const studentRecords = dateRecords.filter(r => r.userType === 'STUDENT' || (!r.userType && !r.teacherId));
    const studentCheckIns = studentRecords.filter(r => r.type === 'MASUK');
    const studentCheckOuts = studentRecords.filter(r => r.type === 'PULANG');
    const studentOnTime = studentCheckIns.filter(r => r.status === 'TEPAT_WAKTU').length;
    const studentLate = studentCheckIns.filter(r => r.status === 'TERLAMBAT').length;
    const totalPresentToday = studentCheckIns.length;
    const totalStudents = students.length;
    const totalAlpha = Math.max(0, totalStudents - totalPresentToday);
    const frontGateCount = dateRecords.filter(r => r.gateLocation === 'pintu_depan').length;
    const backGateCount = dateRecords.filter(r => r.gateLocation === 'pintu_belakang').length;

    const studentStats: AttendanceStats = {
      totalStudents,
      totalPresentToday,
      totalOnTime: studentOnTime,
      totalLate: studentLate,
      totalCheckoutsToday: studentCheckOuts.length,
      totalAlpha,
      frontGateCount,
      backGateCount
    };

    // Teacher statistics on target date
    const teacherRecords = dateRecords.filter(r => r.userType === 'TEACHER' || !!r.teacherId);
    const teacherCheckIns = teacherRecords.filter(r => r.type === 'MASUK');
    const teacherCheckOuts = teacherRecords.filter(r => r.type === 'PULANG');
    const teacherStats: TeacherAttendanceStats = {
      totalTeachers: teachers.length,
      totalPresentToday: teacherCheckIns.length,
      totalOnTime: teacherCheckIns.filter(r => r.status === 'TEPAT_WAKTU').length,
      totalLate: teacherCheckIns.filter(r => r.status === 'TERLAMBAT').length,
      totalCheckoutsToday: teacherCheckOuts.length,
      frontGateCount: teacherRecords.filter(r => r.gateLocation === 'pintu_depan').length,
      backGateCount: teacherRecords.filter(r => r.gateLocation === 'pintu_belakang').length
    };

    // Per class summary breakdown
    const classSummaries: ClassAttendanceSummary[] = classes.map(cls => {
      const classStudents = students.filter(s => s.class === cls);
      const totalClassStudents = classStudents.length;
      const classStudentIds = new Set(classStudents.map(s => s.id));
      const classUids = new Set(classStudents.map(s => s.rfidUid));

      const classEntries = studentCheckIns.filter(r => 
        (r.studentClass === cls) || 
        (r.studentId && classStudentIds.has(r.studentId)) ||
        (r.rfidUid && classUids.has(r.rfidUid))
      );

      const presentCount = classEntries.length;
      const onTimeCount = classEntries.filter(r => r.status === 'TEPAT_WAKTU').length;
      const lateCount = classEntries.filter(r => r.status === 'TERLAMBAT').length;
      const alphaCount = Math.max(0, totalClassStudents - presentCount);
      const attendanceRate = totalClassStudents > 0 ? Number(((presentCount / totalClassStudents) * 100).toFixed(1)) : 0;

      return {
        className: cls,
        totalStudents: totalClassStudents,
        presentCount,
        onTimeCount,
        lateCount,
        alphaCount,
        attendanceRate
      };
    });

    const recap: DailyAttendanceRecap = {
      id: `recap-${dateFormatted}`,
      dateFormatted,
      dayName,
      timestamp: new Date().toISOString(),
      savedBy,
      studentStats,
      teacherStats,
      classSummaries,
      totalRecordsCount: dateRecords.length
    };

    // 1. Save to local storage
    const currentRecaps = this.getDailyRecaps();
    const existingIndex = currentRecaps.findIndex(r => r.dateFormatted === dateFormatted);
    let updatedRecaps: DailyAttendanceRecap[];
    if (existingIndex >= 0) {
      updatedRecaps = [...currentRecaps];
      updatedRecaps[existingIndex] = recap;
    } else {
      updatedRecaps = [recap, ...currentRecaps];
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.DAILY_RECAPS, JSON.stringify(updatedRecaps));
    }

    // 2. Save to Firestore Cloud Collection
    try {
      await setDoc(doc(db, 'daily_attendance_recap', recap.id), sanitizeForFirestore(recap));
    } catch (err) {
      console.warn('Error saving daily recap to Firestore:', err);
    }

    this.broadcastSync('DAILY_RECAP_SAVED', recap);

    return {
      success: true,
      recap,
      message: `Rekap absensi harian tanggal ${dateFormatted} (${dayName}) berhasil disimpan ke database untuk laporan!`
    };
  }

  static getDailyRecaps(): DailyAttendanceRecap[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.DAILY_RECAPS);
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static getDailyRecapByDate(dateStr: string): DailyAttendanceRecap | null {
    const recaps = this.getDailyRecaps();
    return recaps.find(r => r.dateFormatted === dateStr) || null;
  }

  static async resetTodayAttendance(targetDateStr?: string): Promise<{ success: boolean; message: string; deletedCount: number }> {
    const dateToReset = targetDateStr || this.getTodayDate();
    
    // Auto-save recap snapshot before any manual reset to ensure data is safely backed up
    await this.saveDailyRecapSnapshot(dateToReset, 'MANUAL_BEFORE_RESET');

    const allRecords = this.getAttendanceRecords();
    const recordsToKeep = allRecords.filter(r => r.dateFormatted !== dateToReset);
    const deletedCount = allRecords.length - recordsToKeep.length;

    this.saveAttendanceRecords(recordsToKeep);
    this.broadcastSync('ATTENDANCE_UPDATED');

    // Also remove target date records from active attendance_records in Firestore
    try {
      const snapshot = await getDocs(collection(db, 'attendance_records'));
      const batch = writeBatch(db);
      let count = 0;
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as AttendanceRecord;
        if (data.dateFormatted === dateToReset) {
          batch.delete(docSnap.ref);
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.warn('Error resetting cloud attendance for target date:', err);
    }

    return {
      success: true,
      deletedCount,
      message: `Data absensi tanggal ${dateToReset} telah tersimpan aman di database laporan dan hitungan hari ini berhasil direset ke 0.`
    };
  }

  // --- REALTIME EVENT BROADCASTING ---
  private static broadcastSync(type: string, payload?: unknown) {
    const data = { type, payload, timestamp: Date.now() };
    if (syncChannel) {
      try {
        syncChannel.postMessage(data);
      } catch {
        // Fallback
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rfid_sync', { detail: data }));
    }
  }

  static subscribeToSync(callback: (event: { type: string; payload?: unknown }) => void) {
    let lastEventKey = '';
    let lastEventTime = 0;

    const safeCallback = (data: { type: string; payload?: unknown }) => {
      const now = Date.now();
      const key = `${data.type}_${typeof data.payload === 'string' ? data.payload : ''}`;
      // Debounce duplicate events within 150ms
      if (key === lastEventKey && now - lastEventTime < 150) {
        return;
      }
      lastEventKey = key;
      lastEventTime = now;
      callback(data);
    };

    const channelHandler = (e: MessageEvent) => {
      if (e.data && e.data.type) {
        safeCallback(e.data);
      }
    };

    const windowHandler = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail && customEvt.detail.type) {
        safeCallback(customEvt.detail);
      }
    };

    const storageHandler = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('rfid_app_')) {
        safeCallback({ type: 'STORAGE_UPDATED', payload: e.key });
      }
    };

    if (syncChannel) {
      syncChannel.addEventListener('message', channelHandler);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('rfid_sync', windowHandler);
      window.addEventListener('storage', storageHandler);
    }

    return () => {
      if (syncChannel) {
        syncChannel.removeEventListener('message', channelHandler);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('rfid_sync', windowHandler);
        window.removeEventListener('storage', storageHandler);
      }
    };
  }

  // --- CORE ATTENDANCE TAP PROCESSING ENGINE ---
  static processRfidTap(rfidUidClean: string, gateLocation: GateLocation): AttendanceAttemptResult {
    const cleanUid = rfidUidClean.trim().toUpperCase();
    const teachers = this.getTeachers();
    const students = this.getStudents();
    const schedule = this.getSchedule();
    const records = this.getAttendanceRecords();

    const now = new Date();
    const todayStr = this.getTodayDate();
    const timeFormatted = now.toTimeString().split(' ')[0]; // "HH:mm:ss"
    const scanTime = `${timeFormatted} WIB`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const gateName = gateLocation === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang';

    // 1. Check if UID belongs to a TEACHER
    const teacher = teachers.find(t => t.rfidUid.trim().toUpperCase() === cleanUid);
    if (teacher) {
      // Teacher cooldown check
      const recentRecordsForTeacher = records.filter(r => r.teacherId === teacher.id);
      if (recentRecordsForTeacher.length > 0) {
        const lastRecord = recentRecordsForTeacher[0];
        const lastTime = new Date(lastRecord.timestamp).getTime();
        const diffSeconds = Math.floor((now.getTime() - lastTime) / 1000);

        if (diffSeconds < schedule.cooldownSeconds) {
          return {
            success: false,
            userType: 'TEACHER',
            teacher,
            rfidUid: cleanUid,
            scanTime,
            message: `DITOLAK: Mohon tunggu ${schedule.cooldownSeconds - diffSeconds} detik untuk tap ulang kartu.`,
            reason: 'COOLDOWN_ACTIVE'
          };
        }
      }

      // Determine Attendance Type (MASUK vs PULANG)
      const [exitStartH, exitStartM] = schedule.exitStartTime.split(':').map(Number);
      const exitStartMins = exitStartH * 60 + exitStartM;
      let type: 'MASUK' | 'PULANG' = currentMinutes >= exitStartMins ? 'PULANG' : 'MASUK';

      // Duplicate Check for Teacher
      const todayRecords = records.filter(r => r.teacherId === teacher.id && r.dateFormatted === todayStr);
      const todayEntry = todayRecords.find(r => r.type === 'MASUK');
      const todayExit = todayRecords.find(r => r.type === 'PULANG');

      if (type === 'MASUK') {
        if (todayEntry) {
          return {
            success: false,
            userType: 'TEACHER',
            teacher,
            rfidUid: cleanUid,
            scanTime,
            message: `Absensi Anda DITOLAK karena sudah absen MASUK hari ini pada pukul ${todayEntry.timeFormatted} (${todayEntry.gateName}).`,
            reason: 'ALREADY_CHECKED_IN'
          };
        }
      } else {
        if (todayExit) {
          return {
            success: false,
            userType: 'TEACHER',
            teacher,
            rfidUid: cleanUid,
            scanTime,
            message: `Absensi Anda DITOLAK karena sudah absen PULANG hari ini pada pukul ${todayExit.timeFormatted} (${todayExit.gateName}).`,
            reason: 'ALREADY_CHECKED_OUT'
          };
        }
      }

      // Calculate Status & Late Minutes
      const [deadlineH, deadlineM] = schedule.entryDeadlineTime.split(':').map(Number);
      const deadlineMins = deadlineH * 60 + deadlineM;
      let status: 'TEPAT_WAKTU' | 'TERLAMBAT' | 'PULANG' = 'TEPAT_WAKTU';
      let lateMinutes = 0;

      if (type === 'MASUK') {
        if (currentMinutes > deadlineMins) {
          status = 'TERLAMBAT';
          lateMinutes = currentMinutes - deadlineMins;
        } else {
          status = 'TEPAT_WAKTU';
        }
      } else {
        status = 'PULANG';
      }

      // Create New Attendance Record for Teacher
      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userType: 'TEACHER',
        teacherId: teacher.id,
        teacherName: teacher.name,
        nip: teacher.nip,
        teacherPosition: teacher.position,
        rfidUid: teacher.rfidUid,
        timestamp: now.toISOString(),
        timeFormatted,
        dateFormatted: todayStr,
        type,
        status,
        gateLocation,
        gateName,
        lateMinutes: lateMinutes > 0 ? lateMinutes : undefined,
        notes: status === 'TERLAMBAT' ? `Terlambat ${lateMinutes} Menit (Batas ${schedule.entryDeadlineTime})` : undefined
      };

      const updatedRecords = [newRecord, ...records];
      this.saveAttendanceRecords(updatedRecords);

      const isOffline = !this.isNetworkOnline();
      if (isOffline) {
        this.addToSyncQueue({
          id: newRecord.id,
          entity: 'ATTENDANCE_RECORD',
          action: 'CREATE',
          payload: newRecord,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          isOfflineCreated: true
        });
      } else {
        setDoc(doc(db, 'attendance_records', newRecord.id), sanitizeForFirestore(newRecord)).catch(err => {
          handleFirestoreError(err, OperationType.CREATE, `attendance_records/${newRecord.id}`);
          this.addToSyncQueue({
            id: newRecord.id,
            entity: 'ATTENDANCE_RECORD',
            action: 'CREATE',
            payload: newRecord,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            lastError: err instanceof Error ? err.message : String(err),
            isOfflineCreated: true
          });
        });
      }

      const todayTeacherEntries = records.filter(r => r.dateFormatted === todayStr && r.type === 'MASUK' && (r.userType === 'TEACHER' || !!r.teacherId));
      const arrivalRank = type === 'MASUK' ? todayTeacherEntries.length + 1 : undefined;
      const arrivalRankText = arrivalRank ? `Guru Ke-${arrivalRank}` : undefined;

      const message = type === 'MASUK'
        ? (status === 'TERLAMBAT' 
            ? `ABSEN GURU TERLAMBAT: ${teacher.name} (${teacher.position}) - Terlambat ${lateMinutes} Menit` 
            : `ABSEN GURU DITERIMA: ${teacher.name} (${teacher.position}) - Tepat Waktu`)
        : `ABSEN PULANG GURU DITERIMA: ${teacher.name} (${teacher.position})`;

      return {
        success: true,
        userType: 'TEACHER',
        teacher,
        message,
        status,
        record: newRecord,
        lateMinutes,
        rfidUid: cleanUid,
        scanTime,
        arrivalRank,
        arrivalRankText,
        isOfflineSaved: isOffline
      };
    }

    // 2. Check if UID belongs to a STUDENT
    const student = students.find(s => s.rfidUid.trim().toUpperCase() === cleanUid);
    if (!student) {
      return {
        success: false,
        message: `KARTU DITOLAK: UID RFID [${cleanUid}] Tidak Terdaftar!`,
        reason: 'UNREGISTERED_CARD',
        rfidUid: cleanUid,
        scanTime
      };
    }

    // Student cooldown check
    const recentRecordsForStudent = records.filter(r => r.studentId === student.id);
    if (recentRecordsForStudent.length > 0) {
      const lastRecord = recentRecordsForStudent[0];
      const lastTime = new Date(lastRecord.timestamp).getTime();
      const diffSeconds = Math.floor((now.getTime() - lastTime) / 1000);

      if (diffSeconds < schedule.cooldownSeconds) {
        return {
          success: false,
          userType: 'STUDENT',
          student,
          rfidUid: cleanUid,
          scanTime,
          message: `DITOLAK: Mohon tunggu ${schedule.cooldownSeconds - diffSeconds} detik untuk tap ulang kartu.`,
          reason: 'COOLDOWN_ACTIVE'
        };
      }
    }

    // Determine Attendance Type (MASUK vs PULANG)
    const [entryStartH, entryStartM] = schedule.entryStartTime.split(':').map(Number);
    const [deadlineH, deadlineM] = schedule.entryDeadlineTime.split(':').map(Number);
    const [exitStartH, exitStartM] = schedule.exitStartTime.split(':').map(Number);

    const deadlineMins = deadlineH * 60 + deadlineM;
    const exitStartMins = exitStartH * 60 + exitStartM;

    let type: 'MASUK' | 'PULANG' = 'MASUK';
    if (currentMinutes >= exitStartMins) {
      type = 'PULANG';
    }

    // Duplicate Check for Student
    const todayRecords = records.filter(r => r.studentId === student.id && r.dateFormatted === todayStr);
    const todayEntry = todayRecords.find(r => r.type === 'MASUK');
    const todayExit = todayRecords.find(r => r.type === 'PULANG');

    if (type === 'MASUK') {
      if (todayEntry) {
        return {
          success: false,
          userType: 'STUDENT',
          student,
          rfidUid: cleanUid,
          scanTime,
          message: `Absensi Anda DITOLAK karena sudah absen MASUK hari ini pada pukul ${todayEntry.timeFormatted} (${todayEntry.gateName}).`,
          reason: 'ALREADY_CHECKED_IN'
        };
      }
    } else {
      if (todayExit) {
        return {
          success: false,
          userType: 'STUDENT',
          student,
          rfidUid: cleanUid,
          scanTime,
          message: `Absensi Anda DITOLAK karena sudah absen PULANG hari ini pada pukul ${todayExit.timeFormatted} (${todayExit.gateName}).`,
          reason: 'ALREADY_CHECKED_OUT'
        };
      }
    }

    // Calculate Status & Late Minutes
    let status: 'TEPAT_WAKTU' | 'TERLAMBAT' | 'PULANG' = 'TEPAT_WAKTU';
    let lateMinutes = 0;

    if (type === 'MASUK') {
      if (currentMinutes > deadlineMins) {
        status = 'TERLAMBAT';
        lateMinutes = currentMinutes - deadlineMins;
      } else {
        status = 'TEPAT_WAKTU';
      }
    } else {
      status = 'PULANG';
    }

    // Create New Attendance Record for Student
    const newRecord: AttendanceRecord = {
      id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userType: 'STUDENT',
      studentId: student.id,
      studentName: student.name,
      nis: student.nis,
      nisn: student.nisn,
      studentClass: student.class,
      rfidUid: student.rfidUid,
      timestamp: now.toISOString(),
      timeFormatted,
      dateFormatted: todayStr,
      type,
      status,
      gateLocation,
      gateName,
      lateMinutes: lateMinutes > 0 ? lateMinutes : undefined,
      notes: status === 'TERLAMBAT' ? `Terlambat ${lateMinutes} Menit (Batas ${schedule.entryDeadlineTime})` : undefined
    };

    const updatedRecords = [newRecord, ...records];
    this.saveAttendanceRecords(updatedRecords);

    const isOffline = !this.isNetworkOnline();
    if (isOffline) {
      this.addToSyncQueue({
        id: newRecord.id,
        entity: 'ATTENDANCE_RECORD',
        action: 'CREATE',
        payload: newRecord,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        isOfflineCreated: true
      });
    } else {
      setDoc(doc(db, 'attendance_records', newRecord.id), sanitizeForFirestore(newRecord)).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, `attendance_records/${newRecord.id}`);
        this.addToSyncQueue({
          id: newRecord.id,
          entity: 'ATTENDANCE_RECORD',
          action: 'CREATE',
          payload: newRecord,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          lastError: err instanceof Error ? err.message : String(err),
          isOfflineCreated: true
        });
      });
    }

    const todayStudentEntries = records.filter(r => r.dateFormatted === todayStr && r.type === 'MASUK' && (r.userType === 'STUDENT' || (!r.userType && r.studentId)));
    const arrivalRank = type === 'MASUK' ? todayStudentEntries.length + 1 : undefined;
    const arrivalRankText = arrivalRank ? `Siswa Ke-${arrivalRank}` : undefined;

    const message = type === 'MASUK'
      ? (status === 'TERLAMBAT' 
          ? `ABSEN MASUK TERLAMBAT: ${student.name} (${student.class}) - Terlambat ${lateMinutes} Menit` 
          : `ABSEN MASUK DITERIMA: ${student.name} (${student.class}) - Tepat Waktu`)
      : `ABSEN PULANG DITERIMA: ${student.name} (${student.class})`;

    return {
      success: true,
      userType: 'STUDENT',
      message,
      status,
      record: newRecord,
      student,
      lateMinutes,
      rfidUid: cleanUid,
      scanTime,
      arrivalRank,
      arrivalRankText,
      isOfflineSaved: isOffline
    };
  }

  // --- IZIN PULANG LEBIH AWAL SEBELUM JAM PULANG KBM DIBUKA ---
  static recordEarlyCheckout(params: {
    studentId: string;
    rfidUid?: string;
    reason: string;
    notes?: string;
    gateLocation: GateLocation;
    officerName?: string;
  }): AttendanceAttemptResult {
    const students = this.getStudents();
    const records = this.getAttendanceRecords();
    const student = students.find(s => s.id === params.studentId || (params.rfidUid && s.rfidUid.trim().toUpperCase() === params.rfidUid.trim().toUpperCase()));

    if (!student) {
      return {
        success: false,
        message: 'Data siswa tidak ditemukan untuk izin pulang lebih awal.',
        reason: 'STUDENT_NOT_FOUND'
      };
    }

    const now = new Date();
    const todayStr = this.getTodayDate();
    const timeFormatted = now.toTimeString().split(' ')[0];
    const scanTime = `${timeFormatted} WIB`;
    const gateName = params.gateLocation === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang';

    // Cek jika siswa sudah absen pulang sebelumnya
    const existingExit = records.find(r => r.studentId === student.id && r.dateFormatted === todayStr && r.type === 'PULANG');
    if (existingExit) {
      return {
        success: false,
        userType: 'STUDENT',
        student,
        scanTime,
        message: `Siswa "${student.name}" sudah tercatat absen PULANG hari ini pada pukul ${existingExit.timeFormatted}.`,
        reason: 'ALREADY_CHECKED_OUT'
      };
    }

    const fullReason = params.notes?.trim() 
      ? `${params.reason.trim()} (${params.notes.trim()})`
      : params.reason.trim();

    const newRecord: AttendanceRecord = {
      id: `att-early-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userType: 'STUDENT',
      studentId: student.id,
      studentName: student.name,
      nis: student.nis,
      nisn: student.nisn,
      studentClass: student.class,
      rfidUid: student.rfidUid,
      timestamp: now.toISOString(),
      timeFormatted,
      dateFormatted: todayStr,
      type: 'PULANG',
      status: 'PULANG_CEPAT',
      gateLocation: params.gateLocation,
      gateName,
      isEarlyCheckout: true,
      earlyCheckoutReason: fullReason,
      notes: `Izin Pulang Awal: ${fullReason}${params.officerName ? ` [Verifikasi: ${params.officerName}]` : ''}`
    };

    const updatedRecords = [newRecord, ...records];
    this.saveAttendanceRecords(updatedRecords);

    const isOffline = !this.isNetworkOnline();
    if (isOffline) {
      this.addToSyncQueue({
        id: newRecord.id,
        entity: 'ATTENDANCE_RECORD',
        action: 'CREATE',
        payload: newRecord,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        isOfflineCreated: true
      });
    } else {
      setDoc(doc(db, 'attendance_records', newRecord.id), sanitizeForFirestore(newRecord)).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, `attendance_records/${newRecord.id}`);
        this.addToSyncQueue({
          id: newRecord.id,
          entity: 'ATTENDANCE_RECORD',
          action: 'CREATE',
          payload: newRecord,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          lastError: err instanceof Error ? err.message : String(err),
          isOfflineCreated: true
        });
      });
    }

    return {
      success: true,
      userType: 'STUDENT',
      student,
      record: newRecord,
      status: 'PULANG_CEPAT',
      scanTime,
      rfidUid: student.rfidUid,
      message: `IZIN PULANG AWAL DITERIMA: ${student.name} (${student.class}) - Alasan: ${fullReason}`,
      isOfflineSaved: isOffline
    };
  }

  // --- MANUAL ATTENDANCE OVERRIDE BY GURU/ADMIN ---
  static createManualAttendance(
    studentId: string, 
    type: 'MASUK' | 'PULANG', 
    status: 'TEPAT_WAKTU' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPHA',
    gateLocation: GateLocation,
    notes: string
  ): AttendanceAttemptResult {
    const students = this.getStudents();
    const student = students.find(s => s.id === studentId);
    if (!student) {
      return { success: false, message: 'Siswa tidak ditemukan' };
    }

    const now = new Date();
    const todayStr = this.getTodayDate();
    const timeFormatted = now.toTimeString().split(' ')[0];
    const records = this.getAttendanceRecords();

    const gateName = gateLocation === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang';

    const newRecord: AttendanceRecord = {
      id: `att-manual-${Date.now()}`,
      userType: 'STUDENT',
      studentId: student.id,
      studentName: student.name,
      nisn: student.nisn,
      studentClass: student.class,
      rfidUid: student.rfidUid,
      timestamp: now.toISOString(),
      timeFormatted,
      dateFormatted: todayStr,
      type,
      status,
      gateLocation,
      gateName,
      notes: notes || `Manual oleh Guru Piket (${status})`,
      isManualOverride: true
    };

    const updated = [newRecord, ...records];
    this.saveAttendanceRecords(updated);

    const isOffline = !this.isNetworkOnline();
    if (isOffline) {
      this.addToSyncQueue({
        id: newRecord.id,
        entity: 'ATTENDANCE_RECORD',
        action: 'CREATE',
        payload: newRecord,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        isOfflineCreated: true
      });
    } else {
      setDoc(doc(db, 'attendance_records', newRecord.id), sanitizeForFirestore(newRecord)).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, `attendance_records/${newRecord.id}`);
        this.addToSyncQueue({
          id: newRecord.id,
          entity: 'ATTENDANCE_RECORD',
          action: 'CREATE',
          payload: newRecord,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          lastError: err instanceof Error ? err.message : String(err),
          isOfflineCreated: true
        });
      });
    }

    return {
      success: true,
      userType: 'STUDENT',
      message: `Manual Absensi Berhasil untuk ${student.name} ${isOffline ? '(Tersimpan Offline)' : ''}`,
      record: newRecord,
      student,
      isOfflineSaved: isOffline
    };
  }

  // --- BACKUP & RESTORE DATABASE ---
  static generateBackupData(): DatabaseBackup {
    const students = this.getStudents();
    const teachers = this.getTeachers();
    const classes = this.getClasses();
    const schedule = this.getSchedule();
    const attendanceRecords = this.getAttendanceRecords();
    const systemUsers = this.getSystemUsers();

    return {
      appVersion: '2.0-cloud',
      exportDate: new Date().toISOString(),
      schoolName: schedule.schoolName || 'SMK EKONOMIKA DEPOK',
      counts: {
        students: students.length,
        teachers: teachers.length,
        classes: classes.length,
        attendanceRecords: attendanceRecords.length,
        systemUsers: systemUsers.length
      },
      data: {
        students,
        teachers,
        classes,
        schedule,
        attendanceRecords,
        systemUsers
      }
    };
  }

  static downloadBackupFile() {
    const backup = this.generateBackupData();
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `BACKUP_ABSENSI_SMK_EKONOMIKA_${today}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  static async restoreBackupData(backupJson: DatabaseBackup): Promise<{ success: boolean; message: string; counts?: { students: number; teachers?: number; classes: number; attendance: number; systemUsers?: number } }> {
    try {
      if (!backupJson || !backupJson.data) {
        return { success: false, message: 'Format file cadangan tidak valid (Struktur data kosong)!' };
      }

      const { students, teachers, classes, schedule, attendanceRecords, systemUsers } = backupJson.data;

      if (!Array.isArray(students) || !Array.isArray(classes)) {
        return { success: false, message: 'File cadangan rusak: Siswa atau Kelas tidak berupa daftar yang valid.' };
      }

      // 1. Update local storage
      if (students) localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
      if (teachers && Array.isArray(teachers)) localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
      if (classes) localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
      if (schedule) localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
      if (attendanceRecords) localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendanceRecords));
      if (systemUsers && Array.isArray(systemUsers) && systemUsers.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SYSTEM_USERS, JSON.stringify(systemUsers));
      }

      // 2. Batch write to Firestore Cloud
      const batch = writeBatch(db);

      // Restore students
      for (const s of students) {
        batch.set(doc(db, 'students', s.id), sanitizeForFirestore(s));
      }

      // Restore teachers
      if (teachers && Array.isArray(teachers)) {
        for (const t of teachers) {
          batch.set(doc(db, 'teachers', t.id), sanitizeForFirestore(t));
        }
      }

      // Restore classes
      for (const c of classes) {
        const id = c.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        batch.set(doc(db, 'classes', id), sanitizeForFirestore({ id, name: c }));
      }

      // Restore schedule
      if (schedule) {
        batch.set(doc(db, 'settings', 'school_schedule'), sanitizeForFirestore(schedule));
      }

      // Restore records (up to 400 records per batch)
      if (attendanceRecords && Array.isArray(attendanceRecords)) {
        for (const r of attendanceRecords.slice(0, 400)) {
          batch.set(doc(db, 'attendance_records', r.id), sanitizeForFirestore(r));
        }
      }

      // Restore system users
      if (systemUsers && Array.isArray(systemUsers) && systemUsers.length > 0) {
        for (const u of systemUsers) {
          batch.set(doc(db, 'system_users', u.id), sanitizeForFirestore(u));
        }
      }

      await batch.commit();

      // 3. Broadcast sync
      this.broadcastSync('BACKUP_RESTORED');

      return {
        success: true,
        message: `Database berhasil dipulihkan! (${students.length} Siswa, ${(teachers || []).length} Guru, ${classes.length} Kelas, ${(attendanceRecords || []).length} Riwayat Presensi, ${(systemUsers || []).length} Akun Pengguna)`,
        counts: {
          students: students.length,
          teachers: (teachers || []).length,
          classes: classes.length,
          attendance: (attendanceRecords || []).length,
          systemUsers: (systemUsers || []).length
        }
      };
    } catch (err) {
      console.error('Error during database restore:', err);
      return {
        success: false,
        message: `Gagal memulihkan database: ${err instanceof Error ? err.message : 'Kesalahan internal'}`
      };
    }
  }

  // --- STATS CALCULATOR FOR STUDENTS ---
  static getStatsToday(): AttendanceStats {
    const students = this.getStudents();
    const records = this.getAttendanceRecords();
    const todayStr = this.getTodayDate();

    // Filter student records only
    const todayRecords = records.filter(r => r.dateFormatted === todayStr && (r.userType === 'STUDENT' || (!r.userType && !r.teacherId)));

    const checkIns = todayRecords.filter(r => r.type === 'MASUK');
    const checkOuts = todayRecords.filter(r => r.type === 'PULANG');

    const totalOnTime = checkIns.filter(r => r.status === 'TEPAT_WAKTU').length;
    const totalLate = checkIns.filter(r => r.status === 'TERLAMBAT').length;
    const totalPresentToday = checkIns.length;

    const frontGateCount = todayRecords.filter(r => r.gateLocation === 'pintu_depan').length;
    const backGateCount = todayRecords.filter(r => r.gateLocation === 'pintu_belakang').length;

    const totalStudents = students.length;
    const totalAlpha = Math.max(0, totalStudents - totalPresentToday);

    return {
      totalStudents,
      totalPresentToday,
      totalOnTime,
      totalLate,
      totalCheckoutsToday: checkOuts.length,
      totalAlpha,
      frontGateCount,
      backGateCount
    };
  }

  // --- STATS CALCULATOR FOR TEACHERS ---
  static getTeacherStatsToday(): TeacherAttendanceStats {
    const teachers = this.getTeachers();
    const records = this.getAttendanceRecords();
    const todayStr = this.getTodayDate();

    // Filter teacher records only
    const todayRecords = records.filter(r => r.dateFormatted === todayStr && (r.userType === 'TEACHER' || !!r.teacherId));

    const checkIns = todayRecords.filter(r => r.type === 'MASUK');
    const checkOuts = todayRecords.filter(r => r.type === 'PULANG');

    const totalOnTime = checkIns.filter(r => r.status === 'TEPAT_WAKTU').length;
    const totalLate = checkIns.filter(r => r.status === 'TERLAMBAT').length;
    const totalPresentToday = checkIns.length;

    const frontGateCount = todayRecords.filter(r => r.gateLocation === 'pintu_depan').length;
    const backGateCount = todayRecords.filter(r => r.gateLocation === 'pintu_belakang').length;

    return {
      totalTeachers: teachers.length,
      totalPresentToday,
      totalOnTime,
      totalLate,
      totalCheckoutsToday: checkOuts.length,
      frontGateCount,
      backGateCount
    };
  }

  // --- LEADERBOARD & CHRONOLOGICAL ARRIVAL RANKING FOR TODAY ---
  static getArrivalRankingToday(filterType: 'ALL' | 'STUDENT' | 'TEACHER' = 'ALL') {
    const records = this.getAttendanceRecords();
    const todayStr = this.getTodayDate();
    
    let todayCheckIns = records.filter(r => r.dateFormatted === todayStr && r.type === 'MASUK');
    if (filterType === 'STUDENT') {
      todayCheckIns = todayCheckIns.filter(r => r.userType === 'STUDENT' || (!r.userType && !r.teacherId));
    } else if (filterType === 'TEACHER') {
      todayCheckIns = todayCheckIns.filter(r => r.userType === 'TEACHER' || !!r.teacherId);
    }

    const sorted = [...todayCheckIns].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return sorted.map((rec, index) => ({
      rank: index + 1,
      record: rec,
      isEarlyBird: index === 0,
      isTopThree: index < 3,
      isLate: rec.status === 'TERLAMBAT'
    }));
  }

  // --- KIOSK LOCK SCREEN & SECURITY PIN ---
  static getKioskPin(): string {
    if (typeof window === 'undefined') return '1234';
    const schedule = this.getSchedule();
    if (schedule.kioskPin && schedule.kioskPin.trim().length >= 4) {
      return schedule.kioskPin.trim();
    }
    const stored = localStorage.getItem(STORAGE_KEYS.KIOSK_PIN);
    return stored && stored.trim().length >= 4 ? stored.trim() : '1234';
  }

  static setKioskPin(pin: string): { success: boolean; message: string } {
    if (!pin || pin.trim().length < 4) {
      return { success: false, message: 'PIN Kiosk minimal 4 angka!' };
    }
    const cleanPin = pin.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.KIOSK_PIN, cleanPin);
    }
    const schedule = this.getSchedule();
    schedule.kioskPin = cleanPin;
    this.saveSchedule(schedule);
    return { success: true, message: 'PIN Keamanan Kiosk berhasil diperbarui!' };
  }

  static isKioskLocked(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEYS.KIOSK_LOCKED);
    return stored === 'true';
  }

  static setKioskLocked(locked: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.KIOSK_LOCKED, locked ? 'true' : 'false');
    this.broadcastSync('KIOSK_LOCK_CHANGED');
  }

  static verifyKioskPin(inputPin: string): boolean {
    const validPin = this.getKioskPin();
    return (inputPin || '').trim() === validPin;
  }

  // --- LEADERBOARD: PERINGKAT SISWA PALING SERING TERLAMBAT (KHUSUS MURID SAJA TANPA GURU) ---
  static getStudentLateRankings(options?: {
    period?: 'today' | 'this_week' | 'this_month' | 'this_semester' | 'all_time' | 'custom';
    startDate?: string;
    endDate?: string;
    classFilter?: string;
  }): StudentLateRankItem[] {
    const students = this.getStudents();
    const records = this.getAttendanceRecords();
    const now = new Date();
    const todayStr = this.getTodayDate();
    const period = options?.period || 'this_month';
    const classFilter = options?.classFilter || 'ALL';

    let start = '1970-01-01';
    let end = '2099-12-31';

    if (period === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (period === 'this_week') {
      const current = new Date();
      const day = current.getDay(); // 0 is Sunday
      const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
      const monday = new Date(current.setDate(diff));
      start = monday.toISOString().split('T')[0];
      end = todayStr;
    } else if (period === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      start = `${year}-${month}-01`;
      end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'this_semester') {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      if (month >= 7) {
        start = `${year}-07-01`;
        end = `${year}-12-31`;
      } else {
        start = `${year}-01-01`;
        end = `${year}-06-30`;
      }
    } else if (period === 'custom' && options?.startDate && options?.endDate) {
      start = options.startDate;
      end = options.endDate;
    }

    // STRICT FILTER: Siswa saja, type MASUK, status TERLAMBAT (atau lateMinutes > 0), dalam rentang tanggal
    const lateStudentRecords = records.filter(r => {
      // Exclude teachers strictly
      if (r.userType === 'TEACHER' || !!r.teacherId) return false;
      if (r.type !== 'MASUK') return false;
      if (r.status !== 'TERLAMBAT' && (!r.lateMinutes || r.lateMinutes <= 0)) return false;
      
      const recDate = r.dateFormatted || r.timestamp?.split('T')[0];
      if (recDate < start || recDate > end) return false;

      if (classFilter !== 'ALL' && (r.studentClass || '').trim() !== classFilter.trim()) {
        return false;
      }
      return true;
    });

    // Group by studentId / studentName
    const studentMap = new Map<string, {
      student: Student;
      records: AttendanceRecord[];
      totalLateMinutes: number;
      maxLateMinutes: number;
      latestDate: string;
      latestTime: string;
    }>();

    // Map of existing students for quick lookup
    const studentsById = new Map<string, Student>();
    students.forEach(s => studentsById.set(s.id, s));

    lateStudentRecords.forEach(rec => {
      const stdId = rec.studentId || rec.rfidUid || rec.studentName || 'unknown';
      let student = studentsById.get(rec.studentId || '');
      if (!student) {
        student = students.find(s => s.name.toLowerCase() === (rec.studentName || '').toLowerCase()) || {
          id: stdId,
          name: rec.studentName || 'Siswa',
          nisn: rec.nisn || '-',
          class: rec.studentClass || '-',
          rfidUid: rec.rfidUid
        };
      }

      if (classFilter !== 'ALL' && student.class !== classFilter) {
        return;
      }

      const existing = studentMap.get(stdId) || {
        student,
        records: [],
        totalLateMinutes: 0,
        maxLateMinutes: 0,
        latestDate: '',
        latestTime: ''
      };

      const lateMins = rec.lateMinutes || 1;
      existing.records.push(rec);
      existing.totalLateMinutes += lateMins;
      if (lateMins > existing.maxLateMinutes) {
        existing.maxLateMinutes = lateMins;
      }

      if (!existing.latestDate || rec.dateFormatted > existing.latestDate) {
        existing.latestDate = rec.dateFormatted;
        existing.latestTime = rec.timeFormatted;
      }

      studentMap.set(stdId, existing);
    });

    // Sort items by lateCount DESC, then totalLateMinutes DESC
    const followUpsMap = this.getLateFollowUps();
    const sortedList = Array.from(studentMap.values())
      .map(item => {
        const lateCount = item.records.length;
        const avgLateMinutes = Math.round(item.totalLateMinutes / lateCount);
        let severity: 'CRITICAL' | 'WARNING' | 'CAUTION' = 'CAUTION';
        if (lateCount >= 5 || item.totalLateMinutes >= 120) {
          severity = 'CRITICAL';
        } else if (lateCount >= 3 || item.totalLateMinutes >= 60) {
          severity = 'WARNING';
        }

        const followUp = followUpsMap[item.student.id] || followUpsMap[item.student.nisn] || undefined;

        return {
          student: item.student,
          studentId: item.student.id,
          studentName: item.student.name,
          nis: item.student.nis,
          nisn: item.student.nisn,
          studentClass: item.student.class,
          lateCount,
          totalLateMinutes: item.totalLateMinutes,
          avgLateMinutes,
          maxLateMinutes: item.maxLateMinutes,
          latestLateDate: item.latestDate,
          latestLateTime: item.latestTime,
          severity,
          records: item.records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          followUp
        };
      })
      .sort((a, b) => {
        if (b.lateCount !== a.lateCount) {
          return b.lateCount - a.lateCount;
        }
        return b.totalLateMinutes - a.totalLateMinutes;
      });

    return sortedList.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }

  // --- LEADERBOARD: PERINGKAT SISWA PALING AWAL / TERPAGI & RAJIN (KHUSUS MURID TANPA GURU) ---
  static getStudentEarlyRankings(options?: {
    period?: 'today' | 'this_week' | 'this_month' | 'this_semester' | 'all_time' | 'custom';
    startDate?: string;
    endDate?: string;
    classFilter?: string;
  }): StudentEarlyRankItem[] {
    const students = this.getStudents();
    const records = this.getAttendanceRecords();
    const now = new Date();
    const todayStr = this.getTodayDate();
    const period = options?.period || 'this_month';
    const classFilter = options?.classFilter || 'ALL';

    let start = '1970-01-01';
    let end = '2099-12-31';

    if (period === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (period === 'this_week') {
      const current = new Date();
      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(current.setDate(diff));
      start = monday.toISOString().split('T')[0];
      end = todayStr;
    } else if (period === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      start = `${year}-${month}-01`;
      end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'this_semester') {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      if (month >= 7) {
        start = `${year}-07-01`;
        end = `${year}-12-31`;
      } else {
        start = `${year}-01-01`;
        end = `${year}-06-30`;
      }
    } else if (period === 'custom' && options?.startDate && options?.endDate) {
      start = options.startDate;
      end = options.endDate;
    }

    // STRICT FILTER: Siswa saja, type MASUK, dalam rentang tanggal
    const checkInRecords = records.filter(r => {
      if (r.userType === 'TEACHER' || !!r.teacherId) return false;
      if (r.type !== 'MASUK') return false;
      
      const recDate = r.dateFormatted || r.timestamp?.split('T')[0];
      if (recDate < start || recDate > end) return false;

      if (classFilter !== 'ALL' && (r.studentClass || '').trim() !== classFilter.trim()) {
        return false;
      }
      return true;
    });

    const studentMap = new Map<string, {
      student: Student;
      records: AttendanceRecord[];
      onTimeCount: number;
      totalPresent: number;
      earliestTime: string;
      earliestDate: string;
      totalMinutesSum: number;
      topRankCount: number;
    }>();

    const studentsById = new Map<string, Student>();
    students.forEach(s => studentsById.set(s.id, s));

    checkInRecords.forEach(rec => {
      const stdId = rec.studentId || rec.rfidUid || rec.studentName || 'unknown';
      let student = studentsById.get(rec.studentId || '');
      if (!student) {
        student = students.find(s => s.name.toLowerCase() === (rec.studentName || '').toLowerCase()) || {
          id: stdId,
          name: rec.studentName || 'Siswa',
          nisn: rec.nisn || '-',
          class: rec.studentClass || '-',
          rfidUid: rec.rfidUid
        };
      }

      if (classFilter !== 'ALL' && student.class !== classFilter) {
        return;
      }

      const existing = studentMap.get(stdId) || {
        student,
        records: [],
        onTimeCount: 0,
        totalPresent: 0,
        earliestTime: '23:59:59',
        earliestDate: '',
        totalMinutesSum: 0,
        topRankCount: 0
      };

      existing.records.push(rec);
      existing.totalPresent += 1;

      if (rec.status === 'TEPAT_WAKTU') {
        existing.onTimeCount += 1;
      }

      if (rec.arrivalRank && rec.arrivalRank <= 3) {
        existing.topRankCount += 1;
      }

      const timeStr = rec.timeFormatted || '07:00';
      const [hh, mm] = timeStr.split(':').map(Number);
      const minutesOfDay = (isNaN(hh) ? 7 : hh) * 60 + (isNaN(mm) ? 0 : mm);
      existing.totalMinutesSum += minutesOfDay;

      if (timeStr < existing.earliestTime) {
        existing.earliestTime = timeStr;
        existing.earliestDate = rec.dateFormatted;
      }

      studentMap.set(stdId, existing);
    });

    const sortedList = Array.from(studentMap.values())
      .map(item => {
        const count = item.totalPresent;
        const avgMinutes = count > 0 ? Math.round(item.totalMinutesSum / count) : 420;
        const avgH = String(Math.floor(avgMinutes / 60)).padStart(2, '0');
        const avgM = String(avgMinutes % 60).padStart(2, '0');
        const avgArrivalTime = `${avgH}:${avgM}`;

        return {
          student: item.student,
          studentId: item.student.id,
          studentName: item.student.name,
          nis: item.student.nis,
          nisn: item.student.nisn,
          studentClass: item.student.class,
          onTimeCount: item.onTimeCount,
          totalPresent: item.totalPresent,
          earliestTime: item.earliestTime === '23:59:59' ? '-' : item.earliestTime,
          earliestDate: item.earliestDate,
          avgArrivalTime,
          topRankCount: item.topRankCount,
          records: item.records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        };
      })
      .sort((a, b) => {
        if (options?.period === 'today') {
          return a.earliestTime.localeCompare(b.earliestTime);
        }
        // Periode bulan: rata-rata waktu kedatangan
        if (a.avgArrivalTime !== b.avgArrivalTime) {
          return a.avgArrivalTime.localeCompare(b.avgArrivalTime);
        }
        return b.onTimeCount - a.onTimeCount;
      });

    return sortedList.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }

  // --- LEADERBOARD: PERINGKAT GURU & KARYAWAN PALING SERING TERLAMBAT ---
  static getTeacherLateRankings(options?: {
    period?: 'today' | 'this_week' | 'this_month' | 'this_semester' | 'all_time' | 'custom';
    startDate?: string;
    endDate?: string;
  }): TeacherLateRankItem[] {
    const teachers = this.getTeachers();
    const records = this.getAttendanceRecords();
    const now = new Date();
    const todayStr = this.getTodayDate();
    const period = options?.period || 'this_month';

    let start = '1970-01-01';
    let end = '2099-12-31';

    if (period === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (period === 'this_week') {
      const current = new Date();
      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(current.setDate(diff));
      start = monday.toISOString().split('T')[0];
      end = todayStr;
    } else if (period === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      start = `${year}-${month}-01`;
      end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'this_semester') {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      if (month >= 7) {
        start = `${year}-07-01`;
        end = `${year}-12-31`;
      } else {
        start = `${year}-01-01`;
        end = `${year}-06-30`;
      }
    } else if (period === 'custom' && options?.startDate && options?.endDate) {
      start = options.startDate;
      end = options.endDate;
    }

    // STRICT: Hanya Guru, MASUK, status TERLAMBAT atau lateMinutes > 0
    const lateTeacherRecords = records.filter(r => {
      if (r.userType !== 'TEACHER' && !r.teacherId) return false;
      if (r.type !== 'MASUK') return false;
      if (r.status !== 'TERLAMBAT' && (!r.lateMinutes || r.lateMinutes <= 0)) return false;

      const recDate = r.dateFormatted || r.timestamp?.split('T')[0];
      return recDate >= start && recDate <= end;
    });

    const teacherMap = new Map<string, {
      teacher: Teacher;
      records: AttendanceRecord[];
      totalLateMinutes: number;
      maxLateMinutes: number;
      latestDate: string;
      latestTime: string;
      totalMinutesSum: number;
    }>();

    const teachersById = new Map<string, Teacher>();
    teachers.forEach(t => teachersById.set(t.id, t));

    lateTeacherRecords.forEach(rec => {
      const tchId = rec.teacherId || rec.rfidUid || rec.teacherName || 'unknown';
      let teacher = teachersById.get(rec.teacherId || '');
      if (!teacher) {
        teacher = teachers.find(t => t.name.toLowerCase() === (rec.teacherName || '').toLowerCase()) || {
          id: tchId,
          name: rec.teacherName || 'Guru',
          nip: rec.nip || '-',
          position: rec.teacherPosition || 'Tenaga Pendidik',
          rfidUid: rec.rfidUid
        };
      }

      const existing = teacherMap.get(tchId) || {
        teacher,
        records: [],
        totalLateMinutes: 0,
        maxLateMinutes: 0,
        latestDate: '',
        latestTime: '',
        totalMinutesSum: 0
      };

      const lateMins = rec.lateMinutes || 1;
      existing.records.push(rec);
      existing.totalLateMinutes += lateMins;
      if (lateMins > existing.maxLateMinutes) {
        existing.maxLateMinutes = lateMins;
      }

      const timeStr = rec.timeFormatted || '07:16';
      const [hh, mm] = timeStr.split(':').map(Number);
      const minutesOfDay = (isNaN(hh) ? 7 : hh) * 60 + (isNaN(mm) ? 16 : mm);
      existing.totalMinutesSum += minutesOfDay;

      if (!existing.latestDate || rec.dateFormatted > existing.latestDate) {
        existing.latestDate = rec.dateFormatted;
        existing.latestTime = rec.timeFormatted;
      }

      teacherMap.set(tchId, existing);
    });

    const sortedList = Array.from(teacherMap.values())
      .map(item => {
        const lateCount = item.records.length;
        const avgLateMinutes = Math.round(item.totalLateMinutes / lateCount);
        const avgMinutes = lateCount > 0 ? Math.round(item.totalMinutesSum / lateCount) : 435;
        const avgH = String(Math.floor(avgMinutes / 60)).padStart(2, '0');
        const avgM = String(avgMinutes % 60).padStart(2, '0');
        const avgArrivalTime = `${avgH}:${avgM}`;

        return {
          teacher: item.teacher,
          teacherId: item.teacher.id,
          teacherName: item.teacher.name,
          nip: item.teacher.nip,
          position: item.teacher.position,
          lateCount,
          totalLateMinutes: item.totalLateMinutes,
          avgLateMinutes,
          maxLateMinutes: item.maxLateMinutes,
          latestLateDate: item.latestDate,
          latestLateTime: item.latestTime,
          avgArrivalTime,
          records: item.records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        };
      })
      .sort((a, b) => {
        if (b.lateCount !== a.lateCount) {
          return b.lateCount - a.lateCount;
        }
        return b.totalLateMinutes - a.totalLateMinutes;
      });

    return sortedList.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }

  // --- LEADERBOARD: PERINGKAT GURU & KARYAWAN PALING AWAL / TERPAGI & DISIPLIN ---
  static getTeacherEarlyRankings(options?: {
    period?: 'today' | 'this_week' | 'this_month' | 'this_semester' | 'all_time' | 'custom';
    startDate?: string;
    endDate?: string;
  }): TeacherEarlyRankItem[] {
    const teachers = this.getTeachers();
    const records = this.getAttendanceRecords();
    const now = new Date();
    const todayStr = this.getTodayDate();
    const period = options?.period || 'this_month';

    let start = '1970-01-01';
    let end = '2099-12-31';

    if (period === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (period === 'this_week') {
      const current = new Date();
      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(current.setDate(diff));
      start = monday.toISOString().split('T')[0];
      end = todayStr;
    } else if (period === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      start = `${year}-${month}-01`;
      end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'this_semester') {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      if (month >= 7) {
        start = `${year}-07-01`;
        end = `${year}-12-31`;
      } else {
        start = `${year}-01-01`;
        end = `${year}-06-30`;
      }
    } else if (period === 'custom' && options?.startDate && options?.endDate) {
      start = options.startDate;
      end = options.endDate;
    }

    const checkInRecords = records.filter(r => {
      if (r.userType !== 'TEACHER' && !r.teacherId) return false;
      if (r.type !== 'MASUK') return false;

      const recDate = r.dateFormatted || r.timestamp?.split('T')[0];
      return recDate >= start && recDate <= end;
    });

    const teacherMap = new Map<string, {
      teacher: Teacher;
      records: AttendanceRecord[];
      onTimeCount: number;
      totalPresent: number;
      earliestTime: string;
      earliestDate: string;
      totalMinutesSum: number;
      topRankCount: number;
    }>();

    const teachersById = new Map<string, Teacher>();
    teachers.forEach(t => teachersById.set(t.id, t));

    checkInRecords.forEach(rec => {
      const tchId = rec.teacherId || rec.rfidUid || rec.teacherName || 'unknown';
      let teacher = teachersById.get(rec.teacherId || '');
      if (!teacher) {
        teacher = teachers.find(t => t.name.toLowerCase() === (rec.teacherName || '').toLowerCase()) || {
          id: tchId,
          name: rec.teacherName || 'Guru',
          nip: rec.nip || '-',
          position: rec.teacherPosition || 'Tenaga Pendidik',
          rfidUid: rec.rfidUid
        };
      }

      const existing = teacherMap.get(tchId) || {
        teacher,
        records: [],
        onTimeCount: 0,
        totalPresent: 0,
        earliestTime: '23:59:59',
        earliestDate: '',
        totalMinutesSum: 0,
        topRankCount: 0
      };

      existing.records.push(rec);
      existing.totalPresent += 1;

      if (rec.status === 'TEPAT_WAKTU') {
        existing.onTimeCount += 1;
      }

      if (rec.arrivalRank && rec.arrivalRank <= 3) {
        existing.topRankCount += 1;
      }

      const timeStr = rec.timeFormatted || '06:45';
      const [hh, mm] = timeStr.split(':').map(Number);
      const minutesOfDay = (isNaN(hh) ? 6 : hh) * 60 + (isNaN(mm) ? 45 : mm);
      existing.totalMinutesSum += minutesOfDay;

      if (timeStr < existing.earliestTime) {
        existing.earliestTime = timeStr;
        existing.earliestDate = rec.dateFormatted;
      }

      teacherMap.set(tchId, existing);
    });

    const sortedList = Array.from(teacherMap.values())
      .map(item => {
        const count = item.totalPresent;
        const avgMinutes = count > 0 ? Math.round(item.totalMinutesSum / count) : 420;
        const avgH = String(Math.floor(avgMinutes / 60)).padStart(2, '0');
        const avgM = String(avgMinutes % 60).padStart(2, '0');
        const avgArrivalTime = `${avgH}:${avgM}`;

        return {
          teacher: item.teacher,
          teacherId: item.teacher.id,
          teacherName: item.teacher.name,
          nip: item.teacher.nip,
          position: item.teacher.position,
          onTimeCount: item.onTimeCount,
          totalPresent: item.totalPresent,
          earliestTime: item.earliestTime === '23:59:59' ? '-' : item.earliestTime,
          earliestDate: item.earliestDate,
          avgArrivalTime,
          topRankCount: item.topRankCount,
          records: item.records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        };
      })
      .sort((a, b) => {
        if (options?.period === 'today') {
          return a.earliestTime.localeCompare(b.earliestTime);
        }
        if (a.avgArrivalTime !== b.avgArrivalTime) {
          return a.avgArrivalTime.localeCompare(b.avgArrivalTime);
        }
        return b.onTimeCount - a.onTimeCount;
      });

    return sortedList.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }

  // =========================================================================
  // ALUMNI & ACADEMIC YEAR ROLLOVER MANAGEMENT
  // =========================================================================

  static getAlumniStudents(): AlumniStudent[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ALUMNI);
    if (!data) return [];
    try {
      const parsed: AlumniStudent[] = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async saveAlumniStudents(alumni: AlumniStudent[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ALUMNI, JSON.stringify(alumni));
    this.broadcastSync('ALUMNI_UPDATED');

    // Sync in background to Cloud Firestore
    try {
      const snap = await getDocs(collection(db, 'alumni'));
      const activeIds = new Set(alumni.map(a => a.id));
      const batch = writeBatch(db);

      snap.forEach(docSnap => {
        if (!activeIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });

      for (const a of alumni) {
        batch.set(doc(db, 'alumni', a.id), sanitizeForFirestore(a));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'alumni');
    }
  }

  static addAlumniStudent(student: AlumniStudent): AlumniStudent[] {
    const list = this.getAlumniStudents();
    const updated = [student, ...list];
    this.saveAlumniStudents(updated);
    return updated;
  }

  static deleteAlumniStudent(id: string): AlumniStudent[] {
    const list = this.getAlumniStudents();
    const updated = list.filter(a => a.id !== id);
    this.saveAlumniStudents(updated);
    return updated;
  }

  static getAcademicYearArchives(): AcademicYearArchive[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ACADEMIC_ARCHIVES);
    if (!data) return [];
    try {
      const parsed: AcademicYearArchive[] = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async saveAcademicYearArchives(archives: AcademicYearArchive[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ACADEMIC_ARCHIVES, JSON.stringify(archives));
    this.broadcastSync('ACADEMIC_ARCHIVES_UPDATED');

    try {
      const snap = await getDocs(collection(db, 'academic_archives'));
      const activeIds = new Set(archives.map(a => a.id));
      const batch = writeBatch(db);

      snap.forEach(docSnap => {
        if (!activeIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });

      for (const a of archives) {
        batch.set(doc(db, 'academic_archives', a.id), sanitizeForFirestore(a));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'academic_archives');
    }
  }

  // Otomatis ubah tingkat romawi dari X ke XI dan XI ke XII; Kelas XII Lulus
  static promoteClassName(currentClass: string): { newClass: string; isGraduated: boolean } {
    const trimmed = (currentClass || '').trim();
    if (!trimmed) {
      return { newClass: '-', isGraduated: false };
    }

    // 1. Cek Kelas XII / Tingkat 12 (Siswa Lulus)
    if (/^(XII|12)\b/i.test(trimmed)) {
      return { newClass: trimmed, isGraduated: true };
    }

    // 2. Cek Kelas XI / Tingkat 11 -> Naik ke Kelas XII
    if (/^XI\b/i.test(trimmed)) {
      return { newClass: trimmed.replace(/^XI\b/i, 'XII'), isGraduated: false };
    }
    if (/^11\b/i.test(trimmed)) {
      return { newClass: trimmed.replace(/^11\b/i, '12'), isGraduated: false };
    }

    // 3. Cek Kelas X / Tingkat 10 -> Naik ke Kelas XI
    if (/^X\b/i.test(trimmed)) {
      return { newClass: trimmed.replace(/^X\b/i, 'XI'), isGraduated: false };
    }
    if (/^10\b/i.test(trimmed)) {
      return { newClass: trimmed.replace(/^10\b/i, '11'), isGraduated: false };
    }

    // Fallback regex jika terdapat di tengah kata rombel
    if (/\bXII\b/i.test(trimmed) || /\b12\b/i.test(trimmed)) {
      return { newClass: trimmed, isGraduated: true };
    }
    if (/\bXI\b/i.test(trimmed)) {
      return { newClass: trimmed.replace(/\bXI\b/i, 'XII'), isGraduated: false };
    }
    if (/\bX\b/i.test(trimmed)) {
      return { newClass: trimmed.replace(/\bX\b/i, 'XI'), isGraduated: false };
    }

    return { newClass: trimmed, isGraduated: false };
  }

  // Pratinjau kenaikan kelas dan kelulusan tahun ajaran baru tanpa mengubah data
  static previewAcademicRollover(nextAcademicYear: string) {
    const students = this.getStudents();
    const schedule = this.getSchedule();
    const currentAcademicYear = schedule.academicYear || '2026/2027';
    const promotions: Array<{
      student: Student;
      oldClass: string;
      newClass: string;
      isGraduated: boolean;
    }> = [];

    let toPromoteXI = 0;
    let toPromoteXII = 0;
    let toGraduate = 0;
    const neededClasses = new Set<string>();

    for (const s of students) {
      const res = this.promoteClassName(s.class);
      promotions.push({
        student: s,
        oldClass: s.class,
        newClass: res.newClass,
        isGraduated: res.isGraduated
      });
      if (res.isGraduated) {
        toGraduate++;
      } else {
        if (res.newClass.startsWith('XII') || res.newClass.startsWith('12')) {
          toPromoteXII++;
        } else if (res.newClass.startsWith('XI') || res.newClass.startsWith('11')) {
          toPromoteXI++;
        }
        neededClasses.add(res.newClass);
      }
    }

    const records = this.getAttendanceRecords();

    return {
      currentAcademicYear,
      nextAcademicYear,
      totalActiveStudents: students.length,
      promotions,
      toPromoteXI,
      toPromoteXII,
      toGraduate,
      totalRecordsToArchive: records.length,
      neededClasses: Array.from(neededClasses).sort()
    };
  }

  // Eksekusi Kenaikan Kelas, Kelulusan Kelas XII, Pembekuan Rekap 1 Tahun & Reset Bersih Presensi
  static async executeAcademicYearRollover(params: {
    nextAcademicYear: string;
    adminName: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    message: string;
    promotedCount: number;
    graduatedCount: number;
    archivedCount: number;
  }> {
    try {
      const students = this.getStudents();
      const records = this.getAttendanceRecords();
      const schedule = this.getSchedule();
      const existingAlumni = this.getAlumniStudents();
      const existingArchives = this.getAcademicYearArchives();
      const existingClasses = this.getClasses();

      const currentAcademicYear = schedule.academicYear || '2026/2027';
      const cleanNextYear = params.nextAcademicYear.trim() || '2027/2028';

      const promotedStudents: Student[] = [];
      const newAlumniList: AlumniStudent[] = [];
      const updatedClassesSet = new Set<string>(existingClasses);

      for (const s of students) {
        const promo = this.promoteClassName(s.class);
        if (promo.isGraduated) {
          newAlumniList.push({
            id: `alm-${s.id}-${Date.now()}`,
            name: s.name,
            nisn: s.nisn,
            lastClass: s.class,
            graduationYear: currentAcademicYear,
            graduatedAt: new Date().toISOString(),
            rfidUid: s.rfidUid,
            phone: s.phone,
            gender: s.gender,
            notes: `Lulus resmi pada evaluasi akhir Tahun Ajaran ${currentAcademicYear}.`
          });
        } else {
          promotedStudents.push({
            ...s,
            class: promo.newClass
          });
          updatedClassesSet.add(promo.newClass);
        }
      }

      // 1. Simpan Arsip Riwayat Akademik 1 Tahun Ajaran Lampau
      const archiveRecord: AcademicYearArchive = {
        id: `archive-ta-${currentAcademicYear.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
        academicYear: currentAcademicYear,
        nextAcademicYear: cleanNextYear,
        archivedAt: new Date().toISOString(),
        archivedBy: params.adminName || 'Super Administrator',
        totalStudentsActive: students.length,
        totalPromoted: promotedStudents.length,
        totalGraduated: newAlumniList.length,
        totalArchivedRecords: records.length,
        studentRecordsSummary: {
          totalPresent: records.filter(r => (r.userType === 'STUDENT' || !r.teacherId) && r.type === 'MASUK').length,
          totalLate: records.filter(r => (r.userType === 'STUDENT' || !r.teacherId) && r.status === 'TERLAMBAT').length,
          totalAlpha: 0,
          totalPermission: records.filter(r => (r.userType === 'STUDENT' || !r.teacherId) && r.status === 'IZIN').length,
          totalSick: records.filter(r => (r.userType === 'STUDENT' || !r.teacherId) && r.status === 'SAKIT').length
        },
        teacherRecordsSummary: {
          totalPresent: records.filter(r => (r.userType === 'TEACHER' || !!r.teacherId) && r.type === 'MASUK').length,
          totalLate: records.filter(r => (r.userType === 'TEACHER' || !!r.teacherId) && r.status === 'TERLAMBAT').length
        },
        graduatedStudents: newAlumniList,
        notes: params.notes || `Kenaikan rombel X ke XI, XI ke XII, kelulusan XII, dan pembekuan rekapitulasi presensi TA ${currentAcademicYear}.`
      };

      const updatedArchives = [archiveRecord, ...existingArchives];
      await this.saveAcademicYearArchives(updatedArchives);

      // 2. Simpan Data Alumni (Siswa Kelas XII yang Lulus)
      const updatedAlumni = [...newAlumniList, ...existingAlumni];
      await this.saveAlumniStudents(updatedAlumni);

      // 3. Simpan Siswa yang Naik Kelas (Siswa aktif kini X->XI dan XI->XII)
      await this.saveStudents(promotedStudents);

      // 4. Update Daftar Kelas (pastikan kelas baru terdaftar)
      const finalClasses = Array.from(updatedClassesSet).sort();
      await this.saveClasses(finalClasses);

      // 5. Bersihkan Log Presensi Harian Siswa Aktif (Fresh Start untuk Tahun Ajaran Baru)
      await this.saveAttendanceRecords([]);

      // 6. Perbarui Tahun Ajaran di Jadwal Sekolah
      const updatedSchedule: SchoolSchedule = {
        ...schedule,
        academicYear: cleanNextYear
      };
      await this.saveSchedule(updatedSchedule);

      // 7. Siarkan event sinkronisasi
      this.broadcastSync('ACADEMIC_ROLLOVER_COMPLETED', {
        academicYear: cleanNextYear,
        promotedCount: promotedStudents.length,
        graduatedCount: newAlumniList.length
      });

      return {
        success: true,
        message: `Tahun Ajaran Baru ${cleanNextYear} berhasil dimulai! ${promotedStudents.length} siswa naik kelas, ${newAlumniList.length} siswa kelas XII lulus ke Alumni, dan ${records.length} rekaman presensi dibekukan ke arsip.`,
        promotedCount: promotedStudents.length,
        graduatedCount: newAlumniList.length,
        archivedCount: records.length
      };
    } catch (err: any) {
      console.error('Error during academic rollover execution:', err);
      return {
        success: false,
        message: `Gagal memproses pergantian tahun ajaran: ${err.message || 'Terjadi kesalahan sistem'}`,
        promotedCount: 0,
        graduatedCount: 0,
        archivedCount: 0
      };
    }
  }

  // =========================================================================
  // THEME PREFERENCE (DARK / LIGHT MODE)
  // =========================================================================
  static getTheme(): 'dark' | 'light' {
    const saved = safeStorageGet(STORAGE_KEYS.THEME);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'dark'; // Default: high contrast dark mode
  }

  static setTheme(theme: 'dark' | 'light'): void {
    safeStorageSet(STORAGE_KEYS.THEME, theme);
    this.broadcastSync('THEME_CHANGED', theme);
  }
}

