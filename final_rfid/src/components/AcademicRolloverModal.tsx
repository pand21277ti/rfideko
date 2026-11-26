import React, { useState, useMemo } from 'react';
import { SchoolSchedule, Student } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { 
  GraduationCap, 
  ArrowRight, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Search, 
  Users, 
  Archive, 
  Sparkles, 
  FileSpreadsheet, 
  ChevronRight, 
  Info,
  ShieldAlert
} from 'lucide-react';

interface AcademicRolloverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRolloverSuccess: (resultMessage: string) => void;
  currentSchedule: SchoolSchedule;
  adminName: string;
  onNavigateToStudents?: () => void;
  onNavigateToAlumni?: () => void;
}

export const AcademicRolloverModal: React.FC<AcademicRolloverModalProps> = ({
  isOpen,
  onClose,
  onRolloverSuccess,
  currentSchedule,
  adminName,
  onNavigateToStudents,
  onNavigateToAlumni
}) => {
  const currentAcademicYear = currentSchedule.academicYear || '2026/2027';

  // Calculate default next academic year (e.g. 2026/2027 -> 2027/2028)
  const defaultNextYear = useMemo(() => {
    const parts = currentAcademicYear.split('/');
    if (parts.length === 2) {
      const y1 = parseInt(parts[0], 10);
      const y2 = parseInt(parts[1], 10);
      if (!isNaN(y1) && !isNaN(y2)) {
        return `${y1 + 1}/${y2 + 1}`;
      }
    }
    const currentYear = new Date().getFullYear();
    return `${currentYear}/${currentYear + 1}`;
  }, [currentAcademicYear]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [nextAcademicYearInput, setNextAcademicYearInput] = useState<string>(defaultNextYear);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [confirmCheckbox, setConfirmCheckbox] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rolloverResult, setRolloverResult] = useState<{
    promotedCount: number;
    graduatedCount: number;
    archivedCount: number;
    message: string;
  } | null>(null);

  // Preview filtering
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'PROMOTED_XI' | 'PROMOTED_XII' | 'GRADUATED'>('ALL');
  const [previewSearch, setPreviewSearch] = useState<string>('');

  // Preview data
  const previewData = useMemo(() => {
    if (!isOpen) return null;
    return AttendanceStorage.previewAcademicRollover(nextAcademicYearInput.trim() || defaultNextYear);
  }, [isOpen, nextAcademicYearInput, defaultNextYear]);

  // Filtered promotions for preview table
  const filteredPromotions = useMemo(() => {
    if (!previewData) return [];
    return previewData.promotions.filter(item => {
      // Type filter
      if (previewFilter === 'GRADUATED' && !item.isGraduated) return false;
      if (previewFilter === 'PROMOTED_XI' && (item.isGraduated || !item.newClass.startsWith('XI'))) return false;
      if (previewFilter === 'PROMOTED_XII' && (item.isGraduated || !item.newClass.startsWith('XII'))) return false;

      // Search filter
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase();
        const matchName = item.student.name.toLowerCase().includes(q);
        const matchNisn = item.student.nisn.toLowerCase().includes(q);
        const matchOldClass = item.oldClass.toLowerCase().includes(q);
        const matchNewClass = item.newClass.toLowerCase().includes(q);
        if (!matchName && !matchNisn && !matchOldClass && !matchNewClass) return false;
      }
      return true;
    });
  }, [previewData, previewFilter, previewSearch]);

  if (!isOpen) return null;

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nextAcademicYearInput.trim();
    if (!clean) {
      alert('Tahun ajaran baru wajib diisi!');
      return;
    }
    setStep(2);
  };

  const handleExecuteRollover = async () => {
    if (!confirmCheckbox) {
      alert('Harap centang konfirmasi persetujuan terlebih dahulu!');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await AttendanceStorage.executeAcademicYearRollover({
        nextAcademicYear: nextAcademicYearInput.trim(),
        adminName: adminName || 'Super Administrator',
        notes: customNotes.trim() || undefined
      });

      setIsProcessing(false);
      if (res.success) {
        setRolloverResult({
          promotedCount: res.promotedCount,
          graduatedCount: res.graduatedCount,
          archivedCount: res.archivedCount,
          message: res.message
        });
        setStep(4);
        onRolloverSuccess(res.message);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      setIsProcessing(false);
      alert(`Terjadi kesalahan: ${err.message || 'Gagal mengeksekusi'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#0a1228] border border-blue-900/40 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-blue-900/30 bg-[#070d1e] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Kenaikan Kelas & Tahun Ajaran Baru
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Wizard TA
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Otomatis rombel X → XI, XI → XII, kelulusan Kelas XII, dan pembekuan rekapitulasi.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Tracker */}
        <div className="px-4 py-2.5 bg-[#0e1a38] border-b border-blue-900/30 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
            <div className={`flex items-center gap-1.5 font-bold ${step >= 1 ? 'text-blue-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-xs font-mono flex items-center justify-center text-[11px] ${step === 1 ? 'bg-blue-600 text-white' : step > 1 ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                1
              </span>
              <span className="hidden sm:inline">Tahun Ajaran</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div className={`flex items-center gap-1.5 font-bold ${step >= 2 ? 'text-blue-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-xs font-mono flex items-center justify-center text-[11px] ${step === 2 ? 'bg-blue-600 text-white' : step > 2 ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                2
              </span>
              <span className="hidden sm:inline">Pratinjau Kenaikan</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div className={`flex items-center gap-1.5 font-bold ${step >= 3 ? 'text-blue-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-xs font-mono flex items-center justify-center text-[11px] ${step === 3 ? 'bg-blue-600 text-white' : step > 3 ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                3
              </span>
              <span className="hidden sm:inline">Konfirmasi</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div className={`flex items-center gap-1.5 font-bold ${step === 4 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-xs font-mono flex items-center justify-center text-[11px] ${step === 4 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                4
              </span>
              <span className="hidden sm:inline">Selesai</span>
            </div>
          </div>

          <span className="text-[11px] font-mono text-slate-400 shrink-0">
            TA Aktif: <strong className="text-white">{currentAcademicYear}</strong>
          </span>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* STEP 1: Input Tahun Ajaran Baru */}
          {step === 1 && (
            <form onSubmit={handleNextStep1} className="space-y-5 max-w-xl mx-auto py-2">
              <div className="p-4 rounded-lg bg-[#0e1a38] border border-blue-900/30 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 text-sm font-bold">
                  <Calendar className="w-4 h-4" />
                  <span>Pengaturan Tahun Ajaran Baru</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Menjalankan kenaikan kelas akan memperbarui tingkat kelas seluruh siswa aktif, meluluskan siswa kelas XII ke basis data Alumni, dan membekukan seluruh rekaman absensi tahun ini ke dalam Arsip Akademik.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tahun Ajaran Berjalan Saat Ini
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentAcademicYear}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-md text-sm text-slate-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Tahun Ajaran Baru yang Akan Dimulai <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 2026/2027"
                    value={nextAcademicYearInput}
                    onChange={(e) => setNextAcademicYearInput(e.target.value)}
                    className="input-control-sharp w-full font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Gunakan format <code className="text-blue-300 font-mono">YYYY/YYYY</code> (misal: 2026/2027).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Catatan Tambahan untuk Arsip Tahunan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Evaluasi tahunan dan kelulusan Angkatan ke-15 SMK Ekonomika Depok."
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-[#070d1e] border border-blue-900/30 rounded-md text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary-sharp text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary-sharp text-xs flex items-center gap-2"
                >
                  <span>Lanjut ke Pratinjau Kenaikan</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Pratinjau Kenaikan Kelas & Kelulusan */}
          {step === 2 && previewData && (
            <div className="space-y-4">
              {/* Stat Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-[#0e1a38] border border-blue-900/30">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Naik ke Kelas XI</span>
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-blue-300 mt-1">
                    {previewData.toPromoteXI}
                  </div>
                  <div className="text-[10px] text-slate-400">Dari Kelas X</div>
                </div>

                <div className="p-3 rounded-lg bg-[#0e1a38] border border-blue-900/30">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Naik ke Kelas XII</span>
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-sky-300 mt-1">
                    {previewData.toPromoteXII}
                  </div>
                  <div className="text-[10px] text-slate-400">Dari Kelas XI</div>
                </div>

                <div className="p-3 rounded-lg bg-[#0e1a38] border border-amber-900/30">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Lulus ke Alumni</span>
                    <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                    {previewData.toGraduate}
                  </div>
                  <div className="text-[10px] text-slate-400">Dari Kelas XII</div>
                </div>

                <div className="p-3 rounded-lg bg-[#0e1a38] border border-blue-900/30">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Rekap Absensi Dibekukan</span>
                    <Archive className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                    {previewData.totalRecordsToArchive}
                  </div>
                  <div className="text-[10px] text-slate-400">Rekaman 1 Tahun</div>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('ALL')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'ALL'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Semua ({previewData.promotions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('PROMOTED_XI')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'PROMOTED_XI'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Naik ke XI ({previewData.toPromoteXI})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('PROMOTED_XII')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'PROMOTED_XII'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Naik ke XII ({previewData.toPromoteXII})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('GRADUATED')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      previewFilter === 'GRADUATED'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Lulus XII ({previewData.toGraduate})
                  </button>
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari siswa atau rombel..."
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#070d1e] border border-blue-900/30 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Table Pratinjau Kenaikan */}
              <div className="border border-blue-900/30 rounded-lg overflow-hidden bg-[#070d1e] max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0e1a38] text-slate-300 border-b border-blue-900/30 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 text-center w-12">No</th>
                      <th className="py-2 px-3">NISN</th>
                      <th className="py-2 px-3">Nama Lengkap Siswa</th>
                      <th className="py-2 px-3">Kelas Lama</th>
                      <th className="py-2 px-3 text-center">Aksi / Status</th>
                      <th className="py-2 px-3">Kelas Baru (TA {nextAcademicYearInput})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-900/20 text-slate-200 font-sans">
                    {filteredPromotions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Tidak ada siswa yang sesuai filter pratinjau.
                        </td>
                      </tr>
                    ) : (
                      filteredPromotions.map((item, idx) => (
                        <tr key={item.student.id} className="hover:bg-blue-900/10 transition-colors">
                          <td className="py-2 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono text-slate-400">{item.student.nisn}</td>
                          <td className="py-2 px-3 font-semibold text-white">{item.student.name}</td>
                          <td className="py-2 px-3 text-slate-300 font-mono">{item.oldClass}</td>
                          <td className="py-2 px-3 text-center">
                            {item.isGraduated ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Lulus ke Alumni
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Naik Kelas
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-bold font-mono">
                            {item.isGraduated ? (
                              <span className="text-amber-400">ALUMNI ({item.oldClass})</span>
                            ) : (
                              <span className="text-blue-400">{item.newClass}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Navigation buttons */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-secondary-sharp text-xs"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn-primary-sharp text-xs flex items-center gap-2"
                >
                  <span>Lanjut ke Konfirmasi Eksekusi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Konfirmasi Final & Eksekusi */}
          {step === 3 && previewData && (
            <div className="space-y-4 max-w-xl mx-auto py-2">
              <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-600/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                  <ShieldAlert className="w-5 h-5" />
                  <span>Konfirmasi Tindakan Tingkat Lanjut</span>
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Harap periksa kembali detail di bawah ini sebelum mengeksekusi. Perubahan ini akan langsung disimpan permanen ke database lokal dan Cloud Firestore:
                </p>
                <ul className="text-xs text-amber-300/80 space-y-1 list-disc list-inside pt-1">
                  <li><strong>{previewData.toPromoteXI + previewData.toPromoteXII} Siswa Aktif</strong> dinaikkan kelasnya (X → XI, XI → XII).</li>
                  <li><strong>{previewData.toGraduate} Siswa Kelas XII</strong> dipindahkan ke data <em>Alumni Sekolah</em>.</li>
                  <li><strong>{previewData.totalRecordsToArchive} Log Absensi</strong> dibekukan ke arsip 1 tahun ajaran {currentAcademicYear}.</li>
                  <li>Log absensi harian aktif dibersihkan untuk memulai tahun ajaran baru secara fresh.</li>
                  <li>Tahun Ajaran aktif diubah menjadi <strong>{nextAcademicYearInput}</strong>.</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-[#0e1a38] border border-blue-900/30">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmCheckbox}
                    onChange={(e) => setConfirmCheckbox(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-xs text-slate-200 leading-relaxed select-none">
                    Saya mengonfirmasi bahwa seluruh evaluasi akhir tahun ajaran <strong>{currentAcademicYear}</strong> telah selesai dan menyetujui pelaksanaan kenaikan kelas serta pembekuan arsip untuk tahun ajaran baru <strong>{nextAcademicYearInput}</strong>.
                  </span>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isProcessing}
                  className="btn-secondary-sharp text-xs"
                >
                  Kembali ke Pratinjau
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRollover}
                  disabled={!confirmCheckbox || isProcessing}
                  className={`btn-primary-sharp text-xs flex items-center gap-2 ${
                    !confirmCheckbox || isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sedang Memproses Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Eksekusi Kenaikan Kelas Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Sukses & Navigasi Langkah Selanjutnya */}
          {step === 4 && rolloverResult && (
            <div className="text-center py-6 space-y-5 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-sm bg-[#09172e] text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">
                  Tahun Ajaran Baru Berhasil Dimulai!
                </h4>
                <p className="text-xs text-emerald-300 font-mono">
                  Tahun Ajaran Aktif: {nextAcademicYearInput}
                </p>
                <p className="text-xs text-slate-400 pt-1">
                  {rolloverResult.message}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-lg bg-[#0e1a38] border border-blue-900/30">
                <div>
                  <div className="text-lg font-bold font-mono text-blue-400">{rolloverResult.promotedCount}</div>
                  <div className="text-[10px] text-slate-400">Siswa Naik Kelas</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-amber-400">{rolloverResult.graduatedCount}</div>
                  <div className="text-[10px] text-slate-400">Siswa Lulus (Alumni)</div>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-emerald-400">{rolloverResult.archivedCount}</div>
                  <div className="text-[10px] text-slate-400">Presensi Diarsip</div>
                </div>
              </div>

              <div className="p-3 bg-blue-950/40 rounded border border-blue-800/40 text-left text-xs text-blue-200/90 space-y-1">
                <div className="font-bold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Langkah Selanjutnya:</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Siswa kelas X baru sekarang dapat diinput atau di-import melalui menu <strong>Data Siswa</strong>. Seluruh siswa yang naik kelas tetap dapat melakukan tap kartu RFID dengan rombel baru mereka.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                {onNavigateToStudents && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToStudents();
                    }}
                    className="btn-primary-sharp text-xs w-full sm:w-auto"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Input Siswa Baru (Kelas X)</span>
                  </button>
                )}

                {onNavigateToAlumni && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToAlumni();
                    }}
                    className="btn-secondary-sharp text-xs w-full sm:w-auto"
                  >
                    <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Lihat Data Alumni & Arsip</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold w-full sm:w-auto"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
