import React from 'react';
import { 
  CalendarCheck2, 
  Database, 
  Sparkles, 
  Clock, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  FileText, 
  X, 
  ShieldCheck,
  GraduationCap,
  Briefcase
} from 'lucide-react';
import { DailyAttendanceRecap } from '../types';

interface DayRolloverModalProps {
  isOpen: boolean;
  onClose: () => void;
  previousDate: string;
  newDate: string;
  recap?: DailyAttendanceRecap | null;
  onViewReports?: () => void;
}

export const DayRolloverModal: React.FC<DayRolloverModalProps> = ({
  isOpen,
  onClose,
  previousDate,
  newDate,
  recap,
  onViewReports
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="modal-dialog-container max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden shadow-2xl relative">
        
        {/* Top Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                  <Sparkles className="w-3 h-3" /> Pergantian Hari Otomatis
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1 font-mono">
                  <Database className="w-3 h-3" /> Auto-Saved
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-1">
                Sesi Absensi Baru Telah Dimulai
              </h2>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-200 text-xs">
          
          {/* Status Message Box */}
          <div className="card-container-compact space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Data Absensi Kemarin Tersimpan Aman & Tampilan Hari Ini Direset ke 0</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              Sistem telah mendeteksi pergantian tanggal. Data absensi tanggal <strong className="text-white font-medium">{previousDate}</strong> telah otomatis diarsipkan ke database untuk pembuatan laporan berkala, dan catatan absensi hari ini <strong className="text-emerald-400 font-medium">({newDate})</strong> telah dimulai dari awal secara bersih.
            </p>
          </div>

          {/* Date Transition Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card-container-compact flex flex-col justify-between">
              <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Hari Sebelumnya (Tersimpan / Diarsipkan)
              </div>
              <div className="text-sm font-bold font-mono text-white tracking-wide">
                {previousDate}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-400" />
                Tersimpan di Cloud Database
              </div>
            </div>

            <div className="card-container-compact bg-emerald-950/20 border-emerald-500/30 flex flex-col justify-between">
              <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Hari Ini (Aktif & Reset dari 0)
              </div>
              <div className="text-sm font-bold font-mono text-emerald-300 tracking-wide">
                {newDate}
              </div>
              <div className="text-[11px] text-emerald-400/80 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Siap Melayani Tap Masuk & Pulang
              </div>
            </div>
          </div>

          {/* Recap Summary Stats (If available) */}
          {recap && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>Ringkasan Arsip Tanggal {previousDate}</span>
                <span className="text-emerald-400 font-mono tabular-nums">Total {recap.totalRecordsCount} Log Tap</span>
              </div>

              {/* Student Recap Mini Grid */}
              <div className="card-container-compact space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  <span>Statistik Kehadiran Siswa</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Total Hadir</div>
                    <div className="text-sm font-bold font-mono text-emerald-400 tabular-nums">{recap.studentStats.totalPresentToday}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Tepat Waktu</div>
                    <div className="text-sm font-bold font-mono text-blue-400 tabular-nums">{recap.studentStats.totalOnTime}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Terlambat</div>
                    <div className="text-sm font-bold font-mono text-amber-400 tabular-nums">{recap.studentStats.totalLate}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Alpha / Belum</div>
                    <div className="text-sm font-bold font-mono text-rose-400 tabular-nums">{recap.studentStats.totalAlpha}</div>
                  </div>
                </div>
              </div>

              {/* Teacher Recap Mini Grid */}
              <div className="card-container-compact space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Briefcase className="w-4 h-4 text-slate-300" />
                  <span>Statistik Kehadiran Guru & PTK</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Total Guru Hadir</div>
                    <div className="text-sm font-bold font-mono text-white tabular-nums">{recap.teacherStats.totalPresentToday}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Tepat Waktu</div>
                    <div className="text-sm font-bold font-mono text-emerald-400 tabular-nums">{recap.teacherStats.totalOnTime}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Terlambat</div>
                    <div className="text-sm font-bold font-mono text-amber-400 tabular-nums">{recap.teacherStats.totalLate}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Guarantee Highlights */}
          <div className="p-3 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Jaminan Keamanan Data Absensi:
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400 ml-1">
              <li>Data kemarin tetap tersimpan utuh dan dapat dilihat pada menu Laporan Rekapitulasi & Kedisiplinan.</li>
              <li>Layar Kiosk dan Dashboard Piket bersih dari sisa data kemarin dan siap mencatat kehadiran hari ini.</li>
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          {onViewReports ? (
            <button
              onClick={() => {
                onClose();
                onViewReports();
              }}
              className="px-3.5 py-1.5 rounded text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-300" />
              Buka Laporan Rekap
            </button>
          ) : <div />}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <span>Mengerti & Lanjutkan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
