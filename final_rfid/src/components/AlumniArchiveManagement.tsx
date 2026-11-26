import React, { useState, useMemo, useEffect } from 'react';
import { AlumniStudent, AcademicYearArchive } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { exportAlumniToExcel, exportAlumniToCSV } from '../lib/exportUtils';
import { formatToDDMMYYYY } from '../lib/dateUtils';
import { TablePagination } from './TablePagination';
import { 
  GraduationCap, 
  Archive, 
  Search, 
  Download, 
  FileSpreadsheet, 
  Trash2, 
  Plus, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  BookOpen,
  Filter,
  Eye,
  Info
} from 'lucide-react';

interface AlumniArchiveManagementProps {
  showToast: (msg: string) => void;
  onOpenRolloverModal: () => void;
}

export const AlumniArchiveManagement: React.FC<AlumniArchiveManagementProps> = ({
  showToast,
  onOpenRolloverModal
}) => {
  const [activeTab, setActiveTab] = useState<'alumni' | 'archives'>('alumni');
  const [alumniList, setAlumniList] = useState<AlumniStudent[]>(() => AttendanceStorage.getAlumniStudents());
  const [archiveList, setArchiveList] = useState<AcademicYearArchive[]>(() => AttendanceStorage.getAcademicYearArchives());

  // Subscribe to updates
  useEffect(() => {
    const unsub = AttendanceStorage.subscribeToSync((evt) => {
      if (evt.type === 'ALUMNI_UPDATED' || evt.type === 'ACADEMIC_ARCHIVES_UPDATED' || evt.type === 'ACADEMIC_ROLLOVER_COMPLETED') {
        setAlumniList(AttendanceStorage.getAlumniStudents());
        setArchiveList(AttendanceStorage.getAcademicYearArchives());
      }
    });
    return () => unsub();
  }, []);

  const refreshData = () => {
    setAlumniList(AttendanceStorage.getAlumniStudents());
    setArchiveList(AttendanceStorage.getAcademicYearArchives());
    showToast('Data Alumni & Arsip berhasil dimuat ulang!');
  };

  // Alumni filtering & pagination state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGraduationYear, setSelectedGraduationYear] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Available graduation years
  const availableGraduationYears = useMemo(() => {
    const years = new Set<string>();
    alumniList.forEach(a => {
      if (a.graduationYear) years.add(a.graduationYear);
    });
    return Array.from(years).sort().reverse();
  }, [alumniList]);

  // Filtered alumni
  const filteredAlumni = useMemo(() => {
    return alumniList.filter(a => {
      if (selectedGraduationYear !== 'ALL' && a.graduationYear !== selectedGraduationYear) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = a.name.toLowerCase().includes(q);
        const matchNisn = (a.nisn || '').toLowerCase().includes(q);
        const matchClass = (a.lastClass || '').toLowerCase().includes(q);
        const matchUid = (a.rfidUid || '').toLowerCase().includes(q);
        if (!matchName && !matchNisn && !matchClass && !matchUid) return false;
      }
      return true;
    });
  }, [alumniList, selectedGraduationYear, searchQuery]);

  const paginatedAlumni = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAlumni.slice(start, start + pageSize);
  }, [filteredAlumni, currentPage, pageSize]);

  // Handlers
  const handleExportExcel = () => {
    if (filteredAlumni.length === 0) {
      showToast('Tidak ada data alumni untuk diekspor');
      return;
    }
    exportAlumniToExcel(filteredAlumni, `Data_Alumni_${selectedGraduationYear === 'ALL' ? 'Semua_Angkatan' : selectedGraduationYear.replace(/\//g, '-')}`);
    showToast('Data alumni berhasil diekspor ke Excel!');
  };

  const handleExportCSV = () => {
    if (filteredAlumni.length === 0) {
      showToast('Tidak ada data alumni untuk diekspor');
      return;
    }
    exportAlumniToCSV(filteredAlumni, `Data_Alumni_${selectedGraduationYear === 'ALL' ? 'Semua_Angkatan' : selectedGraduationYear.replace(/\//g, '-')}`);
    showToast('Data alumni berhasil diekspor ke CSV!');
  };

  const handleDeleteAlumni = (id: string, name: string) => {
    if (confirm(`Hapus catatan alumni "${name}" dari arsip?`)) {
      const updated = AttendanceStorage.deleteAlumniStudent(id);
      setAlumniList(updated);
      showToast(`Data alumni ${name} berhasil dihapus.`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Tab Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-[#0e1a38] border border-blue-900/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Arsip Akademik & Siswa Alumni
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pusat data siswa yang telah lulus sekolah dan riwayat rekapitulasi presensi tahunan yang dibekukan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={refreshData}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors"
            title="Muat Ulang Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={onOpenRolloverModal}
            className="btn-primary-sharp text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Kenaikan Kelas & TA Baru</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-blue-900/30 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('alumni')}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'alumni'
              ? 'bg-[#0e1a38] text-blue-400 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Data Siswa Lulus / Alumni ({alumniList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archives')}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'archives'
              ? 'bg-[#0e1a38] text-blue-400 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Riwayat Rekap Tahunan ({archiveList.length})</span>
        </button>
      </div>

      {/* TAB 1: DATA SISWA LULUS / ALUMNI */}
      {activeTab === 'alumni' && (
        <div className="space-y-3">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 p-3 rounded-lg bg-[#0e1a38] border border-blue-900/30">
            <div className="flex flex-wrap items-center gap-2">
              {/* Year Filter */}
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Filter className="w-3.5 h-3.5 text-blue-400" />
                <span>Angkatan:</span>
                <select
                  value={selectedGraduationYear}
                  onChange={(e) => {
                    setSelectedGraduationYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-[#070d1e] border border-blue-900/30 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="ALL">Semua Angkatan</option>
                  {availableGraduationYears.map(yr => (
                    <option key={yr} value={yr}>Lulus TA {yr}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama, NISN, kelas..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#070d1e] border border-blue-900/30 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="btn-secondary-sharp text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                title="Ekspor CSV Format Excel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="btn-primary-sharp text-xs px-3 py-1.5 flex items-center gap-1.5"
                title="Ekspor Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Alumni Table */}
          <div className="border border-blue-900/30 rounded-lg overflow-hidden bg-[#070d1e]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0e1a38] text-slate-300 border-b border-blue-900/30">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12">No</th>
                    <th className="py-2.5 px-3">Tahun Kelulusan</th>
                    <th className="py-2.5 px-3">NISN</th>
                    <th className="py-2.5 px-3">Nama Lengkap</th>
                    <th className="py-2.5 px-3">Kelas Terakhir</th>
                    <th className="py-2.5 px-3 text-center">L/P</th>
                    <th className="py-2.5 px-3">RFID UID Terakhir</th>
                    <th className="py-2.5 px-3">Tanggal Lulus</th>
                    <th className="py-2.5 px-3">Catatan</th>
                    <th className="py-2.5 px-3 text-center w-16">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-900/20 text-slate-200">
                  {filteredAlumni.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-500">
                        {alumniList.length === 0 ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-400">Belum ada siswa alumni yang terarsip.</p>
                            <p className="text-[11px] text-slate-500">
                              Saat tahun ajaran berakhir, jalankan <strong>Kenaikan Kelas & TA Baru</strong> untuk meluluskan siswa kelas XII.
                            </p>
                          </div>
                        ) : (
                          'Tidak ada data alumni yang cocok dengan pencarian.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginatedAlumni.map((alm, idx) => {
                      const absoluteIndex = (currentPage - 1) * pageSize + idx + 1;
                      return (
                        <tr key={alm.id} className="hover:bg-blue-900/10 transition-colors">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">{absoluteIndex}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{alm.graduationYear}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{alm.nisn || '-'}</td>
                          <td className="py-2.5 px-3 font-semibold text-white">{alm.name}</td>
                          <td className="py-2.5 px-3 font-mono text-sky-300">{alm.lastClass}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${alm.gender === 'L' ? 'bg-blue-500/20 text-blue-300' : 'bg-pink-500/20 text-pink-300'}`}>
                              {alm.gender || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{alm.rfidUid || '-'}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{formatToDDMMYYYY(alm.graduatedAt)}</td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-[200px] truncate">{alm.notes || '-'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteAlumni(alm.id, alm.name)}
                              className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-900/40 transition-colors"
                              title="Hapus Dari Arsip"
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
            </div>

            {/* Pagination */}
            {filteredAlumni.length > pageSize && (
              <div className="p-3 border-t border-blue-900/30 bg-[#0e1a38]">
                <TablePagination
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalItems={filteredAlumni.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RIWAYAT ARSIP REKAP TAHUNAN */}
      {activeTab === 'archives' && (
        <div className="space-y-4">
          {archiveList.length === 0 ? (
            <div className="p-12 text-center bg-[#0e1a38] border border-blue-900/30 rounded-xl space-y-2">
              <Archive className="w-10 h-10 text-slate-500 mx-auto" />
              <h4 className="text-sm font-bold text-slate-300">Belum Ada Arsip Rekapitulasi Tahunan</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Riwayat tahunan akan otomatis dibekukan dan dicatat di sini setiap kali Anda menjalankan proses Kenaikan Kelas & Pergantian Tahun Ajaran Baru.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {archiveList.map((arc) => (
                <div
                  key={arc.id}
                  className="p-4 rounded-xl bg-[#0e1a38] border border-blue-900/30 hover:border-blue-500/40 transition-all space-y-3 shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">Tahun Ajaran {arc.academicYear}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          TA Lampau
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Diarsipkan pada: {formatToDDMMYYYY(arc.archivedAt)} oleh <strong className="text-slate-300">{arc.archivedBy}</strong>
                      </p>
                    </div>

                    <div className="px-2.5 py-1 rounded bg-[#070d1e] border border-blue-900/30 text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Menuju TA</div>
                      <div className="text-xs font-mono font-bold text-blue-400">{arc.nextAcademicYear}</div>
                    </div>
                  </div>

                  {/* Summary Metric Grid */}
                  <div className="grid grid-cols-4 gap-2 text-center p-2.5 rounded-lg bg-[#070d1e] border border-blue-900/20">
                    <div>
                      <div className="text-sm font-bold font-mono text-blue-400">{arc.totalPromoted}</div>
                      <div className="text-[9px] text-slate-400">Naik Kelas</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold font-mono text-amber-400">{arc.totalGraduated}</div>
                      <div className="text-[9px] text-slate-400">Siswa Lulus</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold font-mono text-emerald-400">{arc.studentRecordsSummary?.totalPresent || 0}</div>
                      <div className="text-[9px] text-slate-400">Total Hadir</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold font-mono text-sky-400">{arc.totalArchivedRecords}</div>
                      <div className="text-[9px] text-slate-400">Log Presensi</div>
                    </div>
                  </div>

                  {arc.notes && (
                    <p className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80 italic">
                      "{arc.notes}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
