import * as XLSX from 'xlsx';
import { AttendanceRecord, PairedDailyAttendance, Student, Teacher, SchoolSchedule, AlumniStudent } from '../types';
import { AttendanceStorage } from './storage';
import { formatToDDMMYYYY, formatToIndonesianDate, formatToDayDate } from './dateUtils';

export const pairAttendanceRecords = (
  records: AttendanceRecord[], 
  filterType?: 'STUDENT' | 'TEACHER',
  customStudents?: Student[],
  customTeachers?: Teacher[]
): PairedDailyAttendance[] => {
  const map = new Map<string, PairedDailyAttendance>();

  // Fetch reference data for auto-lookup fallback if student/teacher metadata is missing in the record
  const students = customStudents || (typeof window !== 'undefined' ? AttendanceStorage.getStudents() : []);
  const teachers = customTeachers || (typeof window !== 'undefined' ? AttendanceStorage.getTeachers() : []);

  // Filter if specified
  const filtered = filterType 
    ? records.filter(r => (filterType === 'TEACHER' ? (r.userType === 'TEACHER' || !!r.teacherId) : (r.userType === 'STUDENT' || (!r.userType && !r.teacherId))))
    : records;

  // Sort chronological
  const sorted = [...filtered].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  for (const rec of sorted) {
    const isTeacher = rec.userType === 'TEACHER' || !!r_isTeacher(rec);
    const cleanUid = (rec.rfidUid || '').trim().toUpperCase();

    // Auto-Lookup / Heal missing student info
    let studentId = rec.studentId;
    let studentName = rec.studentName;
    let nis = rec.nis;
    let nisn = rec.nisn;
    let studentClass = rec.studentClass;
    let isOrphan = false;

    // Auto-Lookup / Heal missing teacher info
    let teacherId = rec.teacherId;
    let teacherName = rec.teacherName;
    let nip = rec.nip;
    let teacherPosition = rec.teacherPosition;

    if (isTeacher) {
      if (!teacherName || teacherName.trim() === '') {
        const matchedTch = teachers.find(t => t.id === rec.teacherId || (cleanUid && t.rfidUid.trim().toUpperCase() === cleanUid));
        if (matchedTch) {
          teacherId = matchedTch.id;
          teacherName = matchedTch.name;
          nip = matchedTch.nip;
          teacherPosition = matchedTch.position;
        } else {
          teacherName = rec.teacherName || (cleanUid ? `(Kartu: ${cleanUid} - Guru Tidak Ditemukan)` : '(Guru Tidak Terdaftar)');
          nip = nip || '-';
          teacherPosition = teacherPosition || '-';
          isOrphan = true;
        }
      }
    } else {
      const matchedStd = students.find(s => s.id === rec.studentId || (cleanUid && s.rfidUid.trim().toUpperCase() === cleanUid));
      if (matchedStd) {
        studentId = matchedStd.id;
        studentName = matchedStd.name;
        nis = matchedStd.nis || rec.nis;
        nisn = matchedStd.nisn;
        studentClass = matchedStd.class;
      } else if (!studentName || studentName.trim() === '') {
        studentName = rec.studentName || (cleanUid ? `(Kartu: ${cleanUid} - Siswa Belum Terdaftar)` : '(Data Siswa Kosong / Terhapus)');
        nisn = nisn || '-';
        studentClass = studentClass || 'Belum Terdaftar';
        isOrphan = true;
      }
    }

    const uniqueId = isTeacher 
      ? (teacherId || nip || teacherName || cleanUid || 'unknown_tch')
      : (studentId || nisn || studentName || cleanUid || 'unknown_std');

    const key = isTeacher 
      ? `${rec.dateFormatted}_TCH_${uniqueId}`
      : `${rec.dateFormatted}_STD_${uniqueId}`;

    if (!map.has(key)) {
      map.set(key, {
        id: `pair_${key}`,
        userType: isTeacher ? 'TEACHER' : 'STUDENT',
        dateFormatted: rec.dateFormatted,
        // Student fields
        studentId,
        studentName,
        nis: nis || '-',
        nisn: nisn || '-',
        studentClass,
        // Teacher fields
        teacherId,
        teacherName,
        nip: nip || '-',
        teacherPosition,
        // Common
        rfidUid: rec.rfidUid,
        entryTime: rec.type === 'MASUK' ? rec.timeFormatted : '-',
        entryTimestamp: rec.type === 'MASUK' ? rec.timestamp : undefined,
        entryStatus: rec.type === 'MASUK' ? rec.status : 'BELUM_HADIR',
        entryGate: rec.type === 'MASUK' ? rec.gateName : '-',
        lateMinutes: rec.type === 'MASUK' ? rec.lateMinutes : undefined,
        exitTime: rec.type === 'PULANG' ? rec.timeFormatted : 'Belum Pulang',
        exitTimestamp: rec.type === 'PULANG' ? rec.timestamp : undefined,
        exitGate: rec.type === 'PULANG' ? rec.gateName : '-',
        isEarlyCheckout: rec.isEarlyCheckout,
        earlyCheckoutReason: rec.earlyCheckoutReason,
        summaryStatus: rec.isEarlyCheckout 
          ? `Pulang Awal (${rec.earlyCheckoutReason || 'Izin'})`
          : rec.status === 'TERLAMBAT' ? 'Terlambat' : rec.status === 'TEPAT_WAKTU' ? 'Tepat Waktu' : rec.status === 'PULANG' ? 'Hadir & Pulang' : rec.status,
        notes: rec.notes || '',
        isManualOverride: rec.isManualOverride || false,
        recordIds: [rec.id],
        isOrphan
      });
    } else {
      const existing = map.get(key)!;
      if (rec.id && existing.recordIds && !existing.recordIds.includes(rec.id)) {
        existing.recordIds.push(rec.id);
      }
      if (rec.type === 'MASUK') {
        existing.entryTime = rec.timeFormatted;
        existing.entryTimestamp = rec.timestamp;
        existing.entryStatus = rec.status;
        existing.entryGate = rec.gateName;
        existing.lateMinutes = rec.lateMinutes;
        if (!existing.isEarlyCheckout) {
          if (rec.status === 'TERLAMBAT') {
            existing.summaryStatus = 'Terlambat';
          }
        }
      } else if (rec.type === 'PULANG') {
        existing.exitTime = rec.timeFormatted;
        existing.exitTimestamp = rec.timestamp;
        existing.exitGate = rec.gateName;
        if (rec.isEarlyCheckout) {
          existing.isEarlyCheckout = true;
          existing.earlyCheckoutReason = rec.earlyCheckoutReason;
          existing.summaryStatus = `Pulang Awal (${rec.earlyCheckoutReason || 'Izin'})`;
        } else {
          if (existing.entryStatus === 'TEPAT_WAKTU') {
            existing.summaryStatus = 'Tepat Waktu';
          } else if (existing.entryStatus === 'TERLAMBAT') {
            existing.summaryStatus = `Terlambat (+${existing.lateMinutes || 0}m)`;
          } else {
            existing.summaryStatus = 'Pulang';
          }
        }
      }
      if (rec.notes) {
        existing.notes = existing.notes ? `${existing.notes}; ${rec.notes}` : rec.notes;
      }
      if (rec.isManualOverride) {
        existing.isManualOverride = true;
      }
    }
  }

  return Array.from(map.values());
};

function r_isTeacher(rec: AttendanceRecord): boolean {
  return rec.userType === 'TEACHER' || Boolean(rec.teacherId) || Boolean(rec.teacherName);
}

// =========================================================================
// INTERFACES & AGGREGATION LOGIC FOR PERIOD & DAILY RECAP
// =========================================================================

export interface ExportFilterMeta {
  schoolName?: string;
  className?: string;
  periodLabel?: string;
  startDate?: string;
  endDate?: string;
  statusFilter?: string;
  gateFilter?: string;
  typeFilter?: string;
  searchTerm?: string;
  totalRecords?: number;
  onTimeCount?: number;
  lateCount?: number;
  isPeriodMode?: boolean;
  customStudents?: Student[];
  customTeachers?: Teacher[];
}

export interface TeacherPeriodSummary {
  teacherId: string;
  nip: string;
  teacherName: string;
  teacherPosition: string;
  daysPresent: number;
  daysAbsent: number;
  totalEffectiveDays: number;
  onTimeCount: number;
  lateCount: number;
  totalLateMinutes: number;
  averageEntryTime: string;
  averageExitTime: string;
  attendancePercentage: number;
  summaryStatus: string;
}

export interface StudentPeriodSummary {
  studentId: string;
  nisn: string;
  studentName: string;
  studentClass: string;
  daysPresent: number;
  daysAbsent: number;
  totalEffectiveDays: number;
  onTimeCount: number;
  lateCount: number;
  totalLateMinutes: number;
  averageEntryTime: string;
  averageExitTime: string;
  attendancePercentage: number;
  summaryStatus: string;
}

