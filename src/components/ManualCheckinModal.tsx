import React, { useState } from 'react';
import { Student, GateLocation, AttendanceStatus } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { Sliders, X, CheckCircle2 } from 'lucide-react';

interface ManualCheckinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ManualCheckinModal: React.FC<ManualCheckinModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [type, setType] = useState<'MASUK' | 'PULANG'>('MASUK');
  const [status, setStatus] = useState<'TEPAT_WAKTU' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPHA'>('TEPAT_WAKTU');
  const [gateLocation, setGateLocation] = useState<GateLocation>('pintu_depan');
  const [notes, setNotes] = useState<string>('Kartu Pelajar Ketinggalan di Rumah');

  if (!isOpen) return null;

  const students = AttendanceStorage.getStudents();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      alert('Pilih siswa terlebih dahulu!');
      return;
    }

    const res = AttendanceStorage.createManualAttendance(
      selectedStudentId,
      type,
      status,
      gateLocation,
      notes
    );

    if (res.success) {
      alert(res.message);
      onSuccess();
      onClose();
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="modal-dialog-container max-w-md w-full p-6 space-y-4 shadow-2xl">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Absensi Manual (Ketinggalan Kartu)</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Pilih Siswa</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              required
            >
              <option value="">-- Pilih Siswa --</option>
              {students.map(std => (
                <option key={std.id} value={std.id}>
                  {std.name} ({std.class}) - NISN: {std.nisn || '-'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tipe Absensi</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'MASUK' | 'PULANG')}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="MASUK">Absen MASUK</option>
                <option value="PULANG">Absen PULANG</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Status Absen</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'TEPAT_WAKTU' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPHA')}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="TEPAT_WAKTU">Tepat Waktu</option>
                <option value="TERLAMBAT">Terlambat</option>
                <option value="IZIN">Izin</option>
                <option value="SAKIT">Sakit</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Titik Lokasi Gate</label>
            <select
              value={gateLocation}
              onChange={(e) => setGateLocation(e.target.value as GateLocation)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="pintu_depan">Pintu Depan</option>
              <option value="pintu_belakang">Pintu Belakang</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Alasan / Catatan Guru</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Absensi</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
