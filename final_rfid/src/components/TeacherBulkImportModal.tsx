import React, { useState, useRef } from 'react';
import { Teacher } from '../types';
import { AttendanceStorage } from '../lib/storage';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  Check, 
  X, 
  CreditCard,
  Database,
  Info,
  UserCheck,
  FileText,
  AlertCircle,
  AlertTriangle,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { downloadTeacherCsvTemplate, downloadTeacherExcelTemplate } from '../lib/exportUtils';

interface TeacherBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const TeacherBulkImportModal: React.FC<TeacherBulkImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedTeachers, setParsedTeachers] = useState<Partial<Teacher>[]>([]);
  const [isParsed, setIsParsed] = useState<boolean>(false);
  const [autoGenerateRfid, setAutoGenerateRfid] = useState<boolean>(true);
  const [autoGenerateNip, setAutoGenerateNip] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Helper: Detect column mapping based on header strings
  const detectColumnMapping = (headerRow: string[]) => {
    const mapping = {
      no: -1,
      name: -1,
      nip: -1,
      position: -1,
      rfid: -1,
      gender: -1,
      phone: -1
    };

    headerRow.forEach((col, idx) => {
      const c = (col || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (c === 'no' || c === 'nomor' || c === 'num') {
        mapping.no = idx;
      } else if (c.includes('nama') || c.includes('guru') || c.includes('ptk') || c === 'name') {
        mapping.name = idx;
      } else if (c.includes('nip') || c.includes('nuptk') || c.includes('nik')) {
        mapping.nip = idx;
      } else if (c.includes('jabatan') || c.includes('mapel') || c.includes('posisi') || c.includes('position')) {
        mapping.position = idx;
      } else if (c.includes('rfid') || c.includes('uid') || c.includes('kartu') || c.includes('mifare')) {
        mapping.rfid = idx;
      } else if (c.includes('kelamin') || c.includes('gender') || c === 'jk' || c === 'lp' || c === 'sex') {
        mapping.gender = idx;
      } else if (c.includes('hp') || c.includes('telepon') || c.includes('phone') || c.includes('wa') || c.includes('whatsapp')) {
        mapping.phone = idx;
      }
    });

    return mapping;
  };

  // Process raw 2D array of rows
  const processRawMatrix = (matrix: (string | number)[][], sourceDesc = '') => {
    if (!matrix || matrix.length === 0) {
      setParsedTeachers([]);
      setIsParsed(false);
      return;
    }

    const firstRowStr = matrix[0].map(cell => (cell ?? '').toString().trim());
    const isFirstRowHeader = firstRowStr.some(cell => {
      const lower = cell.toLowerCase();
      return lower.includes('nama') || lower.includes('nip') || lower.includes('jabatan') || lower.includes('rfid') || lower === 'no';
    });

    let mapping = {
      no: -1,
      name: -1,
      nip: -1,
      position: -1,
      rfid: -1,
      gender: -1,
      phone: -1
    };

    let startRowIndex = 0;
    if (isFirstRowHeader) {
      mapping = detectColumnMapping(firstRowStr);
      startRowIndex = 1;
    }

    const previewList: Partial<Teacher>[] = [];

    for (let r = startRowIndex; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      const hasAnyValue = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (!hasAnyValue) continue;

      let name = '';
      let nip = '';
      let position = '';
      let rfidUid = '';
      let genderStr = '';
      let phone = '';

      if (isFirstRowHeader && mapping.name !== -1) {
        name = mapping.name !== -1 ? String(row[mapping.name] || '').trim() : '';
        nip = mapping.nip !== -1 ? String(row[mapping.nip] || '').trim() : '';
        position = mapping.position !== -1 ? String(row[mapping.position] || '').trim() : '';
        rfidUid = mapping.rfid !== -1 ? String(row[mapping.rfid] || '').trim() : '';
        genderStr = mapping.gender !== -1 ? String(row[mapping.gender] || '').trim() : '';
        phone = mapping.phone !== -1 ? String(row[mapping.phone] || '').trim() : '';
      } else {
        // Fallback positional detection: check if col 0 is index number
        let offset = 0;
        if (/^\d{1,4}$/.test(String(row[0] || '').trim()) && row.length > 2) {
          offset = 1;
        }

        name = String(row[offset] || '').trim();
        nip = String(row[offset + 1] || '').trim();
        position = String(row[offset + 2] || '').trim();
        rfidUid = String(row[offset + 3] || '').trim();
        genderStr = String(row[offset + 4] || '').trim();
        phone = String(row[offset + 5] || '').trim();
      }

      if (name) {
        const generatedNip = nip || (autoGenerateNip ? `19${Math.floor(70000000 + Math.random() * 20000000)}` : '');
        const generatedUid = rfidUid || (autoGenerateRfid ? `000${Math.floor(10000000 + Math.random() * 90000000)}` : '');
        const resolvedGender: 'L' | 'P' = 
          (genderStr.toUpperCase().startsWith('P') || genderStr.toUpperCase().includes('PEREMPUAN') || genderStr.toUpperCase().includes('WANITA'))
            ? 'P' 
            : 'L';

        previewList.push({
          name,
          nip: generatedNip,
          position: position || 'Guru Mata Pelajaran',
          rfidUid: generatedUid,
          gender: resolvedGender,
          phone: phone ? phone.replace(/[^0-9+]/g, '') : ''
        });
      }
    }

    setParsedTeachers(previewList);
    setIsParsed(previewList.length > 0);
    if (sourceDesc) setFileName(sourceDesc);
    setStatusMessage(null);
  };

  // Parse Text (supports Semicolon ;, Tab \t, Comma ,)
  const parseRawText = (rawText: string) => {
    if (!rawText.trim()) {
      setParsedTeachers([]);
      setIsParsed(false);
      return;
    }

    const lines = rawText.trim().split(/\r?\n/);
    const matrix: string[][] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      let cols: string[] = [];
      if (trimmed.includes('\t')) {
        cols = trimmed.split('\t').map(c => c.trim().replace(/^"|"$/g, ''));
      } else if (trimmed.includes(';')) {
        cols = trimmed.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      } else {
        cols = trimmed.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      }

      matrix.push(cols);
    });

    processRawMatrix(matrix, 'Data Salin & Tempel');
  };

  // File Upload Handler: Supports .xlsx, .xls, .csv, .tsv, .txt
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name;
    const isExcel = /\.(xlsx|xls)$/i.test(name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, { header: 1 });
          processRawMatrix(matrix, `${file.name} (${matrix.length} baris)`);
        } catch (err) {
          console.error('Error parsing Excel file:', err);
          setStatusMessage({
            type: 'error',
            text: 'Gagal membaca file Excel. Pastikan format file .xlsx/.xls valid atau gunakan template kami.'
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        if (content) {
          setPastedText(content);
          parseRawText(content);
          setFileName(file.name);
        }
      };
      reader.readAsText(file, 'UTF-8');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Save imported teachers to database
  const handleConfirmImport = async () => {
    if (parsedTeachers.length === 0) {
      setStatusMessage({ type: 'error', text: 'Tidak ada data guru yang valid untuk diimpor!' });
      return;
    }

    const currentTeachers = AttendanceStorage.getTeachers();
    const newTeachersList = [...currentTeachers];

    parsedTeachers.forEach((t, idx) => {
      newTeachersList.push({
        id: `tch-bulk-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        name: t.name || 'Guru Baru',
        nip: t.nip || `19${Math.floor(70000000 + Math.random() * 20000000)}`,
        position: t.position || 'Guru Mata Pelajaran',
        rfidUid: t.rfidUid || `000${Math.floor(10000000 + Math.random() * 90000000)}`,
        gender: t.gender || 'L',
        phone: t.phone || ''
      });
    });

    await AttendanceStorage.saveTeachers(newTeachersList);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm">
      <div className="modal-dialog-container max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden text-slate-100 shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 shrink-0 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Import Massal Data Guru & Tenaga Kependidikan</h2>
              <p className="text-xs text-slate-400">Dukungan format Excel (.xlsx) dan CSV dengan pemetaan kolom otomatis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action helper & Template download bar */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Unduh Template Format Rapi (Kolom Terpisah):</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Gunakan template Excel (.xlsx) atau CSV bertanda titik koma (;) agar kolom terbuka rapi tanpa menumpuk di Kolom A.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadTeacherExcelTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-xs transition-all cursor-pointer border border-emerald-500/40"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Template Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={downloadTeacherCsvTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-medium transition-all cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Template CSV (.csv)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab selection */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'file'
                ? 'bg-slate-900 border-slate-700 text-white shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>1. Upload File Excel (.xlsx) / CSV</span>
            {fileName && <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400"></span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'paste'
                ? 'bg-slate-900 border-slate-700 text-white shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>2. Salin & Tempel (Paste) dari Excel</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {statusMessage && (
            <div className={`p-3 rounded text-xs flex items-center gap-2 ${
              statusMessage.type === 'error' ? 'bg-rose-950/60 border border-rose-800 text-rose-300' : 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
            }`}>
              {statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {activeTab === 'file' ? (
            <div className="space-y-3">
              <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-md p-8 flex flex-col items-center justify-center gap-3 bg-slate-950/40 hover:bg-slate-950/80 transition-all cursor-pointer group">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv, .tsv, .txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">
                    Pilih File Excel (.xlsx / .xls) atau CSV (.csv)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Sistem otomatis memetakan kolom Nama Guru, NIP, Jabatan, RFID, Gender, dan No HP.
                  </p>
                </div>
              </label>

              {fileName && (
                <div className="flex items-center justify-between p-3 bg-slate-950 border border-emerald-500/40 rounded">
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    <div>
                      <span className="text-xs font-semibold text-white">{fileName}</span>
                      <p className="text-[11px] text-emerald-300 font-mono">
                        {parsedTeachers.length} data guru berhasil diekstrak
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFileName('');
                      setParsedTeachers([]);
                      setIsParsed(false);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Salin baris data dari Excel lalu tempelkan (Ctrl+V) di sini:
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  parseRawText(e.target.value);
                }}
                placeholder="Drs. H. Bambang Sujarwo, M.Pd; 196805121994031005; Kepala Sekolah; 0008451293; L; 081234567890
Siti Rahmawati, S.Pd; 198207192008012015; Waka Kurikulum; A34F221C; P; 081298765432"
                rows={5}
                className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 resize-y"
              />
            </div>
          )}

          {/* Auto generation toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-md border border-slate-800 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateRfid}
                onChange={(e) => {
                  setAutoGenerateRfid(e.target.checked);
                  if (pastedText) parseRawText(pastedText);
                }}
                className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
              />
              <span className="text-slate-300">Otomatis buat UID RFID jika kolom kosong</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateNip}
                onChange={(e) => {
                  setAutoGenerateNip(e.target.checked);
                  if (pastedText) parseRawText(pastedText);
                }}
                className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
              />
              <span className="text-slate-300">Otomatis buat NIP jika kolom kosong</span>
            </label>
          </div>

          {/* Preview Table */}
          {isParsed && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Pratinjau Data ({parsedTeachers.length} Guru / PTK Terdeteksi)
                </span>
                <span className="text-slate-400 text-[11px]">Kolom terpetakan secara otomatis</span>
              </div>

              <div className="table-container-sharp overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-semibold sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Guru / Gelar</th>
                      <th className="p-2.5">NIP / NUPTK</th>
                      <th className="p-2.5">Jabatan / Mapel</th>
                      <th className="p-2.5">Nomor RFID</th>
                      <th className="p-2.5">L/P</th>
                      <th className="p-2.5">No WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/50 font-mono tabular-nums text-[11px]">
                    {parsedTeachers.map((t, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-2.5 text-slate-500 font-sans">{idx + 1}</td>
                        <td className="p-2.5 text-white font-sans font-medium">{t.name}</td>
                        <td className="p-2.5 text-slate-300">{t.nip}</td>
                        <td className="p-2.5 text-slate-300 font-sans">{t.position}</td>
                        <td className="p-2.5 text-emerald-400 font-mono">{t.rfidUid}</td>
                        <td className="p-2.5 text-slate-300 font-sans font-semibold">{t.gender}</td>
                        <td className="p-2.5 text-slate-400">{t.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            Total <strong className="text-white">{parsedTeachers.length}</strong> guru siap diimpor ke database
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-medium transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={parsedTeachers.length === 0}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded shadow-xs flex items-center gap-2 cursor-pointer transition-all"
            >
              <Database className="w-4 h-4" />
              <span>Simpan ({parsedTeachers.length}) Guru ke Database</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
