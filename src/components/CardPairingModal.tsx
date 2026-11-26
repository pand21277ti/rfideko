import React, { useState, useEffect } from 'react';
import { Student } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { CreditCard, X, Check, Wifi } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface CardPairingModalProps {
  student: Student | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CardPairingModal: React.FC<CardPairingModalProps> = ({
  student,
  onClose,
  onSuccess
}) => {
  const [rfidUid, setRfidUid] = useState<string>('');

  useEffect(() => {
    if (student) {
      setRfidUid(student.rfidUid);
    }
  }, [student]);

  if (!student) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfidUid.trim()) {
      alert('Masukkan UID Kartu RFID!');
      return;
    }

    const cleanUid = rfidUid.trim().toUpperCase();
    const duplicateCheck = AttendanceStorage.isRfidUidTaken(cleanUid, 'student', student.id);
    if (duplicateCheck.taken) {
      alert(`UID Kartu [${cleanUid}] tidak dapat digunakan!\nAlasan: ${duplicateCheck.reason}`);
      return;
    }

    const updatedStudent: Student = {
      ...student,
      rfidUid: cleanUid
    };

    AttendanceStorage.updateStudent(updatedStudent);
    alert(`Berhasil mendaftarkan kartu RFID [${updatedStudent.rfidUid}] untuk ${student.name}!`);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="modal-dialog-container max-w-md w-full p-6 space-y-4 text-center shadow-2xl relative">
        
        <div className="flex justify-end">
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="w-12 h-12 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <CreditCard className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-base font-bold text-white">Pasangkan Kartu RFID Pelajar</h3>
          <p className="text-xs text-slate-400 mt-1">
            Tempelkan kartu RFID baru ke alat pembaca atau ketik UID kartu secara manual.
          </p>
        </div>

        {/* Student Profile Overview */}
        <div className="card-container-compact text-left flex items-center gap-3">
          <UserAvatar
            name={student.name}
            avatarUrl={student.avatarUrl}
            gender={student.gender}
            role="SISWA"
            size="sm"
            shape="passport"
          />
          <div>
            <p className="font-semibold text-white text-xs">{student.name}</p>
            <p className="text-[11px] text-slate-400">{student.class} • NISN: {student.nisn || '-'}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-left">
          
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Kode UID Kartu RFID
            </label>
            <div className="relative">
              <input
                type="text"
                value={rfidUid}
                onChange={(e) => setRfidUid(e.target.value)}
                placeholder="Tempelkan kartu ke reader (e.g. 0008451293)"
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                autoFocus
                required
              />
              <Wifi className="w-4 h-4 text-emerald-400 absolute right-3 top-2.5" />
            </div>
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
              <Check className="w-4 h-4" />
              <span>Simpan Kartu RFID</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