export function calculateAverageTime(times: string[]): string {
  const validSeconds = times
    .map(t => {
      if (!t || t === '-' || t.toLowerCase().includes('belum')) return null;
      const clean = t.replace(/\s*WIB/i, '').trim();
      const parts = clean.split(':').map(Number);
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
      return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    })
    .filter((s): s is number => s !== null && s > 0);

  if (validSeconds.length === 0) return '-';
  const avgSec = Math.round(validSeconds.reduce((a, b) => a + b, 0) / validSeconds.length);
  const h = Math.floor(avgSec / 3600);
  const m = Math.floor((avgSec % 3600) / 60);
  const s = avgSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} WIB`;
}

export function aggregateStudentPeriodAttendance(
  items: (PairedDailyAttendance | AttendanceRecord)[],
  customStudents?: Student[],
  targetClass: string = 'ALL'
): {
  summaries: StudentPeriodSummary[];
  totalEffectiveDays: number;
  collectiveAvgEntry: string;
  collectiveAvgExit: string;
  collectiveAvgPercentage: number;
} {
  const students = customStudents || (typeof window !== 'undefined' ? AttendanceStorage.getStudents() : []);
  
  const scopedStudents = targetClass === 'ALL' || !targetClass
    ? students
    : students.filter(s => s.class === targetClass);

  const isPaired = items.length > 0 && 'entryTime' in items[0];
  const pairedList: PairedDailyAttendance[] = isPaired 
    ? (items as PairedDailyAttendance[]) 
    : pairAttendanceRecords(items as AttendanceRecord[], 'STUDENT');

  const uniqueDates = new Set<string>();
  pairedList.forEach(p => {
    if (p.dateFormatted) uniqueDates.add(p.dateFormatted);
  });
  const totalEffectiveDays = Math.max(1, uniqueDates.size);

  const studentMap = new Map<string, PairedDailyAttendance[]>();

  pairedList.forEach(rec => {
    const key = rec.studentId || rec.nisn || rec.studentName;
    if (!studentMap.has(key)) {
      studentMap.set(key, []);
    }
    studentMap.get(key)!.push(rec);
  });

  const allEntryTimes: string[] = [];
  const allExitTimes: string[] = [];

  const summaries: StudentPeriodSummary[] = scopedStudents.map(std => {
    const records = studentMap.get(std.id) || studentMap.get(std.nisn) || studentMap.get(std.name) || [];
    
    const attendedDates = new Set<string>();
    let onTimeCount = 0;
    let lateCount = 0;
    let totalLateMinutes = 0;
    const entryTimes: string[] = [];
    const exitTimes: string[] = [];

    records.forEach(r => {
      attendedDates.add(r.dateFormatted);
      if (r.entryStatus === 'TEPAT_WAKTU') {
        onTimeCount++;
      } else if (r.entryStatus === 'TERLAMBAT') {
        lateCount++;
        totalLateMinutes += (r.lateMinutes || 0);
      }
      if (r.entryTime && r.entryTime !== '-' && !r.entryTime.toLowerCase().includes('belum')) {
        entryTimes.push(r.entryTime);
        allEntryTimes.push(r.entryTime);
      }
      if (r.exitTime && r.exitTime !== '-' && !r.exitTime.toLowerCase().includes('belum')) {
        exitTimes.push(r.exitTime);
        allExitTimes.push(r.exitTime);
      }
    });

    const daysPresent = attendedDates.size;
    const daysAbsent = Math.max(0, totalEffectiveDays - daysPresent);
    const averageEntryTime = calculateAverageTime(entryTimes);
    const averageExitTime = calculateAverageTime(exitTimes);
    const attendancePercentage = Math.min(100, Math.round((daysPresent / totalEffectiveDays) * 100));

    let summaryStatus = 'Sangat Baik';
    if (daysPresent === 0) summaryStatus = 'Belum Hadir';
    else if (attendancePercentage < 75) summaryStatus = 'Perlu Perhatian';
    else if (lateCount > 3) summaryStatus = 'Sering Terlambat';
    else if (attendancePercentage >= 90) summaryStatus = 'Disiplin Tinggi';
    else summaryStatus = 'Baik';

    return {
      studentId: std.id,
      nisn: std.nisn,
      studentName: std.name,
      studentClass: std.class,
      daysPresent,
      daysAbsent,
      totalEffectiveDays,
      onTimeCount,
      lateCount,
      totalLateMinutes,
      averageEntryTime,
      averageExitTime,
      attendancePercentage,
      summaryStatus
    };
  });

  summaries.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const collectiveAvgEntry = calculateAverageTime(allEntryTimes);
  const collectiveAvgExit = calculateAverageTime(allExitTimes);
  const collectiveAvgPercentage = summaries.length > 0 
    ? Math.round(summaries.reduce((acc, s) => acc + s.attendancePercentage, 0) / summaries.length) 
    : 0;

  return {
    summaries,
    totalEffectiveDays,
    collectiveAvgEntry,
    collectiveAvgExit,
    collectiveAvgPercentage
  };
}

export function aggregateTeacherPeriodAttendance(
  items: (PairedDailyAttendance | AttendanceRecord)[],
  customTeachers?: Teacher[]
): {
  summaries: TeacherPeriodSummary[];
  totalEffectiveDays: number;
  collectiveAvgEntry: string;
  collectiveAvgExit: string;
  collectiveAvgPercentage: number;
} {
  const teachers = customTeachers || (typeof window !== 'undefined' ? AttendanceStorage.getTeachers() : []);

  const isPaired = items.length > 0 && 'entryTime' in items[0];
  const pairedList: PairedDailyAttendance[] = isPaired 
    ? (items as PairedDailyAttendance[]) 
    : pairAttendanceRecords(items as AttendanceRecord[], 'TEACHER');

  const uniqueDates = new Set<string>();
  pairedList.forEach(p => {
    if (p.dateFormatted) uniqueDates.add(p.dateFormatted);
  });
  const totalEffectiveDays = Math.max(1, uniqueDates.size);

  const teacherMap = new Map<string, PairedDailyAttendance[]>();

  pairedList.forEach(rec => {
    const key = rec.teacherId || rec.nip || rec.teacherName;
    if (!teacherMap.has(key)) {
      teacherMap.set(key, []);
    }
    teacherMap.get(key)!.push(rec);
  });

  const allEntryTimes: string[] = [];
  const allExitTimes: string[] = [];

  const summaries: TeacherPeriodSummary[] = teachers.map(tch => {
    const records = teacherMap.get(tch.id) || teacherMap.get(tch.nip) || teacherMap.get(tch.name) || [];
    
    const attendedDates = new Set<string>();
    let onTimeCount = 0;
    let lateCount = 0;
    let totalLateMinutes = 0;
    const entryTimes: string[] = [];
    const exitTimes: string[] = [];

    records.forEach(r => {
      attendedDates.add(r.dateFormatted);
      if (r.entryStatus === 'TEPAT_WAKTU') {
        onTimeCount++;
      } else if (r.entryStatus === 'TERLAMBAT') {
        lateCount++;
        totalLateMinutes += (r.lateMinutes || 0);
      }
      if (r.entryTime && r.entryTime !== '-' && !r.entryTime.toLowerCase().includes('belum')) {
        entryTimes.push(r.entryTime);
        allEntryTimes.push(r.entryTime);
      }
      if (r.exitTime && r.exitTime !== '-' && !r.exitTime.toLowerCase().includes('belum')) {
        exitTimes.push(r.exitTime);
        allExitTimes.push(r.exitTime);
      }
    });

    const daysPresent = attendedDates.size;
    const daysAbsent = Math.max(0, totalEffectiveDays - daysPresent);
    const averageEntryTime = calculateAverageTime(entryTimes);
    const averageExitTime = calculateAverageTime(exitTimes);
    const attendancePercentage = Math.min(100, Math.round((daysPresent / totalEffectiveDays) * 100));

    let summaryStatus = 'Sangat Baik';
    if (daysPresent === 0) summaryStatus = 'Belum Hadir';
    else if (attendancePercentage < 75) summaryStatus = 'Perlu Perhatian';
    else if (lateCount > 3) summaryStatus = 'Sering Terlambat';
    else if (attendancePercentage >= 90) summaryStatus = 'Disiplin Tinggi';
    else summaryStatus = 'Baik';

    return {
      teacherId: tch.id,
      nip: tch.nip,
      teacherName: tch.name,
      teacherPosition: tch.position,
      daysPresent,
      daysAbsent,
      totalEffectiveDays,
      onTimeCount,
      lateCount,
      totalLateMinutes,
      averageEntryTime,
      averageExitTime,
      attendancePercentage,
      summaryStatus
    };
  });

  summaries.sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  const collectiveAvgEntry = calculateAverageTime(allEntryTimes);
  const collectiveAvgExit = calculateAverageTime(allExitTimes);
  const collectiveAvgPercentage = summaries.length > 0 
    ? Math.round(summaries.reduce((acc, s) => acc + s.attendancePercentage, 0) / summaries.length) 
    : 0;

  return {
    summaries,
    totalEffectiveDays,
    collectiveAvgEntry,
    collectiveAvgExit,
    collectiveAvgPercentage
  };
}

// Export Siswa to Excel (.xlsx) with exact tap times or period summary
export const exportAttendanceToExcel = (
  items: (PairedDailyAttendance | AttendanceRecord)[], 
  filenamePrefix = 'Rekap_Absensi_Siswa_RFID',
  periodLabel?: string,
  filterMeta?: ExportFilterMeta
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const classPart = filterMeta?.className && filterMeta.className !== 'ALL' 
    ? `${filterMeta.className.replace(/[^a-zA-Z0-9]/g, '_')}_` 
    : '';
  const periodPart = filterMeta?.periodLabel 
    ? `${filterMeta.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}_` 
    : '';
  const cleanPrefix = filenamePrefix.replace(/\\s+/g, '_');
  const filename = `${cleanPrefix}_${classPart}${periodPart}${dateStr}.xlsx`;

  const workbook = XLSX.utils.book_new();

  if (filterMeta?.isPeriodMode) {
    const { summaries } = aggregateStudentPeriodAttendance(
      items, 
      filterMeta.customStudents, 
      filterMeta.className
    );

    const excelData = summaries.map((s, idx) => ({
      'No': idx + 1,
      'NISN': s.nisn || '-',
      'Nama Siswa': s.studentName || '-',
      'Kelas': s.studentClass || '-',
      'Hadir (Hari)': s.daysPresent,
      'Tidak Hadir (Hari)': s.daysAbsent,
      'Total Hari Efektif': s.totalEffectiveDays,
      'Hadir Tepat Waktu': s.onTimeCount,
      'Hadir Terlambat': s.lateCount,
      'Rata-rata Jam Masuk': s.averageEntryTime,
      'Rata-rata Jam Pulang': s.averageExitTime,
      'Persentase Kehadiran': `${s.attendancePercentage}%`,
      'Status Presensi': s.summaryStatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 15 }, // NISN
      { wch: 28 }, // Nama Siswa
      { wch: 15 }, // Kelas
      { wch: 14 }, // Hadir (Hari)
      { wch: 16 }, // Tidak Hadir (Hari)
      { wch: 18 }, // Total Hari Efektif
      { wch: 16 }, // Hadir Tepat Waktu
      { wch: 16 }, // Hadir Terlambat
      { wch: 20 }, // Rata-rata Jam Masuk
      { wch: 20 }, // Rata-rata Jam Pulang
      { wch: 22 }, // Persentase Kehadiran
      { wch: 20 }  // Status Presensi
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, periodLabel ? periodLabel.slice(0, 31) : 'Rekap Periode Siswa');
  } else {
    const isPaired = items.length > 0 && 'entryTime' in items[0];
    const pairedList: PairedDailyAttendance[] = isPaired 
      ? (items as PairedDailyAttendance[]) 
      : pairAttendanceRecords(items as AttendanceRecord[], 'STUDENT');

    const excelData = pairedList.map((rec, idx) => ({
      'No': idx + 1,
      'Tanggal': formatToDDMMYYYY(rec.dateFormatted),
      'NISN': rec.nisn || '-',
      'Nama Siswa': rec.studentName || '-',
      'Kelas': rec.studentClass || '-',
      'Tap Masuk (Waktu)': rec.entryTime,
      'Status Masuk': rec.entryStatus === 'TEPAT_WAKTU' ? 'Tepat Waktu' : rec.entryStatus === 'TERLAMBAT' ? `Terlambat (+${rec.lateMinutes || 0}m)` : rec.entryStatus === 'BELUM_HADIR' ? 'Belum Masuk' : rec.entryStatus,
      'Pintu Masuk': rec.entryGate,
      'Tap Pulang (Waktu)': rec.exitTime,
      'Pintu Pulang': rec.exitGate,
      'Status Keseluruhan': rec.summaryStatus,
      'Keterangan Tambahan': rec.notes || '-',
      'RFID UID': rec.rfidUid,
      'Metode': rec.isManualOverride ? 'Manual (Guru Piket)' : 'RFID Tap Otomatis'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 15 }, // Tanggal (DD-MM-YYYY)
      { wch: 15 }, // NISN
      { wch: 28 }, // Nama Siswa
      { wch: 15 }, // Kelas
      { wch: 20 }, // Tap Masuk (Waktu)
      { wch: 18 }, // Status Masuk
      { wch: 15 }, // Pintu Masuk
      { wch: 20 }, // Tap Pulang (Waktu)
      { wch: 15 }, // Pintu Pulang
      { wch: 22 }, // Status Keseluruhan
      { wch: 25 }, // Keterangan
      { wch: 15 }, // RFID UID
      { wch: 20 }  // Metode
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, periodLabel ? periodLabel.slice(0, 31) : 'Rekap Siswa');
  }

  XLSX.writeFile(workbook, filename);
};

// Export Guru / Tenaga Pendidik to Excel with exact tap times or period summary
export const exportTeacherAttendanceToExcel = (
  items: (PairedDailyAttendance | AttendanceRecord)[], 
  filenamePrefix = 'Rekap_Absensi_Guru_RFID',
  periodLabel?: string,
  filterMeta?: ExportFilterMeta
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const cleanPrefix = filenamePrefix.replace(/\s+/g, '_');
  const periodPart = filterMeta?.periodLabel 
    ? `${filterMeta.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}_` 
    : '';
  const filename = `${cleanPrefix}_${periodPart}${dateStr}.xlsx`;

  const workbook = XLSX.utils.book_new();

  if (filterMeta?.isPeriodMode) {
    const { summaries } = aggregateTeacherPeriodAttendance(
      items, 
      filterMeta.customTeachers
    );

    const excelData = summaries.map((s, idx) => ({
      'No': idx + 1,
      'NIP / NUPTK': s.nip || '-',
      'Nama Guru / PTK': s.teacherName || '-',
      'Jabatan / Mata Pelajaran': s.teacherPosition || '-',
      'Hadir (Hari)': s.daysPresent,
      'Tidak Hadir (Hari)': s.daysAbsent,
      'Total Hari Efektif': s.totalEffectiveDays,
      'Hadir Tepat Waktu': s.onTimeCount,
      'Hadir Terlambat': s.lateCount,
      'Total Keterlambatan (Menit)': s.totalLateMinutes > 0 ? `${s.totalLateMinutes} menit` : '0',
      'Rata-rata Jam Masuk': s.averageEntryTime,
      'Rata-rata Jam Pulang': s.averageExitTime,
      'Persentase Kehadiran': `${s.attendancePercentage}%`,
      'Status Presensi': s.summaryStatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 20 }, // NIP
      { wch: 30 }, // Nama Guru
      { wch: 28 }, // Jabatan
      { wch: 14 }, // Hadir (Hari)
      { wch: 16 }, // Tidak Hadir (Hari)
      { wch: 18 }, // Total Hari Efektif
      { wch: 16 }, // Hadir Tepat Waktu
      { wch: 16 }, // Hadir Terlambat
      { wch: 24 }, // Total Keterlambatan
      { wch: 20 }, // Rata-rata Masuk
      { wch: 20 }, // Rata-rata Pulang
      { wch: 22 }, // % Kehadiran
      { wch: 20 }  // Status Presensi
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, periodLabel ? periodLabel.slice(0, 31) : 'Rekap Periode Guru');
  } else {
    const isPaired = items.length > 0 && 'entryTime' in items[0];
    const pairedList: PairedDailyAttendance[] = isPaired 
      ? (items as PairedDailyAttendance[]) 
      : pairAttendanceRecords(items as AttendanceRecord[], 'TEACHER');

    const excelData = pairedList.map((rec, idx) => ({
      'No': idx + 1,
      'Tanggal': formatToDDMMYYYY(rec.dateFormatted),
      'NIP / NUPTK': rec.nip || '-',
      'Nama Guru / PTK': rec.teacherName || '-',
      'Jabatan / Mata Pelajaran': rec.teacherPosition || '-',
      'Tap Masuk (Waktu)': rec.entryTime,
      'Status Masuk': rec.entryStatus === 'TEPAT_WAKTU' ? 'Tepat Waktu' : rec.entryStatus === 'TERLAMBAT' ? `Terlambat (+${rec.lateMinutes || 0}m)` : rec.entryStatus === 'BELUM_HADIR' ? 'Belum Masuk' : rec.entryStatus,
      'Pintu Masuk': rec.entryGate,
      'Tap Pulang (Waktu)': rec.exitTime,
      'Pintu Pulang': rec.exitGate,
      'Status Presensi': rec.summaryStatus,
      'Keterangan': rec.notes || '-',
      'RFID UID': rec.rfidUid,
      'Metode': rec.isManualOverride ? 'Manual' : 'RFID Tap Otomatis'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 15 }, // Tanggal
      { wch: 22 }, // NIP
      { wch: 30 }, // Nama Guru
      { wch: 28 }, // Jabatan
      { wch: 20 }, // Tap Masuk (Waktu)
      { wch: 18 }, // Status Masuk
      { wch: 15 }, // Pintu Masuk
      { wch: 20 }, // Tap Pulang (Waktu)
      { wch: 15 }, // Pintu Pulang
      { wch: 22 }, // Status Presensi
      { wch: 25 }, // Keterangan
      { wch: 15 }, // RFID UID
      { wch: 20 }  // Metode
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, periodLabel ? periodLabel.slice(0, 31) : 'Rekap Presensi Guru');
  }

  XLSX.writeFile(workbook, filename);
};

// Export Siswa to CSV (Semicolon Delimited with UTF-8 BOM for Native Excel Columns)
export const exportAttendanceToCSV = (
  items: (PairedDailyAttendance | AttendanceRecord)[], 
  filenamePrefix = 'Rekap_Absensi_Siswa_RFID',
  filterMeta?: ExportFilterMeta
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const cleanPrefix = filenamePrefix.replace(/\\s+/g, '_');
  const classSlug = (filterMeta?.className && filterMeta.className !== 'ALL')
    ? `${filterMeta.className.replace(/\\s+/g, '_')}_`
    : '';
  const periodSlug = filterMeta?.periodLabel
    ? `${filterMeta.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}_`
    : '';
  const filename = `Rekap_Presensi_${classSlug}${periodSlug}${cleanPrefix}_${dateStr}.csv`;

  let csvContent = '';

  if (filterMeta?.isPeriodMode) {
    // -------------------------------------------------------------
    // REKAPITULASI SISWA PER PERIODE (SEPARATE EXCEL COLUMNS)
    // -------------------------------------------------------------
    const { summaries } = aggregateStudentPeriodAttendance(
      items, 
      filterMeta.customStudents, 
      filterMeta.className
    );

    const headers = [
      'No',
      'NISN',
      'Nama Siswa',
      'Kelas',
      'Hadir (Hari)',
      'Tidak Hadir (Hari)',
      'Total Hari Efektif',
      'Hadir Tepat Waktu',
      'Hadir Terlambat',
      'Rata-rata Jam Masuk',
      'Rata-rata Jam Pulang',
      'Persentase Kehadiran',
      'Status Presensi'
    ];

    const rows = summaries.map((s, idx) => [
      idx + 1,
      `"${s.nisn || '-'}"`,
      `"${s.studentName.replace(/"/g, '""')}"`,
      `"${s.studentClass}"`,
      s.daysPresent,
      s.daysAbsent,
      s.totalEffectiveDays,
      s.onTimeCount,
      s.lateCount,
      `"${s.averageEntryTime}"`,
      `"${s.averageExitTime}"`,
      `"${s.attendancePercentage}%"`,
      `"${s.summaryStatus}"`
    ]);

    // Use semicolon delimiter (';') + UTF-8 BOM so Microsoft Excel in Indonesia opens columns natively
    csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  } else {
    // -------------------------------------------------------------
    // LOG PRESENSI HARIAN (SEPARATE EXCEL COLUMNS)
    // -------------------------------------------------------------
    const isPaired = items.length > 0 && 'entryTime' in items[0];
    const pairedList: PairedDailyAttendance[] = isPaired 
      ? (items as PairedDailyAttendance[]) 
      : pairAttendanceRecords(items as AttendanceRecord[], 'STUDENT');

    const headers = [
      'No',
      'Tanggal (DD-MM-YYYY)',
      'NISN',
      'Nama Siswa',
      'Kelas',
      'Tap Masuk',
      'Status Masuk',
      'Pintu Masuk',
      'Tap Pulang',
      'Pintu Pulang',
      'Status Presensi',
      'Keterangan',
      'RFID UID'
    ];

    const rows = pairedList.map((rec, idx) => [
      idx + 1,
      `"${formatToDDMMYYYY(rec.dateFormatted)}"`,
      `"${rec.nisn || '-'}"`,
      `"${rec.studentName || '-'}"`,
      `"${rec.studentClass || '-'}"`,
      `"${rec.entryTime}"`,
      `"${rec.entryStatus === 'TEPAT_WAKTU' ? 'Tepat Waktu' : rec.entryStatus === 'TERLAMBAT' ? `Terlambat (+${rec.lateMinutes || 0}m)` : rec.entryStatus}"`,
      `"${rec.entryGate}"`,
      `"${rec.exitTime}"`,
      `"${rec.exitGate}"`,
      `"${rec.summaryStatus}"`,
      `"${rec.notes || '-'}"`,
      `"${rec.rfidUid}"`
    ]);

    // Use semicolon delimiter (';') + UTF-8 BOM so Microsoft Excel in Indonesia opens columns natively
    csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export Guru to CSV (Semicolon Delimited with UTF-8 BOM for Native Excel Columns)
export const exportTeacherAttendanceToCSV = (
  items: (PairedDailyAttendance | AttendanceRecord)[], 
  filenamePrefix = 'Rekap_Absensi_Guru_RFID',
  filterMeta?: ExportFilterMeta
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const cleanPrefix = filenamePrefix.replace(/\s+/g, '_');
  const periodSlug = filterMeta?.periodLabel
    ? `${filterMeta.periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}_`
    : '';
  const filename = `${cleanPrefix}_${periodSlug}${dateStr}.csv`;

  let csvContent = '\uFEFF';

  if (filterMeta?.isPeriodMode) {
    const { summaries } = aggregateTeacherPeriodAttendance(items, filterMeta.customTeachers);
    const headers = [
      'No',
      'NIP / NUPTK',
      'Nama Guru / PTK',
      'Jabatan / Mata Pelajaran',
      'Hadir (Hari)',
      'Tidak Hadir (Hari)',
      'Total Hari Efektif',
      'Hadir Tepat Waktu',
      'Hadir Terlambat',
      'Total Keterlambatan (Menit)',
      'Rata-rata Jam Masuk',
      'Rata-rata Jam Pulang',
      'Persentase Kehadiran (%)',
      'Status Presensi'
    ];

    const rows = summaries.map((s, idx) => [
      idx + 1,
      `"${s.nip || '-'}"`,
      `"${s.teacherName || '-'}"`,
      `"${s.teacherPosition || '-'}"`,
      s.daysPresent,
      s.daysAbsent,
      s.totalEffectiveDays,
      s.onTimeCount,
      s.lateCount,
      s.totalLateMinutes,
      `"${s.averageEntryTime}"`,
      `"${s.averageExitTime}"`,
      `"${s.attendancePercentage}%"`,
      `"${s.summaryStatus}"`
    ]);

    csvContent += [headers.map(h => `"${h}"`).join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  } else {
    const isPaired = items.length > 0 && 'entryTime' in items[0];
    const pairedList: PairedDailyAttendance[] = isPaired 
      ? (items as PairedDailyAttendance[]) 
      : pairAttendanceRecords(items as AttendanceRecord[], 'TEACHER');

    const headers = [
      'No',
      'Tanggal (DD-MM-YYYY)',
      'NIP',
      'Nama Guru',
      'Jabatan',
      'Tap Masuk',
      'Status Masuk',
      'Pintu Masuk',
      'Tap Pulang',
      'Pintu Pulang',
      'Status Presensi',
      'Keterangan',
      'RFID UID'
    ];

    const rows = pairedList.map((rec, idx) => [
      idx + 1,
      `"${formatToDDMMYYYY(rec.dateFormatted)}"`,
      `"${rec.nip || '-'}"`,
      `"${rec.teacherName || '-'}"`,
      `"${rec.teacherPosition || '-'}"`,
      `"${rec.entryTime}"`,
      `"${rec.entryStatus === 'TEPAT_WAKTU' ? 'Tepat Waktu' : rec.entryStatus === 'TERLAMBAT' ? `Terlambat (+${rec.lateMinutes || 0}m)` : rec.entryStatus}"`,
      `"${rec.entryGate}"`,
      `"${rec.exitTime}"`,
      `"${rec.exitGate}"`,
      `"${rec.summaryStatus}"`,
      `"${rec.notes || '-'}"`,
      `"${rec.rfidUid}"`
    ]);

    csvContent += [headers.map(h => `"${h}"`).join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Hidden iframe printer: 100% immune to sandboxed iframe popup blockers
export const executePrintHtml = (htmlContent: string, title = 'Cetak Dokumen') => {
  if (typeof window === 'undefined') return;

  try {
    const existingIframe = document.getElementById('print-report-iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'print-report-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '300px';
    iframe.style.height = '300px';
    iframe.style.border = 'none';
    iframe.style.opacity = '0.01';
    iframe.style.zIndex = '-9999';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print error', e);
        }
      }, 350);
      return;
    }
  } catch (err) {
    console.warn('Iframe print execution fallback to popup', err);
  }

  // Fallback for standalone window
  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  } catch (e) {
    console.error('Print popup blocked', e);
  }
};

// Dynamic filter badges helper to reflect exact active user filters on report kop
const buildFilterBadgesHtml = (filterMeta?: ExportFilterMeta, fallbackPeriodSubtitle?: string): string => {
  const badges: string[] = [];

  const classLabel = (filterMeta?.className && filterMeta.className !== 'ALL') ? filterMeta.className : 'Semua Kelas';
  badges.push(`KELAS: <strong>${classLabel}</strong>`);

  const period = fallbackPeriodSubtitle || filterMeta?.periodLabel;
  if (period) {
    badges.push(`PERIODE: <strong>${period}</strong>`);
  }

  if (filterMeta?.statusFilter && filterMeta.statusFilter !== 'ALL') {
    const statusLabel = filterMeta.statusFilter === 'TEPAT_WAKTU' ? 'Tepat Waktu' :
                        filterMeta.statusFilter === 'TERLAMBAT' ? 'Terlambat' :
                        filterMeta.statusFilter === 'PULANG' ? 'Sudah Pulang' :
                        filterMeta.statusFilter;
    badges.push(`STATUS: <strong>${statusLabel}</strong>`);
  }

  if (filterMeta?.gateFilter && filterMeta.gateFilter !== 'ALL') {
    badges.push(`GERBANG: <strong>${filterMeta.gateFilter}</strong>`);
  }

  if (filterMeta?.typeFilter && filterMeta.typeFilter !== 'ALL') {
    badges.push(`TIPE: <strong>${filterMeta.typeFilter === 'MASUK' ? 'Absen Masuk' : 'Absen Pulang'}</strong>`);
  }

  if (filterMeta?.searchTerm && filterMeta.searchTerm.trim() !== '') {
    badges.push(`PENCARIAN: <strong>&ldquo;${filterMeta.searchTerm.trim()}&rdquo;</strong>`);
  }

  return badges.join(' &nbsp;&bull;&nbsp; ');
};

// Print PDF: Period Summary (with average times) or Daily Log
export const printAttendanceReport = (
  items: (PairedDailyAttendance | AttendanceRecord)[], 
  schoolName: string, 
  title = 'Laporan Rekap Absensi Siswa',
  periodSubtitle?: string,
  filterMeta?: ExportFilterMeta
) => {
  const targetClassLabel = filterMeta?.className === 'ALL' || !filterMeta?.className ? 'Semua Kelas' : filterMeta.className;
  const printDateStr = formatToDayDate(new Date());

  let reportHtml = '';

  if (filterMeta?.isPeriodMode) {
    // -------------------------------------------------------------
    // CETAK REKAPITULASI PERIODE SISWA (JUMLAH HADIR & RATA-RATA JAM)
    // -------------------------------------------------------------
    const { 
      summaries, 
      totalEffectiveDays, 
      collectiveAvgEntry, 
      collectiveAvgExit, 
      collectiveAvgPercentage 
    } = aggregateStudentPeriodAttendance(items, filterMeta.customStudents, filterMeta.className);

    const periodRows = summaries.map((s, idx) => `
      <tr style="font-size: 11px;">
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${s.nisn || '-'}</td>
        <td style="padding: 5px 6px; font-weight: 600; border: 1px solid #cbd5e1;">${s.studentName}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${s.studentClass}</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: bold; color: #15803d; border: 1px solid #cbd5e1;">${s.daysPresent} Hari</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: bold; ${s.daysAbsent > 0 ? 'color: #dc2626; background-color: #fef2f2;' : 'color: #64748b;'} border: 1px solid #cbd5e1;">${s.daysAbsent} Hari</td>
        <td style="padding: 5px 6px; text-align: center; color: #475569; border: 1px solid #cbd5e1;">${s.totalEffectiveDays} Hari</td>
        <td style="padding: 5px 6px; text-align: center; color: #15803d; font-weight: bold; border: 1px solid #cbd5e1;">${s.onTimeCount}</td>
        <td style="padding: 5px 6px; text-align: center; color: #b45309; font-weight: bold; border: 1px solid #cbd5e1;">${s.lateCount}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; text-align: center; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1;">${s.averageEntryTime}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; text-align: center; color: #475569; border: 1px solid #cbd5e1;">${s.averageExitTime}</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: bold; color: #1d4ed8; border: 1px solid #cbd5e1;">${s.attendancePercentage}%</td>
        <td style="padding: 5px 6px; font-size: 11px; font-weight: 600; border: 1px solid #cbd5e1;">${s.summaryStatus}</td>
      </tr>
    `).join('');

    reportHtml = `
      <div class="school-kop">
        <div class="yayasan">YAYASAN PENDIDIKAN EKONOMIKA DEPOK</div>
        <div class="school-name">${schoolName || 'SMK EKONOMIKA KOTA DEPOK'}</div>
        <div class="school-sub">TERAKREDITASI &ldquo;A&rdquo; (UNGGUL) &middot; NPSN: 20268492 &middot; KODE SEKOLAH: 4321</div>
        <div class="school-addr">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat 16436 &middot; Telp: (021) 7720-1122 &middot; Email: info@smkekonomika.sch.id</div>
      </div>
      <div class="kop-divider"></div>

      <div class="doc-title-container">
        <h2 class="doc-title">REKAPITULASI PRESENSI SISWA PERIODE</h2>
        <div class="filter-badges">
          ${buildFilterBadgesHtml(filterMeta, periodSubtitle)}
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-box">
          <div class="val">${totalEffectiveDays} Hari</div>
          <div class="lbl">Hari Efektif Periode</div>
        </div>
        <div class="summary-box">
          <div class="val">${summaries.length}</div>
          <div class="lbl">Total Siswa Terdata</div>
        </div>
        <div class="summary-box">
          <div class="val" style="color: #15803d;">${collectiveAvgEntry}</div>
          <div class="lbl">Rata-rata Masuk Sekolah</div>
        </div>
        <div class="summary-box">
          <div class="val" style="color: #1d4ed8;">${collectiveAvgPercentage}%</div>
          <div class="lbl">Persentase Kehadiran</div>
        </div>
      </div>

      <div class="meta">
        <span><strong>Tanggal Cetak:</strong> ${printDateStr}</span>
        <span><strong>Total Siswa:</strong> ${summaries.length} orang</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 30px;">No</th>
            <th>NISN</th>
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th style="text-align: center;">Hadir</th>
            <th style="text-align: center;">Tidak Hadir</th>
            <th style="text-align: center;">Total Hari</th>
            <th style="text-align: center;">Tepat</th>
            <th style="text-align: center;">Terlambat</th>
            <th style="text-align: center;">Rata-rata Masuk</th>
            <th style="text-align: center;">Rata-rata Pulang</th>
            <th style="text-align: center;">% Hadir</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${periodRows.length > 0 ? periodRows : '<tr><td colspan="13" style="text-align:center; padding: 20px;">Tidak ada data rekap presensi untuk periode ini.</td></tr>'}
        </tbody>
      </table>
    `;
  } else {
    // -------------------------------------------------------------
    // CETAK LOG PRESENSI HARIAN
    // -------------------------------------------------------------
    const isPaired = items.length > 0 && 'entryTime' in items[0];
    const pairedList: PairedDailyAttendance[] = isPaired 
      ? (items as PairedDailyAttendance[]) 
      : pairAttendanceRecords(items as AttendanceRecord[], 'STUDENT');

    const onTimeCount = filterMeta?.onTimeCount ?? pairedList.filter(r => r.entryStatus === 'TEPAT_WAKTU').length;
    const lateCount = filterMeta?.lateCount ?? pairedList.filter(r => r.entryStatus === 'TERLAMBAT').length;

    const tableRows = pairedList.map((rec, idx) => `
      <tr style="font-size: 11px;">
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${formatToDDMMYYYY(rec.dateFormatted)}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${rec.nisn || '-'}</td>
        <td style="padding: 5px 6px; font-weight: 600; border: 1px solid #cbd5e1;">${rec.studentName || '-'}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${rec.studentClass || '-'}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-weight: bold; color: #15803d; border: 1px solid #cbd5e1;">
          ${rec.entryTime}
          ${rec.entryStatus === 'TERLAMBAT' ? `<span style="color: #b45309; font-size: 9.5px; display: block;">(+${rec.lateMinutes || 0}m)</span>` : ''}
        </td>
        <td style="padding: 5px 6px; font-size: 10.5px; color: #475569; border: 1px solid #cbd5e1;">${rec.entryGate}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-weight: bold; color: ${rec.exitTime === 'Belum Pulang' ? '#94a3b8' : '#1d4ed8'}; border: 1px solid #cbd5e1;">
          ${rec.exitTime}
        </td>
        <td style="padding: 5px 6px; font-size: 10.5px; color: #475569; border: 1px solid #cbd5e1;">${rec.exitGate}</td>
        <td style="padding: 5px 6px; font-weight: 600; font-size: 11px; color: ${rec.entryStatus === 'TEPAT_WAKTU' ? '#15803d' : rec.entryStatus === 'TERLAMBAT' ? '#b45309' : '#1e293b'}; border: 1px solid #cbd5e1;">
          ${rec.summaryStatus}
        </td>
      </tr>
    `).join('');

    reportHtml = `
      <div class="school-kop">
        <div class="yayasan">YAYASAN PENDIDIKAN EKONOMIKA DEPOK</div>
        <div class="school-name">${schoolName || 'SMK EKONOMIKA KOTA DEPOK'}</div>
        <div class="school-sub">TERAKREDITASI &ldquo;A&rdquo; (UNGGUL) &middot; NPSN: 20268492 &middot; KODE SEKOLAH: 4321</div>
        <div class="school-addr">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat 16436 &middot; Telp: (021) 7720-1122 &middot; Email: info@smkekonomika.sch.id</div>
      </div>
      <div class="kop-divider"></div>

      <div class="doc-title-container">
        <h2 class="doc-title">${title}</h2>
        <div class="filter-badges">
          ${buildFilterBadgesHtml(filterMeta, periodSubtitle)}
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-box">
          <div class="val">${pairedList.length}</div>
          <div class="lbl">Total Kehadiran Siswa</div>
        </div>
        <div class="summary-box">
          <div class="val" style="color: #15803d;">${onTimeCount}</div>
          <div class="lbl">Hadir Tepat Waktu</div>
        </div>
        <div class="summary-box">
          <div class="val" style="color: #b45309;">${lateCount}</div>
          <div class="lbl">Hadir Terlambat</div>
        </div>
        <div class="summary-box">
          <div class="val">${pairedList.length > 0 ? Math.round((onTimeCount / pairedList.length) * 100) : 0}%</div>
          <div class="lbl">Persentase Ketepatan</div>
        </div>
      </div>

      <div class="meta">
        <span><strong>Tanggal Cetak:</strong> ${printDateStr}</span>
        <span><strong>Total Baris:</strong> ${pairedList.length} data</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 30px;">No</th>
            <th>Tanggal</th>
            <th>NISN</th>
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th>Tap Masuk</th>
            <th>Pintu</th>
            <th>Tap Pulang</th>
            <th>Pintu</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.length > 0 ? tableRows : '<tr><td colspan="10" style="text-align:center; padding: 20px;">Tidak ada data absensi untuk kelas / periode ini.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  const completeHtml = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${title} - ${targetClassLabel}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm 12mm 12mm 12mm; }
          * { box-sizing: border-box; }
          body { font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; padding: 16px; color: #0f172a; background: #fff; margin: 0; }
          
          .school-kop { text-align: center; margin-bottom: 4px; }
          .yayasan { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #475569; text-transform: uppercase; }
          .school-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; margin: 2px 0; }
          .school-sub { font-size: 10px; font-weight: 700; color: #334155; }
          .school-addr { font-size: 9.5px; color: #64748b; margin-top: 2px; }
          .kop-divider { border-top: 2.5px solid #0f172a; border-bottom: 1px solid #0f172a; height: 3px; margin: 6px 0 12px 0; }
          
          .doc-title-container { text-align: center; margin-bottom: 12px; }
          .doc-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: #1e293b; }
          .filter-badges { margin-top: 4px; font-size: 11px; font-weight: 600; color: #475569; }

          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .summary-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; text-align: center; }
          .summary-box .val { font-size: 15px; font-weight: 800; font-family: monospace; color: #0f172a; }
          .summary-box .lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-top: 1px; }

          .meta { margin-bottom: 8px; font-size: 10.5px; display: flex; justify-content: space-between; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          th { background: #f1f5f9; padding: 6px 7px; text-align: left; font-weight: 700; border: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; }
          tbody tr:nth-child(even) { background-color: #fbfcfd; }
          
          .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; break-inside: avoid; page-break-inside: avoid; }
          .sign-box { text-align: center; width: 220px; }
          .sign-line { margin-top: 50px; border-top: 1px solid #0f172a; }
          .sign-name { font-weight: 700; margin-top: 4px; }
          .sign-nip { font-size: 10px; color: #475569; }

          @media print {
            body { padding: 0; }
            .footer { break-inside: avoid; page-break-inside: avoid; }
            table { break-inside: auto; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        ${reportHtml}

        <div class="footer">
          <div class="sign-box">
            <p style="margin: 0;">Mengetahui,</p>
            <p style="margin: 2px 0 0 0;"><strong>Wali Kelas / Guru Piket</strong></p>
            <div class="sign-line"></div>
            <div class="sign-name">( ............................................ )</div>
            <div class="sign-nip">NIP. ........................................</div>
          </div>

          <div class="sign-box">
            <p style="margin: 0;">Kota Depok, ${printDateStr}</p>
            <p style="margin: 2px 0 0 0;"><strong>Kepala Sekolah SMK Ekonomika</strong></p>
            <div class="sign-line"></div>
            <div class="sign-name">Drs. H. Bambang Sujarwo, M.Pd.</div>
            <div class="sign-nip">NIP. 196805121994031005</div>
          </div>
        </div>
      </body>
    </html>
  `;

  executePrintHtml(completeHtml, title);
};

export const printTeacherAttendanceReport = (
  items: (PairedDailyAttendance | AttendanceRecord)[], 
  schoolName: string, 
  title = 'Laporan Rekap Presensi Guru & Tenaga Kependidikan',
  periodSubtitle?: string,
  filterMeta?: ExportFilterMeta
) => {
  const printDateStr = formatToDayDate(new Date());

  let reportHtml = '';

  if (filterMeta?.isPeriodMode) {
    const { 
      summaries, 
      totalEffectiveDays, 
      collectiveAvgEntry, 
      collectiveAvgExit, 
      collectiveAvgPercentage 
    } = aggregateTeacherPeriodAttendance(items, filterMeta.customTeachers);

    const periodRows = summaries.map((s, idx) => `
      <tr style="font-size: 11px;">
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${s.nip || '-'}</td>
        <td style="padding: 5px 6px; font-weight: 600; border: 1px solid #cbd5e1;">${s.teacherName}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${s.teacherPosition || '-'}</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: bold; color: #15803d; border: 1px solid #cbd5e1;">${s.daysPresent} Hari</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: bold; ${s.daysAbsent > 0 ? 'color: #dc2626; background-color: #fef2f2;' : 'color: #64748b;'} border: 1px solid #cbd5e1;">${s.daysAbsent} Hari</td>
        <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: bold; color: #15803d; border: 1px solid #cbd5e1;">${s.onTimeCount}</td>
        <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: bold; ${s.lateCount > 0 ? 'color: #b45309; background-color: #fffbeb;' : 'color: #64748b;'} border: 1px solid #cbd5e1;">${s.lateCount}</td>
        <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: bold; color: #15803d; border: 1px solid #cbd5e1;">${s.averageEntryTime}</td>
        <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: bold; color: #1d4ed8; border: 1px solid #cbd5e1;">${s.averageExitTime}</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: bold; font-family: monospace; ${s.attendancePercentage < 75 ? 'color: #dc2626;' : 'color: #15803d;'} border: 1px solid #cbd5e1;">${s.attendancePercentage}%</td>
        <td style="padding: 5px 6px; text-align: center; font-weight: 600; border: 1px solid #cbd5e1;">${s.summaryStatus}</td>
      </tr>
    `).join('');

    reportHtml = `
      <div class="school-kop">
        <div class="yayasan">YAYASAN PENDIDIKAN EKONOMIKA DEPOK</div>
        <div class="school-name">${schoolName || 'SMK EKONOMIKA KOTA DEPOK'}</div>
        <div class="school-sub">TERAKREDITASI &ldquo;A&rdquo; (UNGGUL) &middot; NPSN: 20268492 &middot; KODE SEKOLAH: 4321</div>
        <div class="school-addr">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat 16436 &middot; Telp: (021) 7720-1122 &middot; Email: info@smkekonomika.sch.id</div>
      </div>
      <div class="kop-divider"></div>

      <div class="doc-title-container">
        <h2 class="doc-title">${title}</h2>
        ${periodSubtitle ? `<div class="filter-badges">${periodSubtitle}</div>` : ''}
      </div>

      <div class="summary-grid">
        <div class="summary-box">
          <div class="val">${summaries.length}</div>
          <div class="lbl">Total Guru & PTK</div>
        </div>
        <div class="summary-box">
          <div class="val">${totalEffectiveDays} Hari</div>
          <div class="lbl">Hari Kerja Efektif</div>
        </div>
        <div class="summary-box">
          <div class="val" style="color: #15803d;">${collectiveAvgPercentage}%</div>
          <div class="lbl">Rata-rata Kehadiran</div>
        </div>
        <div class="summary-box">
          <div class="val" style="color: #1d4ed8;">${collectiveAvgEntry}</div>
          <div class="lbl">Rerata Masuk Pagi</div>
        </div>
      </div>

      <div class="meta">
        <span><strong>Tanggal Cetak:</strong> ${printDateStr}</span>
        <span><strong>Target:</strong> Seluruh Guru & PTK Terdaftar</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 30px;">No</th>
            <th>NIP / NUPTK</th>
            <th>Nama Guru / PTK</th>
            <th>Jabatan / Mapel</th>
            <th style="text-align: center;">Hadir</th>
            <th style="text-align: center;">Tidak Hadir</th>
            <th style="text-align: center;">Tepat</th>
            <th style="text-align: center;">Terlambat</th>
            <th style="text-align: center;">Rerata Masuk</th>
            <th style="text-align: center;">Rerata Pulang</th>
            <th style="text-align: center;">% Hadir</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${periodRows.length > 0 ? periodRows : '<tr><td colspan="12" style="text-align:center; padding: 24px;">Tidak ada data periode guru.</td></tr>'}
        </tbody>
      </table>
    `;
  } else {
    const isPaired = items.length > 0 && 'entryTime' in items[0];
    const pairedList: PairedDailyAttendance[] = isPaired 
      ? (items as PairedDailyAttendance[]) 
      : pairAttendanceRecords(items as AttendanceRecord[], 'TEACHER');

    const tableRows = pairedList.map((rec, idx) => `
      <tr style="font-size: 11px;">
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${formatToDDMMYYYY(rec.dateFormatted)}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${rec.nip || '-'}</td>
        <td style="padding: 5px 6px; font-weight: 600; border: 1px solid #cbd5e1;">${rec.teacherName || '-'}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1;">${rec.teacherPosition || '-'}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-weight: bold; color: #15803d; border: 1px solid #cbd5e1;">
          ${rec.entryTime}
          ${rec.entryStatus === 'TERLAMBAT' ? `<span style="color: #b45309; font-size: 9.5px; display: block;">(+${rec.lateMinutes || 0}m)</span>` : ''}
        </td>
        <td style="padding: 5px 6px; font-size: 10.5px; color: #475569; border: 1px solid #cbd5e1;">${rec.entryGate}</td>
        <td style="padding: 5px 6px; font-family: monospace; font-weight: bold; color: ${rec.exitTime === 'Belum Pulang' ? '#94a3b8' : '#1d4ed8'}; border: 1px solid #cbd5e1;">
          ${rec.exitTime}
        </td>
        <td style="padding: 5px 6px; font-size: 10.5px; color: #475569; border: 1px solid #cbd5e1;">${rec.exitGate}</td>
        <td style="padding: 5px 6px; font-weight: 600; font-size: 11px; color: ${rec.entryStatus === 'TEPAT_WAKTU' ? '#15803d' : rec.entryStatus === 'TERLAMBAT' ? '#b45309' : '#1e293b'}; border: 1px solid #cbd5e1;">
          ${rec.summaryStatus}
        </td>
      </tr>
    `).join('');

    reportHtml = `
      <div class="school-kop">
        <div class="yayasan">YAYASAN PENDIDIKAN EKONOMIKA DEPOK</div>
        <div class="school-name">${schoolName || 'SMK EKONOMIKA KOTA DEPOK'}</div>
        <div class="school-sub">TERAKREDITASI &ldquo;A&rdquo; (UNGGUL) &middot; NPSN: 20268492 &middot; KODE SEKOLAH: 4321</div>
        <div class="school-addr">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat 16436 &middot; Telp: (021) 7720-1122 &middot; Email: info@smkekonomika.sch.id</div>
      </div>
      <div class="kop-divider"></div>

      <div class="doc-title-container">
        <h2 class="doc-title">${title}</h2>
        ${periodSubtitle ? `<div class="filter-badges">${periodSubtitle}</div>` : ''}
      </div>

      <div class="meta">
        <span><strong>Dicetak pada:</strong> ${printDateStr}</span>
        <span><strong>Total Rekap Guru:</strong> ${pairedList.length} data</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 30px;">No</th>
            <th>Tanggal</th>
            <th>NIP / NUPTK</th>
            <th>Nama Guru / PTK</th>
            <th>Jabatan / Mapel</th>
            <th>Tap Masuk</th>
            <th>Pintu Masuk</th>
            <th>Tap Pulang</th>
            <th>Pintu Pulang</th>
            <th>Status Presensi</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.length > 0 ? tableRows : '<tr><td colspan="10" style="text-align:center; padding: 20px;">Tidak ada data presensi guru untuk kriteria / periode ini.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  const completeHtml = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm 12mm 12mm 12mm; }
          * { box-sizing: border-box; }
          body { font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; padding: 16px; color: #0f172a; background: #fff; margin: 0; }
          
          .school-kop { text-align: center; margin-bottom: 4px; }
          .yayasan { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #475569; text-transform: uppercase; }
          .school-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; margin: 2px 0; }
          .school-sub { font-size: 10px; font-weight: 700; color: #334155; }
          .school-addr { font-size: 9.5px; color: #64748b; margin-top: 2px; }
          .kop-divider { border-top: 2.5px solid #0f172a; border-bottom: 1px solid #0f172a; height: 3px; margin: 6px 0 12px 0; }

          .doc-title-container { text-align: center; margin-bottom: 12px; }
          .doc-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: #1e293b; }
          .filter-badges { margin-top: 4px; font-size: 11px; font-weight: 600; color: #475569; }

          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .summary-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; text-align: center; }
          .summary-box .val { font-size: 15px; font-weight: 800; font-family: monospace; color: #0f172a; }
          .summary-box .lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-top: 1px; }

          .meta { margin-bottom: 8px; font-size: 10.5px; display: flex; justify-content: space-between; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          th { background: #f1f5f9; padding: 6px 7px; text-align: left; font-weight: 700; border: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; }
          tbody tr:nth-child(even) { background-color: #fbfcfd; }

          .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; break-inside: avoid; page-break-inside: avoid; }
          .sign-box { text-align: center; width: 220px; }
          .sign-line { margin-top: 50px; border-top: 1px solid #0f172a; }
          .sign-name { font-weight: 700; margin-top: 4px; }
          .sign-nip { font-size: 10px; color: #475569; }

          @media print {
            body { padding: 0; }
            .footer { break-inside: avoid; page-break-inside: avoid; }
            table { break-inside: auto; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        ${reportHtml}

        <div class="footer">
          <div class="sign-box">
            <p style="margin: 0;">Mengetahui,</p>
            <p style="margin: 2px 0 0 0;"><strong>Admin Presensi / TU</strong></p>
            <div class="sign-line"></div>
            <div class="sign-name">( ............................................ )</div>
            <div class="sign-nip">NIP. ........................................</div>
          </div>
          <div class="sign-box">
            <p style="margin: 0;">Kota Depok, ${printDateStr}</p>
            <p style="margin: 2px 0 0 0;"><strong>Kepala Sekolah SMK Ekonomika</strong></p>
            <div class="sign-line"></div>
            <div class="sign-name">Drs. H. Bambang Sujarwo, M.Pd.</div>
            <div class="sign-nip">NIP. 196805121994031005</div>
          </div>
        </div>
      </body>
    </html>
  `;

  executePrintHtml(completeHtml, title);
};

// =========================================================================
// EKSPOR DATA MASTER SISWA KE EXCEL & CSV (KOLOM TERPISAH RAPIH)
// =========================================================================

export const exportStudentsToExcel = (
  students: Student[], 
  schoolName = 'SMK EKONOMIKA DEPOK',
  filenamePrefix = 'Data_Master_Siswa_SMK_Ekonomika'
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const filename = `${filenamePrefix.replace(/\s+/g, '_')}_${dateStr}.xlsx`;

  const rows = students.map((s, idx) => ({
    'No': idx + 1,
    'NIS': s.nis || '-',
    'Nama Lengkap Siswa': s.name,
    'NISN': s.nisn || '-',
    'Kelas': s.class || '-',
    'RFID UID MIFARE': s.rfidUid || '-',
    'Jenis Kelamin': s.gender === 'P' ? 'Perempuan' : 'Laki-laki',
    'No WhatsApp Ortu': s.phone || '-',
    'Status Kartu': s.rfidUid ? 'Terdaftar (Aktif)' : 'Belum Ada Kartu'
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set explicit column widths
  worksheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 14 }, // NIS
    { wch: 32 }, // Nama
    { wch: 16 }, // NISN
    { wch: 18 }, // Kelas
    { wch: 22 }, // RFID UID
    { wch: 16 }, // Jenis Kelamin
    { wch: 20 }, // WhatsApp Ortu
    { wch: 20 }  // Status Kartu
  ];

  // Set string cell type to preserve leading zeros in NIS, NISN, RFID, Phone
  rows.forEach((_, idx) => {
    const rowNum = idx + 2; // header is row 1
    const nisCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 1 });
    if (worksheet[nisCell]) worksheet[nisCell].t = 's';
    const nisnCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 3 });
    if (worksheet[nisnCell]) worksheet[nisnCell].t = 's';
    const rfidCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 5 });
    if (worksheet[rfidCell]) worksheet[rfidCell].t = 's';
    const phoneCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 7 });
    if (worksheet[phoneCell]) worksheet[phoneCell].t = 's';
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Siswa');
  XLSX.writeFile(workbook, filename);
};

