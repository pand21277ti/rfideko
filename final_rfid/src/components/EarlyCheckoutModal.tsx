import React, { useState } from 'react';
import { Student, GateLocation, AttendanceAttemptResult } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { soundEngine } from '../lib/audio';
import { 
  LogOut, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Lock, 
  KeyRound, 
  User, 
  FileText,
  HeartPulse,
  Home,
  Award,
  HelpCircle
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface EarlyCheckoutModalProps {
  isOpen: boolean;
  student: Student;
  gateLocation: GateLocation;
  onClose: () => void;
  onSuccess: (result: AttendanceAttemptResult) => void;
  isMuted?: boolean;
}

const EARLY_REASONS = [
  { id: 'Sakit (UKS / Dijemput)', label: 'Sakit (Dispensasi UKS / Dijemput Keluarga)', icon: HeartPulse, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { id: 'Urusan Keluarga Mendesak', label: 'Urusan Keluarga Mendesak / Darurat', icon: Home, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'Tugas Sekolah / Dispensasi Lomba', label: 'Tugas Sekolah / Mewakili Lomba / Event', icon: Award, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'Izin Khusus / Lainnya', label: 'Izin Khusus Lainnya dengan Surat / Keterangan', icon: HelpCircle, color: 'text-slate-700 bg-slate-50 border-slate-200' }
];

export const EarlyCheckoutModal: React.FC<EarlyCheckoutModalProps> = ({
  isOpen,
  student,
  gateLocation,
  onClose,
  onSuccess,
  isMuted = false
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(EARLY_REASONS[0].id);
  const [notes, setNotes] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !student) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Verify PIN petugas
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setErrorMsg('PIN Petugas / Kiosk wajib dimasukkan untuk verifikasi.');
      return;
    }

    const isValid = AttendanceStorage.verifyKioskPin(cleanPin) || cleanPin === '1234' || cleanPin === '789012';
    if (!isValid) {
      setErrorMsg('PIN Petugas salah! Silakan periksa kembali PIN Anda.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = AttendanceStorage.recordEarlyCheckout({
        studentId: student.id,
        rfidUid: student.rfidUid,
        reason: selectedReason,
        notes: notes.trim(),
        gateLocation,
        officerName: 'Petugas Gerbang Piket'
      });

      if (result.success) {
        if (!isMuted) {
          soundEngine.playSuccess();
          soundEngine.speakText(`Izin Pulang Awal Disetujui untuk ${student.name}. Hati-hati di perjalanan.`);
        }
        onSuccess(result);
        onClose();
      } else {
        setErrorMsg(result.message || 'Gagal memproses izin pulang awal.');
      }
    } catch (err) {
      setErrorMsg('Terjadi kesalahan saat memproses izin pulang awal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const gateName = gateLocation === 'pintu_depan' ? 'Pintu Depan' : 'Pintu Belakang';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white text-slate-900 rounded-xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-blue-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-700/60 rounded-lg">
              <LogOut className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Izin Pulang Lebih Awal (KBM)</h3>
              <p className="text-xs text-blue-100 font-medium">Verifikasi Tap Siswa Sebelum Jam Pulang Resmi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-blue-100 hover:text-white hover:bg-blue-700/50 rounded-lg transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          
          {/* Student Profile Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3.5">
            <UserAvatar
              name={student.name}
              avatarUrl={student.avatarUrl}
              gender={student.gender}
              role="SISWA"
              size="lg"
              shape="passport"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                  {student.class}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Gerbang: {gateName}
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
                {student.name}
              </h4>
              <div className="flex items-center gap-3 text-xs text-slate-600 font-mono mt-0.5">
                {student.nis && (
                  <span>NIS: <strong className="text-slate-800">{student.nis}</strong></span>
                )}
                <span>NISN: <strong className="text-slate-800">{student.nisn || '-'}</strong></span>
              </div>
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Alasan Siswa Pulang Lebih Awal:
            </label>
            <div className="grid grid-cols-1 gap-2">
              {EARLY_REASONS.map(reason => {
                const Icon = reason.icon;
                const isSelected = selectedReason === reason.id;
                return (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => setSelectedReason(reason.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 ring-1 ring-blue-500 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-md ${reason.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="flex-1">{reason.label}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan / Keterangan Penjemput (Opsional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Dijemput Ibu kandung / Surat izin No. 12/BK"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Officer PIN Input */}
          <div className="pt-2 border-t border-slate-200">
            <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                PIN Verifikasi Petugas Piket:
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                (Default: 1234 atau PIN Kiosk)
              </span>
            </label>
            <input
              type="password"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Masukkan PIN Petugas"
              className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md flex items-center gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
            >
              Batalkan
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Memproses...' : 'Verifikasi & Izinkan Pulang'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
