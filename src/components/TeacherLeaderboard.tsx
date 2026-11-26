import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, TeacherEarlyRankItem, TeacherLateRankItem } from '../types';
import { AttendanceStorage } from '../lib/storage';
import * as XLSX from 'xlsx';
import { 
  Award, 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  Search, 
  UserCheck, 
  TrendingUp, 
  CheckCircle2, 
  ShieldCheck, 
  Download,
  Filter,
  Trophy
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface TeacherLeaderboardProps {
  teachers: Teacher[];
  onNavigateTab?: (tab: string) => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const TeacherLeaderboard: React.FC<TeacherLeaderboardProps> = ({ teachers, onNavigateTab }) => {
  const today = new Date();
  const [activeCategory, setActiveCategory] = useState<'early' | 'late'>('early');
  const [periodMode, setPeriodMode] = useState<'today' | 'month'>('today');
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [syncVersion, setSyncVersion] = useState<number>(0);

  // Subscribe to real-time changes
  useEffect(() => {
    const unsub = AttendanceStorage.subscribeToSync(() => {
      setSyncVersion(v => v + 1);
    });
    return () => unsub();
  }, []);

  // Calculate rankings based on periodMode
  const earlyRankings: TeacherEarlyRankItem[] = useMemo(() => {
    if (periodMode === 'today') {
      return AttendanceStorage.getTeacherEarlyRankings({ period: 'today' });
    } else {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return AttendanceStorage.getTeacherEarlyRankings({
        period: 'custom',
        startDate,
        endDate
      });
    }
  }, [periodMode, selectedMonth, selectedYear, syncVersion]);

  const lateRankings: TeacherLateRankItem[] = useMemo(() => {
    if (periodMode === 'today') {
      return AttendanceStorage.getTeacherLateRankings({ period: 'today' });
    } else {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return AttendanceStorage.getTeacherLateRankings({
        period: 'custom',
        startDate,
        endDate
      });
    }
  }, [periodMode, selectedMonth, selectedYear, syncVersion]);

  // Search filter
  const filteredEarlyList = useMemo(() => {
    if (!searchQuery.trim()) return earlyRankings;
    const q = searchQuery.toLowerCase().trim();
    return earlyRankings.filter(item => 
      item.teacherName.toLowerCase().includes(q) ||
      (item.nip && item.nip.toLowerCase().includes(q)) ||
      item.position.toLowerCase().includes(q)
    );
  }, [earlyRankings, searchQuery]);

  const filteredLateList = useMemo(() => {
    if (!searchQuery.trim()) return lateRankings;
    const q = searchQuery.toLowerCase().trim();
    return lateRankings.filter(item => 
      item.teacherName.toLowerCase().includes(q) ||
      (item.nip && item.nip.toLowerCase().includes(q)) ||
      item.position.toLowerCase().includes(q)
    );
  }, [lateRankings, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    const monthName = MONTH_NAMES[selectedMonth - 1];
    const periodLabel = periodMode === 'today' ? 'Hari_Ini_Realtime' : `${monthName}_${selectedYear}`;

    if (activeCategory === 'early') {
      const rows = filteredEarlyList.map((item, idx) => ({
        'Peringkat': idx + 1,
        'Nama Guru / PTK': item.teacherName,
        'NIP': item.nip || '-',
        'Jabatan / Mata Pelajaran': item.position,
        'Jam Kedatangan (Realtime / Terpagi)': item.earliestTime,
        'Rata-rata Jam Masuk': item.avgArrivalTime,
        'Total Hari Hadir': item.totalPresent,
        'Hari Tepat Waktu': item.onTimeCount
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Peringkat Terpagi Guru');
      XLSX.writeFile(wb, `Peringkat_Guru_Terpagi_${periodLabel}.xlsx`);
    } else {
      const rows = filteredLateList.map((item, idx) => ({
        'Peringkat Terlambat': idx + 1,
        'Nama Guru / PTK': item.teacherName,
        'NIP': item.nip || '-',
        'Jabatan / Mata Pelajaran': item.position,
        'Frekuensi Terlambat': `${item.lateCount} kali`,
        'Total Menit Terlambat': `${item.totalLateMinutes} menit`,
        'Rata-rata Menit Terlambat': `${item.avgLateMinutes} menit`,
        'Terlambat Terakhir (Tanggal/Jam)': `${item.latestLateDate} ${item.latestLateTime}`
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Peringkat Terlambat Guru');
      XLSX.writeFile(wb, `Peringkat_Guru_Terlambat_${periodLabel}.xlsx`);
    }
  };

  const currentMonthName = MONTH_NAMES[selectedMonth - 1];

  return (
    <div className="space-y-6">
      
      {/* HEADER SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs font-bold rounded border border-purple-500/30 uppercase tracking-wide">
              Khusus Guru & Karyawan (PTK)
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-1.5">
            <Award className="w-5 h-5 text-purple-400" />
            <span>Urutan & Peringkat Kedatangan Guru</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Sistem evaluasi kedisiplinan dan apresiasi kehadiran guru/karyawan berdasarkan tap realtime harian dan rata-rata waktu kedatangan bulanan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('leaderboard')}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs rounded border border-slate-700 transition-colors cursor-pointer"
              title="Buka Peringkat Kedatangan Khusus Siswa"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Peringkat Siswa</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* FILTER & PERIOD SWITCHER BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        
        {/* Category: Paling Awal vs Paling Telat */}
        <div className="flex items-center bg-slate-950 p-1 rounded-md border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveCategory('early')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
              activeCategory === 'early'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>Guru Datang Paling Awal (Terpagi)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('late')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
              activeCategory === 'late'
                ? 'bg-rose-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
            <span>Guru Datang Paling Telat (Terlambat)</span>
          </button>
        </div>

        {/* Period Mode: Hari Ini (Realtime) vs Periode Bulan */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-950 p-1 rounded-md border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setPeriodMode('today')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                periodMode === 'today'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Hari Ini (Realtime)</span>
            </button>

            <button
              type="button"
              onClick={() => setPeriodMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                periodMode === 'month'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Periode Bulan</span>
            </button>
          </div>

          {/* Month / Year Selectors when periodMode is 'month' */}
          {periodMode === 'month' && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-purple-500 font-medium"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-purple-500 font-medium"
              >
                {[2024, 2025, 2026, 2027].map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama / NIP guru..."
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded pl-8 pr-3 py-1 focus:outline-none focus:border-purple-500 w-48"
            />
          </div>
        </div>

      </div>

      {/* TOP 3 PODIUM (FOR EARLY RANKING) */}
      {activeCategory === 'early' && filteredEarlyList.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Rank 2 */}
          <div className="card-container-compact flex flex-col items-center text-center relative overflow-hidden">
            <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-mono font-bold uppercase rounded-sm mb-2 border border-slate-700">
              Peringkat 02
            </span>
            <UserAvatar
              name={filteredEarlyList[1].teacherName}
              role="GURU"
              size="lg"
              shape="passport"
              className="mb-2"
            />
            <h4 className="text-sm font-bold text-white truncate max-w-full">
              {filteredEarlyList[1].teacherName}
            </h4>
            <p className="text-xs text-slate-400 truncate max-w-full">{filteredEarlyList[1].position}</p>
            <div className="mt-2 text-xs font-mono tabular-nums font-semibold text-slate-300">
              {periodMode === 'today' ? `Masuk: ${filteredEarlyList[1].earliestTime}` : `Rata-rata: ${filteredEarlyList[1].avgArrivalTime}`}
            </div>
          </div>

          {/* Rank 1 (Leader / Center) */}
          <div className="card-container-compact border-emerald-500/40 flex flex-col items-center text-center relative overflow-hidden">
            <span className="px-2.5 py-0.5 bg-emerald-950/70 text-emerald-300 text-[10px] font-mono font-bold uppercase rounded-sm mb-2 flex items-center gap-1.5 border border-emerald-500/50">
              <Trophy className="w-3 h-3 text-emerald-400" />
              Peringkat 01 · Terpagi
            </span>
            <UserAvatar
              name={filteredEarlyList[0].teacherName}
              role="GURU"
              size="lg"
              shape="passport"
              className="mb-2 border-emerald-400"
            />
            <h4 className="text-base font-bold text-white truncate max-w-full">
              {filteredEarlyList[0].teacherName}
            </h4>
            <p className="text-xs text-emerald-400 font-medium truncate max-w-full">{filteredEarlyList[0].position}</p>
            <div className="mt-2 text-sm font-mono tabular-nums font-bold text-emerald-300">
              {periodMode === 'today' ? `Masuk: ${filteredEarlyList[0].earliestTime} WIB` : `Rata-rata: ${filteredEarlyList[0].avgArrivalTime} WIB`}
            </div>
          </div>

          {/* Rank 3 */}
          <div className="card-container-compact flex flex-col items-center text-center relative overflow-hidden">
            <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-mono font-bold uppercase rounded-sm mb-2 border border-slate-700">
              Peringkat 03
            </span>
            <UserAvatar
              name={filteredEarlyList[2].teacherName}
              role="GURU"
              size="lg"
              shape="passport"
              className="mb-2"
            />
            <h4 className="text-sm font-bold text-white truncate max-w-full">
              {filteredEarlyList[2].teacherName}
            </h4>
            <p className="text-xs text-slate-400 truncate max-w-full">{filteredEarlyList[2].position}</p>
            <div className="mt-2 text-xs font-mono tabular-nums font-semibold text-slate-300">
              {periodMode === 'today' ? `Masuk: ${filteredEarlyList[2].earliestTime}` : `Rata-rata: ${filteredEarlyList[2].avgArrivalTime}`}
            </div>
          </div>
        </div>
      )}

      {/* TABLE DATA PRESENTATION */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        
        {/* Table Title Bar */}
        <div className="px-4 py-3 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold">
            {activeCategory === 'early' 
              ? `Tabel Peringkat Kedatangan Guru Terpagi (${periodMode === 'today' ? 'Hari Ini Realtime' : `${currentMonthName} ${selectedYear}`})`
              : `Tabel Peringkat Guru Terlambat (${periodMode === 'today' ? 'Hari Ini Realtime' : `${currentMonthName} ${selectedYear}`})`
            }
          </span>
          <span className="text-slate-400">
            Total Guru Terdata: {activeCategory === 'early' ? filteredEarlyList.length : filteredLateList.length}
          </span>
        </div>

        {/* Early Ranking Table */}
        {activeCategory === 'early' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4 text-center w-16">Peringkat</th>
                  <th className="py-3 px-4">Guru / Karyawan (PTK)</th>
                  <th className="py-3 px-4">Jabatan / Mapel</th>
                  <th className="py-3 px-4 font-mono">
                    {periodMode === 'today' ? 'Waktu Tap Masuk Hari Ini' : 'Rata-rata Jam Masuk'}
                  </th>
                  <th className="py-3 px-4 text-center font-mono">Total Hari Hadir</th>
                  <th className="py-3 px-4 text-center font-mono">Tepat Waktu</th>
                  <th className="py-3 px-4 text-center">Status Kedisiplinan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredEarlyList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Belum ada data kedatangan guru pada periode terpilih.
                    </td>
                  </tr>
                ) : (
                  filteredEarlyList.map((item, idx) => (
                    <tr key={item.teacherId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-center font-bold">
                        {idx === 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-500/50 rounded-sm font-mono font-bold text-xs">#01</span>
                        ) : idx === 1 ? (
                          <span className="px-2 py-0.5 bg-blue-950/70 text-blue-300 border border-blue-500/50 rounded-sm font-mono font-bold text-xs">#02</span>
                        ) : idx === 2 ? (
                          <span className="px-2 py-0.5 bg-amber-950/70 text-amber-300 border border-amber-500/50 rounded-sm font-mono font-bold text-xs">#03</span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">#{String(idx + 1).padStart(2, '0')}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{item.teacherName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">NIP: {item.nip || '-'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{item.position}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {periodMode === 'today' ? (
                          <span>{item.earliestTime} WIB</span>
                        ) : (
                          <span>{item.avgArrivalTime} WIB (Rata-rata)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-300">
                        {item.totalPresent} hari
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-emerald-400 font-semibold">
                        {item.onTimeCount} hari
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-semibold">
                          Sangat Disiplin
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Late Ranking Table */}
        {activeCategory === 'late' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4 text-center w-16">Urutan</th>
                  <th className="py-3 px-4">Guru / Karyawan (PTK)</th>
                  <th className="py-3 px-4">Jabatan / Mapel</th>
                  <th className="py-3 px-4 text-center font-mono">Frekuensi Terlambat</th>
                  <th className="py-3 px-4 text-center font-mono">Total Menit</th>
                  <th className="py-3 px-4 text-center font-mono">Rata-rata Keterlambatan</th>
                  <th className="py-3 px-4 font-mono">Terakhir Terlambat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLateList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Tidak ada data keterlambatan guru pada periode terpilih (Semua Tepat Waktu).
                    </td>
                  </tr>
                ) : (
                  filteredLateList.map((item, idx) => (
                    <tr key={item.teacherId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-center font-mono font-bold text-rose-400 tabular-nums text-xs">
                        #{String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{item.teacherName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">NIP: {item.nip || '-'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{item.position}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-rose-400">
                        {item.lateCount} kali
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-300">
                        +{item.totalLateMinutes} menit
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-amber-400 font-semibold">
                        +{item.avgLateMinutes} menit
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {item.latestLateDate} ({item.latestLateTime})
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
