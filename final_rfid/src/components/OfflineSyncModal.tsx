import React, { useState, useEffect } from 'react';
import { AttendanceStorage } from '../lib/storage';
import { OfflineSyncQueueItem, OfflineSyncSummary, AttendanceRecord } from '../types';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Download, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Clock, 
  ShieldCheck, 
  FileSpreadsheet,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Database
} from 'lucide-react';

interface OfflineSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted
}) => {
  const [summary, setSummary] = useState<OfflineSyncSummary>(() => AttendanceStorage.getSyncSummary());
  const [queue, setQueue] = useState<OfflineSyncQueueItem[]>(() => AttendanceStorage.getPendingSyncQueue());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refreshData = () => {
    setSummary(AttendanceStorage.getSyncSummary());
    setQueue(AttendanceStorage.getPendingSyncQueue());
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleSyncEvent = () => {
      refreshData();
    };

    window.addEventListener('online', handleSyncEvent);
    window.addEventListener('offline', handleSyncEvent);

    return () => {
      window.removeEventListener('online', handleSyncEvent);
      window.removeEventListener('offline', handleSyncEvent);
    };
  }, []);

  if (!isOpen) return null;

  const handleForceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setStatusMessage('Sedang menyinkronkan data offline ke database cloud...');

    try {
      const res = await AttendanceStorage.processOfflineSyncQueue();
      refreshData();
      setStatusMessage(res.message);
      if (onSyncCompleted && res.syncedCount > 0) {
        onSyncCompleted();
      }
    } catch (err) {
      setStatusMessage('Gagal menyinkronkan data. Pastikan koneksi internet aktif.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    }
  };

  const handleToggleSimulateOffline = () => {
    const nextVal = !summary.isSimulatedOffline;
    AttendanceStorage.setSimulateOffline(nextVal);
    refreshData();
  };

  const handleDownloadBackupJson = () => {
    AttendanceStorage.exportOfflineBackupJson();
  };

  const handleDownloadQueueCsv = () => {
    AttendanceStorage.exportOfflinePendingCsv();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80">
      <div className="modal-dialog-container max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden text-slate-100 shadow-2xl relative">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 shrink-0 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded flex items-center justify-center border ${
              summary.isOnline 
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' 
                : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
            }`}>
              {summary.isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Manajemen Auto-Save & Sinkronisasi Offline</span>
                {summary.pendingQueueCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/40 text-amber-300 border border-amber-600/40">
                    {summary.pendingQueueCount} Tertunda
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Pencatatan absensi tetap beroperasi normal tanpa internet. Data otomatis tersimpan di perangkat dan diunggah saat online.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* STATUS CARDS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Card 1: Status Koneksi */}
            <div className={`card-container-compact ${
              summary.isOnline 
                ? 'border-emerald-500/30 text-emerald-300' 
                : 'border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>Status Koneksi Database</span>
                {summary.isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
              </div>
              <div className="text-sm font-bold text-white">
                {summary.isOnline ? 'Online (Terhubung)' : 'Mode Offline Mandiri'}
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                {summary.isOnline 
                  ? 'Koneksi Firestore aktif. Log absensi realtime multi-layar berfungsi penuh.' 
                  : 'Internet terputus. Sistem Auto-Save Offline mengamankan setiap tap ke memori lokal.'}
              </p>
            </div>

            {/* Card 2: Antrian Data */}
            <div className="card-container-compact">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
                <span>Antrian Unggah Offline</span>
                <HardDrive className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono tabular-nums">
                {summary.pendingQueueCount} Catatan Menunggu
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Tersimpan aman di penyimpanan lokal perangkat browser. Tidak akan hilang jika halaman dimuat ulang.
              </p>
            </div>

            {/* Card 3: Waktu Sinkronisasi Terakhir */}
            <div className="card-container-compact">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
                <span>Sinkronisasi Terakhir</span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono tabular-nums">
                {summary.lastSyncTime || 'Belum ada'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Pemeriksaan otomatis berjalan setiap 20 detik saat koneksi internet aktif.
              </p>
            </div>

          </div>

          {/* NOTIFICATION MESSAGE */}
          {statusMessage && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{statusMessage}</span>
              </div>
              <button 
                onClick={() => setStatusMessage(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* SIMULATION & CONTROLS TOOLBAR */}
          <div className="card-container-compact flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSimulateOffline}
                className="flex items-center gap-2 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                {summary.isSimulatedOffline ? (
                  <ToggleRight className="w-5 h-5 text-amber-400" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-slate-500" />
                )}
                <span>Simulasi Mode Offline (Untuk Uji Coba)</span>
              </button>
              {summary.isSimulatedOffline && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-600/40 font-mono">
                  Uji Coba Aktif
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={isSyncing || summary.pendingQueueCount === 0 || !summary.isOnline}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadBackupJson}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-xs font-medium border border-slate-700 transition-all cursor-pointer"
                title="Unduh seluruh data absensi dan antrian lokal sebagai cadangan darurat (.json)"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Backup JSON</span>
              </button>

              {summary.pendingQueueCount > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadQueueCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-xs font-medium border border-slate-700 transition-all cursor-pointer"
                  title="Unduh daftar catatan yang dicatat saat offline dalam format CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-300" />
                  <span>Export CSV Antrian</span>
                </button>
              )}
            </div>
          </div>

          {/* TABLE OF PENDING OFFLINE QUEUE ITEMS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Rincian Data yang Tercatat Offline ({queue.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                Otomatis diunggah saat koneksi internet sekolah pulih
              </span>
            </div>

            {queue.length > 0 ? (
              <div className="table-container-sharp overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold tracking-wider sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5 w-10 text-center">No</th>
                        <th className="p-2.5">Waktu Tap</th>
                        <th className="p-2.5">Kategori</th>
                        <th className="p-2.5">Nama & Identitas</th>
                        <th className="p-2.5">Kelas / Jabatan</th>
                        <th className="p-2.5">Status Absensi</th>
                        <th className="p-2.5">Pintu Gate</th>
                        <th className="p-2.5 text-center">Status Sinkron</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {queue.map((item, idx) => {
                        const rec = item.payload as AttendanceRecord;
                        return (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-2.5 text-center text-slate-500 font-mono text-[11px] tabular-nums">{idx + 1}</td>
                            <td className="p-2.5 font-mono text-slate-300 text-[11px] tabular-nums">
                              {rec.timeFormatted || rec.timestamp?.split('T')[1]?.substring(0, 8) || '-'}
                            </td>
                            <td className="p-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-slate-800 text-slate-300 border border-slate-700">
                                {rec.userType === 'TEACHER' ? 'Guru / PTK' : 'Siswa'}
                              </span>
                            </td>
                            <td className="p-2.5 font-semibold text-white">
                              {rec.studentName || rec.teacherName || '-'}
                              <span className="block font-mono text-[10px] text-slate-400 font-normal">
                                {rec.nisn || rec.nip || rec.rfidUid}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-300">
                              {rec.studentClass || rec.teacherPosition || '-'}
                            </td>
                            <td className="p-2.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono ${
                                rec.status === 'TEPAT_WAKTU'
                                  ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-600/40'
                                  : rec.status === 'TERLAMBAT'
                                    ? 'bg-amber-950/40 text-amber-300 border border-amber-600/40'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}>
                                {rec.status || 'HADIR'}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-400 text-[11px]">
                              {rec.gateName || '-'}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/40 text-amber-300 border border-amber-600/40 flex items-center justify-center gap-1 font-mono">
                                <Clock className="w-2.5 h-2.5" />
                                <span>Menunggu</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="card-container-compact text-center py-6 space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h5 className="text-xs font-semibold text-white">Semua Data Telah Tersinkronkan</h5>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Tidak ada catatan absensi yang tertunda. Setiap tap baru akan tersimpan otomatis baik saat jaringan online maupun offline.
                </p>
              </div>
            )}
          </div>

          {/* EDUCATIONAL SECURITY FOOTNOTE */}
          <div className="card-container-compact flex items-start gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-300 font-semibold block mb-0.5">Keamanan Data Tanpa Kuatir Jaringan Putus</strong>
              Sistem absensi SMK Ekonomika menggunakan arsitektur <em>Offline-First</em>. Seluruh mesin pembaca kartu RFID tetap mencatat jam, menit, detik tap, serta menghitung keterlambatan secara mandiri. Saat koneksi internet kembali stabil, data akan diselaraskan ke database pusat tanpa risiko data tertimpa atau hilang.
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-2xs ${summary.isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span>{summary.isOnline ? 'Cloud Firestore Aktif' : 'Penyimpanan Offline Lokal Aktif'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