export const exportStudentsToCSV = (
  students: Student[], 
  filenamePrefix = 'Data_Master_Siswa_SMK_Ekonomika'
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const filename = `${filenamePrefix.replace(/\s+/g, '_')}_${dateStr}.csv`;

  const headers = [
    'No',
    'NIS',
    'Nama Lengkap Siswa',
    'NISN',
    'Kelas',
    'RFID UID MIFARE',
    'Jenis Kelamin',
    'No WhatsApp Ortu'
  ];

  const rows = students.map((s, idx) => [
    idx + 1,
    `"${s.nis || '-'}"`,
    `"${(s.name || '').replace(/"/g, '""')}"`,
    `"${s.nisn || '-'}"`,
    `"${s.class || '-'}"`,
    `"${s.rfidUid || '-'}"`,
    `"${s.gender || 'L'}"`,
    `"${s.phone || '-'}"`
  ]);

  // Prepend UTF-8 BOM (\uFEFF) and use semicolon delimiter for perfect Excel multi-column opening
  const csvContent = '\uFEFF' + [
    headers.map(h => `"${h}"`).join(';'),
    ...rows.map(r => r.join(';'))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// =========================================================================
// EKSPOR DATA MASTER GURU KE EXCEL & CSV (KOLOM TERPISAH RAPIH)
// =========================================================================

export const exportTeachersToExcel = (
  teachers: Teacher[], 
  schoolName = 'SMK EKONOMIKA DEPOK',
  filenamePrefix = 'Data_Master_Guru_SMK_Ekonomika'
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const filename = `${filenamePrefix.replace(/\s+/g, '_')}_${dateStr}.xlsx`;

  const rows = teachers.map((t, idx) => ({
    'No': idx + 1,
    'Nama Lengkap Guru / PTK': t.name,
    'NIP / NUPTK / NIK': t.nip || '-',
    'Jabatan / Mata Pelajaran': t.position || '-',
    'Nomor Kartu RFID MIFARE': t.rfidUid || '-',
    'Jenis Kelamin': t.gender === 'P' ? 'Perempuan' : 'Laki-laki',
    'No. WhatsApp / HP': t.phone || '-',
    'Status Kartu': t.rfidUid ? 'Terdaftar (Aktif)' : 'Belum Ada Kartu'
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 34 }, // Nama
    { wch: 22 }, // NIP
    { wch: 30 }, // Jabatan
    { wch: 22 }, // RFID UID
    { wch: 16 }, // Jenis Kelamin
    { wch: 20 }, // WhatsApp
    { wch: 20 }  // Status Kartu
  ];

  rows.forEach((_, idx) => {
    const rowNum = idx + 2;
    const nipCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 2 });
    if (worksheet[nipCell]) worksheet[nipCell].t = 's';
    const rfidCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 4 });
    if (worksheet[rfidCell]) worksheet[rfidCell].t = 's';
    const phoneCell = XLSX.utils.encode_cell({ r: rowNum - 1, c: 6 });
    if (worksheet[phoneCell]) worksheet[phoneCell].t = 's';
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Guru');
  XLSX.writeFile(workbook, filename);
};

export const exportTeachersToCSV = (
  teachers: Teacher[], 
  filenamePrefix = 'Data_Master_Guru_SMK_Ekonomika'
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const filename = `${filenamePrefix.replace(/\s+/g, '_')}_${dateStr}.csv`;

  const headers = [
    'No',
    'Nama Lengkap Guru / PTK',
    'NIP / NUPTK',
    'Jabatan / Mata Pelajaran',
    'Nomor Kartu RFID MIFARE',
    'Jenis Kelamin',
    'No WhatsApp / HP'
  ];

  const rows = teachers.map((t, idx) => [
    idx + 1,
    `"${(t.name || '').replace(/"/g, '""')}"`,
    `"${t.nip || '-'}"`,
    `"${(t.position || '-').replace(/"/g, '""')}"`,
    `"${t.rfidUid || '-'}"`,
    `"${t.gender || 'L'}"`,
    `"${t.phone || '-'}"`
  ]);

  const csvContent = '\uFEFF' + [
    headers.map(h => `"${h}"`).join(';'),
    ...rows.map(r => r.join(';'))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export Alumni to Excel
export const exportAlumniToExcel = (
  alumni: AlumniStudent[],
  filenamePrefix = 'Data_Alumni_SMK_Ekonomika'
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const cleanPrefix = filenamePrefix.replace(/\s+/g, '_');
  const filename = `${cleanPrefix}_${dateStr}.xlsx`;

  const excelData = alumni.map((alm, idx) => ({
    'No': idx + 1,
    'Tahun Kelulusan': alm.graduationYear || '-',
    'NISN': alm.nisn || '-',
    'Nama Lengkap Siswa': alm.name,
    'Kelas Terakhir': alm.lastClass || '-',
    'Jenis Kelamin': alm.gender === 'L' ? 'Laki-laki' : alm.gender === 'P' ? 'Perempuan' : '-',
    'Nomor Telepon / WA': alm.phone || '-',
    'RFID UID Terakhir': alm.rfidUid || '-',
    'Tanggal Kelulusan': formatToDDMMYYYY(alm.graduatedAt),
    'Catatan Kelulusan': alm.notes || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  worksheet['!cols'] = [
    { wch: 5 },  // No
    { wch: 18 }, // Tahun Kelulusan
    { wch: 15 }, // NISN
    { wch: 30 }, // Nama Lengkap
    { wch: 18 }, // Kelas Terakhir
    { wch: 15 }, // Jenis Kelamin
    { wch: 20 }, // Phone
    { wch: 18 }, // RFID UID
    { wch: 18 }, // Tanggal Kelulusan
    { wch: 35 }  // Catatan
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Alumni Siswa Lulus');
  XLSX.writeFile(workbook, filename);
};

// Export Alumni to CSV
export const exportAlumniToCSV = (
  alumni: AlumniStudent[],
  filenamePrefix = 'Data_Alumni_SMK_Ekonomika'
) => {
  const dateStr = formatToDDMMYYYY(new Date());
  const cleanPrefix = filenamePrefix.replace(/\s+/g, '_');
  const filename = `${cleanPrefix}_${dateStr}.csv`;

  const headers = [
    'No',
    'Tahun Kelulusan',
    'NISN',
    'Nama Lengkap Siswa',
    'Kelas Terakhir',
    'Jenis Kelamin',
    'Nomor Telepon',
    'RFID UID Terakhir',
    'Tanggal Kelulusan',
    'Catatan'
  ];

  const rows = alumni.map((alm, idx) => [
    idx + 1,
    `"${alm.graduationYear || '-'}"`,
    `"${alm.nisn || '-'}"`,
    `"${alm.name.replace(/"/g, '""')}"`,
    `"${alm.lastClass || '-'}"`,
    `"${alm.gender === 'L' ? 'Laki-laki' : alm.gender === 'P' ? 'Perempuan' : '-'}"`,
    `"${alm.phone || '-'}"`,
    `"${alm.rfidUid || '-'}"`,
    `"${formatToDDMMYYYY(alm.graduatedAt)}"`,
    `"${(alm.notes || '-').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadStudentExcelTemplate = (customClasses?: string[]) => {
  const masterClasses = customClasses && customClasses.length > 0 
    ? customClasses 
    : (typeof window !== 'undefined' ? AttendanceStorage.getClasses() : []);
  
  const cls1 = masterClasses[0] || 'X MIPA 1';
  const cls2 = masterClasses[1] || masterClasses[0] || 'X MIPA 2';
  const cls3 = masterClasses[2] || masterClasses[0] || 'XI IPS 1';

  // Sheet 1: Template Data Siswa (Clean separate columns with NIS)
  const headers = [
    'No',
    'NIS',
    'Nama Siswa',
    'NISN',
    'Kelas',
    'RFID UID MIFARE',
    'Jenis Kelamin (L/P)',
    'No WhatsApp Ortu'
  ];

  const sampleRows: (string | number)[][] = [
    [1, '26270115', 'Aisyah Asyifa Ramadhani', '0068492011', cls1, '0008451293', 'P', '081234567890'],
    [2, '26270116', 'Artisha Nugrahany', '0072849102', cls1, 'A34F221C', 'P', '081298765432'],
    [3, '26270117', 'Anita', '0061928475', cls2, '0009988771', 'P', '085611223344'],
    [4, '26270118', 'Bilqis Azkiyah', '0073849120', cls2, '', 'P', '087788990011'],
    [5, '26270119', 'Fajar Hidayat', '0065432198', cls3, '', 'L', '082155667788']
  ];

  const worksheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set explicit column widths
  worksheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 14 }, // NIS
    { wch: 28 }, // Nama Siswa
    { wch: 18 }, // NISN
    { wch: 18 }, // Kelas
    { wch: 22 }, // RFID UID MIFARE
    { wch: 20 }, // Jenis Kelamin
    { wch: 22 }  // No WhatsApp Ortu
  ];

  // Set explicit text type for NIS, NISN, RFID, Phone to ensure Excel doesn't strip leading zeros
  sampleRows.forEach((_, rowIdx) => {
    const rIdx = rowIdx + 2; // 1-based, row 1 is header
    const nisCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 1 });
    if (worksheet[nisCell]) worksheet[nisCell].t = 's';

    const nisnCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 3 });
    if (worksheet[nisnCell]) worksheet[nisnCell].t = 's';
    
    const rfidCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 5 });
    if (worksheet[rfidCell]) worksheet[rfidCell].t = 's';

    const phoneCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 7 });
    if (worksheet[phoneCell]) worksheet[phoneCell].t = 's';
  });

  // Sheet 2: Petunjuk Pengisian & Daftar Master Kelas
  const guideHeaders = ['No', 'Nama Kolom', 'Keterangan & Format Pengisian'];
  const guideRows = [
    [1, 'No', 'Nomor urut siswa (opsional, sebagai acuan penginput).'],
    [2, 'NIS', 'Nomor Induk Siswa lokal sekolah (e.g. 26270115). Wajib diisi dalam format teks.'],
    [3, 'Nama Siswa', 'Wajib diisi dengan nama lengkap siswa.'],
    [4, 'NISN', 'Nomor Induk Siswa Nasional (10 digit angka). Diisi dalam format teks agar angka 0 di depan tidak terhapus.'],
    [5, 'Kelas', 'Wajib diisi sesuai nama rombel / kelas di sistem.'],
    [6, 'RFID UID MIFARE', 'Opsional. Kode UID kartu RFID siswa. Kosongkan jika kartu belum tersedia.'],
    [7, 'Jenis Kelamin (L/P)', 'Isi dengan huruf L untuk Laki-laki atau P untuk Perempuan.'],
    [8, 'No WhatsApp Ortu', 'Opsional. Nomor WhatsApp orang tua / wali untuk notifikasi presensi.']
  ];

  const guideSheetData: (string | number)[][] = [
    ['PANDUAN PENGISIAN IMPORT DATA SISWA PER KOLOM'],
    [''],
    guideHeaders,
    ...guideRows,
    [''],
    ['DAFTAR MASTER KELAS TERDAFTAR DI SISTEM SAAT INI:'],
    ['No', 'Nama Kelas Terdaftar']
  ];

  masterClasses.forEach((cls, idx) => {
    guideSheetData.push([idx + 1, cls]);
  });

  const guideSheet = XLSX.utils.aoa_to_sheet(guideSheetData);
  guideSheet['!cols'] = [
    { wch: 6 },
    { wch: 25 },
    { wch: 75 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Siswa');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk & Master Kelas');

  XLSX.writeFile(workbook, 'Template_Import_Siswa_Per_Kolom.xlsx');
};

export const downloadStudentCsvTemplate = (customClasses?: string[]) => {
  const masterClasses = customClasses && customClasses.length > 0 
    ? customClasses 
    : (typeof window !== 'undefined' ? AttendanceStorage.getClasses() : []);
  
  const cls1 = masterClasses[0] || 'X MIPA 1';
  const cls2 = masterClasses[1] || masterClasses[0] || 'X MIPA 2';
  const cls3 = masterClasses[2] || masterClasses[0] || 'XI IPS 1';

  const headers = ['No', 'NIS', 'Nama Siswa', 'NISN', 'Kelas', 'RFID UID MIFARE', 'Jenis Kelamin', 'No WhatsApp Ortu'];
  const sampleRows = [
    ['1', '26270115', 'Aisyah Asyifa Ramadhani', '0068492011', cls1, '0008451293', 'P', '081234567890'],
    ['2', '26270116', 'Artisha Nugrahany', '0072849102', cls1, 'A34F221C', 'P', '081298765432'],
    ['3', '26270117', 'Anita', '0061928475', cls2, '0009988771', 'P', '085611223344'],
    ['4', '26270118', 'Bilqis Azkiyah', '0073849120', cls2, '', 'P', '087788990011'],
    ['5', '26270119', 'Fajar Hidayat', '0065432198', cls3, '', 'L', '082155667788']
  ];

  // Prepend UTF-8 BOM (\uFEFF) and use semicolon delimiter for perfect Excel compatibility
  const csvContent = '\uFEFF' + [
    headers.map(h => `"${h}"`).join(';'),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(';'))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Template_Import_Siswa_Per_Kolom.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// =========================================================================
// EKSPOR REKAP MATRIKS BULANAN PER KELAS (SESUAI GAMBAR BLANGKO SEKOLAH)
// =========================================================================

export const exportMonthlyMatrixToExcel = (params: {
  students: Student[];
  records: AttendanceRecord[];
  month: number; // 1-12
  year: number;
  className: string;
  schoolSchedule: SchoolSchedule;
}) => {
  const { students, records, month, year, className, schoolSchedule } = params;
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const monthName = monthNames[month - 1] || 'Bulan';
  const totalDays = new Date(year, month, 0).getDate();
  const today = new Date();
  const currentY = today.getFullYear();
  const currentM = today.getMonth() + 1;
  const currentD = today.getDate();

  // Create date columns header: 1..totalDays
  const dateHeaders: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    dateHeaders.push(String(d));
  }

  const tableHeaders = [
    'NO',
    'NISN',
    'NAMA PESERTA DIDIK',
    'L/P',
    ...dateHeaders,
    'TOTAL HARI TIDAK MASUK'
  ];

  // Build matrix rows
  const dataRows: (string | number)[][] = [];

  students.forEach((student, idx) => {
    const studentRecords = records.filter(r => 
      (r.studentId === student.id || (r.nisn && r.nisn === student.nisn) || (student.nis && r.nis === student.nis)) &&
      (r.userType === 'STUDENT' || !r.userType)
    );

    let absentCount = 0;
    const rowValues: (string | number)[] = [
      idx + 1,
      student.nisn || student.nis || '-',
      student.name,
      student.gender || 'L'
    ];

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0 Sun, 6 Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeekend) {
        rowValues.push('-');
      } else {
        const hasAttended = studentRecords.some(r => r.dateFormatted === dateStr && (r.type === 'MASUK' || r.status === 'TEPAT_WAKTU' || r.status === 'TERLAMBAT' || r.status === 'PULANG_CEPAT'));
        const isPastOrToday = (year < currentY) || (year === currentY && month < currentM) || (year === currentY && month === currentM && day <= currentD);

        if (hasAttended) {
          rowValues.push('✓');
        } else {
          rowValues.push('');
          if (isPastOrToday) {
            absentCount++;
          }
        }
      }
    }

    rowValues.push(absentCount);
    dataRows.push(rowValues);
  });

  const titleRows = [
    [`DAFTAR HADIR BULANAN PESERTA DIDIK`],
    [`SEKOLAH : ${schoolSchedule.schoolName || 'SMK EKONOMIKA'}`],
    [`KELAS   : ${className}`],
    [`BULAN   : ${monthName.toUpperCase()} ${year}`],
    ['']
  ];

  const aoa = [...titleRows, tableHeaders, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Set explicit column widths
  worksheet['!cols'] = [
    { wch: 5 },  // NO
    { wch: 16 }, // NISN
    { wch: 30 }, // NAMA
    { wch: 6 },  // L/P
    ...Array(totalDays).fill({ wch: 4 }), // Days 1..N
    { wch: 22 }  // TOTAL HARI TIDAK MASUK
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Matriks ${className.substring(0, 20)}`);

  const safeClassName = className.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(workbook, `Rekap_Matriks_Bulanan_${safeClassName}_${monthName}_${year}.xlsx`);
};

export const downloadTeacherExcelTemplate = () => {
  const headers = [
    'No',
    'Nama Lengkap Guru / PTK',
    'NIP / NUPTK',
    'Jabatan / Mata Pelajaran',
    'Nomor Kartu RFID MIFARE',
    'Jenis Kelamin (L/P)',
    'No WhatsApp / HP'
  ];

  const sampleRows: (string | number)[][] = [
    [1, 'Drs. H. Bambang Sujarwo, M.Pd.', '196805121994031005', 'Kepala Sekolah & Guru PKn', '0008451293', 'L', '081234567890'],
    [2, 'Siti Rahmawati, S.Pd.', '198207192008012015', 'Waka Kurikulum & Guru Matematika', 'A34F221C', 'P', '081298765432'],
    [3, 'Ahmad Fauzi, S.Kom., M.TI.', '198903142015021008', 'Kepala Program & Guru RPL', '0009988771', 'L', '085611223344'],
    [4, 'Nurul Aini, S.E., M.M.', '198511252010012019', 'Waka Kesiswaan & Guru Akuntansi', '', 'P', '087788990011']
  ];

  const worksheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  worksheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 35 }, // Nama
    { wch: 22 }, // NIP
    { wch: 32 }, // Jabatan
    { wch: 22 }, // RFID
    { wch: 20 }, // L/P
    { wch: 20 }  // HP
  ];

  sampleRows.forEach((_, rowIdx) => {
    const rIdx = rowIdx + 2;
    const nipCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 2 });
    if (worksheet[nipCell]) worksheet[nipCell].t = 's';
    const rfidCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 4 });
    if (worksheet[rfidCell]) worksheet[rfidCell].t = 's';
    const phoneCell = XLSX.utils.encode_cell({ r: rIdx - 1, c: 6 });
    if (worksheet[phoneCell]) worksheet[phoneCell].t = 's';
  });

  const guideHeaders = ['No', 'Nama Kolom', 'Keterangan & Format Pengisian'];
  const guideRows = [
    [1, 'No', 'Nomor urut guru/pegawai (opsional).'],
    [2, 'Nama Lengkap Guru / PTK', 'Wajib diisi dengan nama lengkap dan gelar.'],
    [3, 'NIP / NUPTK', 'Diisi dengan NIP/NUPTK/NIK (format teks agar angka 0 di depan tidak hilang).'],
    [4, 'Jabatan / Mata Pelajaran', 'Jabatan atau mata pelajaran yang diampu di sekolah.'],
    [5, 'Nomor Kartu RFID MIFARE', 'Opsional. Kode UID kartu RFID guru. Kosongkan jika belum tersedia.'],
    [6, 'Jenis Kelamin (L/P)', 'L untuk Laki-laki atau P untuk Perempuan.'],
    [7, 'No WhatsApp / HP', 'Opsional. Nomor kontak WhatsApp aktif untuk pemberitahuan presensi.']
  ];

  const guideSheetData: (string | number)[][] = [
    ['PANDUAN PENGISIAN IMPORT DATA GURU & PTK PER KOLOM'],
    [''],
    guideHeaders,
    ...guideRows
  ];

  const guideSheet = XLSX.utils.aoa_to_sheet(guideSheetData);
  guideSheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 75 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Guru');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk Pengisian');

  XLSX.writeFile(workbook, 'Template_Import_Guru_PTK_Per_Kolom.xlsx');
};

export const downloadTeacherCsvTemplate = () => {
  const headers = [
    'No',
    'Nama Lengkap Guru / PTK',
    'NIP / NUPTK',
    'Jabatan / Mata Pelajaran',
    'Nomor Kartu RFID MIFARE',
    'Jenis Kelamin',
    'No WhatsApp / HP'
  ];

  const sampleRows = [
    ['1', 'Drs. H. Bambang Sujarwo, M.Pd.', '196805121994031005', 'Kepala Sekolah & Guru PKn', '0008451293', 'L', '081234567890'],
    ['2', 'Siti Rahmawati, S.Pd.', '198207192008012015', 'Waka Kurikulum & Guru Matematika', 'A34F221C', 'P', '081298765432'],
    ['3', 'Ahmad Fauzi, S.Kom., M.TI.', '198903142015021008', 'Kepala Program & Guru RPL', '0009988771', 'L', '085611223344'],
    ['4', 'Nurul Aini, S.E., M.M.', '198511252010012019', 'Waka Kesiswaan & Guru Akuntansi', '', 'P', '087788990011']
  ];

  // Prepend UTF-8 BOM (\uFEFF) and use semicolon delimiter for perfect Excel multi-column opening
  const csvContent = '\uFEFF' + [
    headers.map(h => `"${h}"`).join(';'),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(';'))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Template_Import_Guru_PTK_Per_Kolom.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Cetak Laporan Siswa Belum Hadir / Alpha Hari Ini
export const printAbsentStudentsReport = (
  students: Student[],
  schoolName: string,
  title = 'Laporan Siswa Belum Hadir / Alpha Hari Ini',
  subtitle?: string
) => {
  const printDateStr = formatToDayDate(new Date());

  const tableRows = students.map((std, idx) => `
    <tr style="font-size: 11px;">
      <td style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
      <td style="padding: 6px 8px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${std.nis || '-'}</td>
      <td style="padding: 6px 8px; font-family: monospace; font-size: 11px; border: 1px solid #cbd5e1;">${std.nisn || '-'}</td>
      <td style="padding: 6px 8px; font-weight: 700; color: #0f172a; border: 1px solid #cbd5e1;">${std.name}</td>
      <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #cbd5e1;">${std.class}</td>
      <td style="padding: 6px 8px; font-family: monospace; font-size: 10px; color: #64748b; border: 1px solid #cbd5e1;">${std.rfidUid || '-'}</td>
      <td style="padding: 6px 8px; text-align: center; font-weight: 700; color: #dc2626; background-color: #fef2f2; border: 1px solid #cbd5e1;">BELUM TAP / ALPHA</td>
      <td style="padding: 6px 8px; border: 1px solid #cbd5e1;"></td>
    </tr>
  `).join('');

  const completeHtml = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
          * { box-sizing: border-box; }
          body { font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; padding: 16px; color: #0f172a; background: #fff; margin: 0; }
          .school-kop { text-align: center; margin-bottom: 4px; }
          .yayasan { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #475569; text-transform: uppercase; }
          .school-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; margin: 2px 0; }
          .school-sub { font-size: 10px; font-weight: 700; color: #334155; }
          .school-addr { font-size: 9.5px; color: #64748b; margin-top: 2px; }
          .kop-divider { border-top: 2.5px solid #0f172a; border-bottom: 1px solid #0f172a; height: 3px; margin: 6px 0 12px 0; }
          .doc-title-container { text-align: center; margin-bottom: 12px; }
          .doc-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: #b91c1c; }
          .filter-badges { margin-top: 4px; font-size: 11px; font-weight: 600; color: #475569; }
          .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
          .summary-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 12px; text-align: center; }
          .summary-box .val { font-size: 18px; font-weight: 800; font-family: monospace; color: #b91c1c; }
          .summary-box .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #7f1d1d; margin-top: 2px; }
          .meta { margin-bottom: 8px; font-size: 10.5px; display: flex; justify-content: space-between; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f8fafc; padding: 7px 8px; text-align: left; font-weight: 700; border: 1px solid #cbd5e1; font-size: 10.5px; text-transform: uppercase; color: #334155; }
          tbody tr:nth-child(even) { background-color: #fbfcfd; }
          .signature-section { margin-top: 32px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-box { text-align: center; width: 220px; font-size: 11px; }
          .sign-line { margin-top: 60px; border-bottom: 1px solid #0f172a; }
          .sign-name { font-weight: 700; margin-top: 4px; }
          .sign-nip { font-size: 10px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="school-kop">
          <div class="yayasan">YAYASAN PENDIDIKAN EKONOMIKA DEPOK</div>
          <div class="school-name">${schoolName || 'SMK EKONOMIKA KOTA DEPOK'}</div>
          <div class="school-sub">TERAKREDITASI &ldquo;A&rdquo; (UNGGUL) &middot; NPSN: 20268492 &middot; KODE SEKOLAH: 4321</div>
          <div class="school-addr">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat 16436 &middot; Telp: (021) 7720-1122</div>
        </div>
        <div class="kop-divider"></div>

        <div class="doc-title-container">
          <h2 class="doc-title">${title}</h2>
          <div class="filter-badges">${subtitle || '-'}</div>
        </div>

        <div class="summary-grid">
          <div class="summary-box">
            <div class="val">${students.length}</div>
            <div class="lbl">Total Siswa Belum Absen / Alpha Hari Ini</div>
          </div>
          <div class="summary-box" style="background: #f8fafc; border-color: #cbd5e1;">
            <div class="val" style="color: #0f172a;">${printDateStr}</div>
            <div class="lbl" style="color: #64748b;">Waktu Pembuatan Dokumen</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">No</th>
              <th style="width: 70px;">NIS</th>
              <th style="width: 90px;">NISN</th>
              <th>Nama Siswa</th>
              <th style="width: 90px;">Kelas</th>
              <th style="width: 90px;">RFID UID</th>
              <th style="width: 140px; text-align: center;">Status</th>
              <th style="width: 110px;">Catatan / Paraf</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows.length > 0 ? tableRows : '<tr><td colspan="8" style="text-align:center; padding: 20px;">Semua siswa telah melakukan presensi. Tidak ada siswa alpha.</td></tr>'}
          </tbody>
        </table>

        <div class="signature-section">
          <div class="signature-box">
            <div>Mengetahui,</div>
            <div style="font-weight: 700;">Kepala SMK Ekonomika Depok</div>
            <div class="sign-line"></div>
            <div class="sign-name">Drs. H. Bambang Sujarwo, M.Pd.</div>
            <div class="sign-nip">NIP. 196805121994031005</div>
          </div>
          <div class="signature-box">
            <div>Kota Depok, ${printDateStr}</div>
            <div style="font-weight: 700;">Koordinator Guru Piket</div>
            <div class="sign-line"></div>
            <div class="sign-name">Tim Guru Piket Harian</div>
            <div class="sign-nip">SMK Ekonomika Depok</div>
          </div>
        </div>
      </body>
    </html>
  `;

  executePrintHtml(completeHtml, title);
};

// Cetak Laporan Urutan Kedatangan Siswa Hari Ini
export const printArrivalRankingReport = (
  rankingItems: { rank: number; record: AttendanceRecord; isLate: boolean }[],
  schoolName: string,
  title = 'Laporan Urutan Kedatangan Siswa Hari Ini',
  subtitle?: string
) => {
  const printDateStr = formatToDayDate(new Date());

  const tableRows = rankingItems.map((item) => `
    <tr style="font-size: 11px;">
      <td style="padding: 6px 8px; text-align: center; font-weight: 800; border: 1px solid #cbd5e1; ${item.rank <= 3 ? 'background-color: #fef3c7; color: #92400e;' : ''}">#${item.rank}</td>
      <td style="padding: 6px 8px; font-family: monospace; font-weight: 700; color: #0284c7; border: 1px solid #cbd5e1;">${item.record.timeFormatted} WIB</td>
      <td style="padding: 6px 8px; font-weight: 700; color: #0f172a; border: 1px solid #cbd5e1;">${item.record.studentName}</td>
      <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #cbd5e1;">${item.record.studentClass}</td>
      <td style="padding: 6px 8px; font-size: 10.5px; color: #475569; border: 1px solid #cbd5e1;">${item.record.gateName}</td>
      <td style="padding: 6px 8px; text-align: center; font-weight: 700; border: 1px solid #cbd5e1; ${item.isLate ? 'color: #b45309; background-color: #fffbeb;' : 'color: #15803d; background-color: #f0fdf4;'}">
        ${item.isLate ? `TERLAMBAT (+${item.record.lateMinutes || 0}m)` : (item.rank === 1 ? 'BURUNG HANTU (#1 TERCEPAT)' : 'TEPAT WAKTU')}
      </td>
      <td style="padding: 6px 8px; font-size: 10px; color: #64748b; border: 1px solid #cbd5e1;">${item.record.notes || '-'}</td>
    </tr>
  `).join('');

  const onTimeCount = rankingItems.filter(i => !i.isLate).length;
  const lateCount = rankingItems.filter(i => i.isLate).length;

  const completeHtml = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
          * { box-sizing: border-box; }
          body { font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; padding: 16px; color: #0f172a; background: #fff; margin: 0; }
          .school-kop { text-align: center; margin-bottom: 4px; }
          .yayasan { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #475569; text-transform: uppercase; }
          .school-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; margin: 2px 0; }
          .school-sub { font-size: 10px; font-weight: 700; color: #334155; }
          .school-addr { font-size: 9.5px; color: #64748b; margin-top: 2px; }
          .kop-divider { border-top: 2.5px solid #0f172a; border-bottom: 1px solid #0f172a; height: 3px; margin: 6px 0 12px 0; }
          .doc-title-container { text-align: center; margin-bottom: 12px; }
          .doc-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: #1e293b; }
          .filter-badges { margin-top: 4px; font-size: 11px; font-weight: 600; color: #475569; }
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
          .summary-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; text-align: center; }
          .summary-box .val { font-size: 18px; font-weight: 800; font-family: monospace; color: #0f172a; }
          .summary-box .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f8fafc; padding: 7px 8px; text-align: left; font-weight: 700; border: 1px solid #cbd5e1; font-size: 10.5px; text-transform: uppercase; color: #334155; }
          tbody tr:nth-child(even) { background-color: #fbfcfd; }
          .signature-section { margin-top: 32px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-box { text-align: center; width: 220px; font-size: 11px; }
          .sign-line { margin-top: 60px; border-bottom: 1px solid #0f172a; }
          .sign-name { font-weight: 700; margin-top: 4px; }
          .sign-nip { font-size: 10px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="school-kop">
          <div class="yayasan">YAYASAN PENDIDIKAN EKONOMIKA DEPOK</div>
          <div class="school-name">${schoolName || 'SMK EKONOMIKA KOTA DEPOK'}</div>
          <div class="school-sub">TERAKREDITASI &ldquo;A&rdquo; (UNGGUL) &middot; NPSN: 20268492 &middot; KODE SEKOLAH: 4321</div>
          <div class="school-addr">Jl. Raya Sawangan No. 45, Pancoran Mas, Kota Depok, Jawa Barat 16436 &middot; Telp: (021) 7720-1122</div>
        </div>
        <div class="kop-divider"></div>

        <div class="doc-title-container">
          <h2 class="doc-title">${title}</h2>
          <div class="filter-badges">${subtitle || '-'}</div>
        </div>

        <div class="summary-grid">
          <div class="summary-box">
            <div class="val">${rankingItems.length}</div>
            <div class="lbl">Total Siswa Hadir Masuk</div>
          </div>
          <div class="summary-box">
            <div class="val" style="color: #15803d;">${onTimeCount}</div>
            <div class="lbl">Hadir Tepat Waktu</div>
          </div>
          <div class="summary-box">
            <div class="val" style="color: #b45309;">${lateCount}</div>
            <div class="lbl">Hadir Terlambat</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 45px; text-align: center;">Urutan</th>
              <th style="width: 100px;">Jam Masuk</th>
              <th>Nama Siswa</th>
              <th style="width: 100px;">Kelas</th>
              <th style="width: 110px;">Titik Pintu</th>
              <th style="width: 180px; text-align: center;">Status Kedatangan</th>
              <th style="width: 110px;">Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows.length > 0 ? tableRows : '<tr><td colspan="7" style="text-align:center; padding: 20px;">Belum ada siswa yang hadir masuk hari ini.</td></tr>'}
          </tbody>
        </table>

        <div class="signature-section">
          <div class="signature-box">
            <div>Mengetahui,</div>
            <div style="font-weight: 700;">Kepala SMK Ekonomika Depok</div>
            <div class="sign-line"></div>
            <div class="sign-name">Drs. H. Bambang Sujarwo, M.Pd.</div>
            <div class="sign-nip">NIP. 196805121994031005</div>
          </div>
          <div class="signature-box">
            <div>Kota Depok, ${printDateStr}</div>
            <div style="font-weight: 700;">Koordinator Guru Piket</div>
            <div class="sign-line"></div>
            <div class="sign-name">Tim Guru Piket Harian</div>
            <div class="sign-nip">SMK Ekonomika Depok</div>
          </div>
        </div>
      </body>
    </html>
  `;

  executePrintHtml(completeHtml, title);
};
