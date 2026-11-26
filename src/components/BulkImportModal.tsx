import React, { useState, useEffect, useRef } from 'react';
import { Student } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { downloadStudentExcelTemplate, downloadStudentCsvTemplate } from '../lib/exportUtils';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  Check, 
  X, 
  FileText, 
  Database,
  GraduationCap,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Layers,
  Plus,
  Trash2,
  Table,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface StudentImportRow {
  id: string;
  name: string;
  nis?: string;
  nisn: string;
  class: string;
  rfidUid: string;
  gender: 'L' | 'P';
  phone?: string;
  isNewClass?: boolean;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  // Input Method Tabs: 'file' (Excel / CSV upload), 'paste' (Ctrl+V from Excel), 'table' (Direct column table input)
  const [activeTab, setActiveTab] = useState<'file' | 'paste' | 'table'>('file');

  const [rows, setRows] = useState<StudentImportRow[]>([]);
  const [pastedText, setPastedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [autoGenerateRfid, setAutoGenerateRfid] = useState<boolean>(true);
  const [autoGenerateNisn, setAutoGenerateNisn] = useState<boolean>(true);
  const [masterClasses, setMasterClasses] = useState<string[]>([]);
  const [selectedBatchClass, setSelectedBatchClass] = useState<string>('');
  const [existingStudents, setExistingStudents] = useState<Student[]>([]);
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize master classes and existing students
  useEffect(() => {
    if (isOpen) {
      const cls = AttendanceStorage.getClasses();
      const currentStds = AttendanceStorage.getStudents();
      setMasterClasses(cls);
      setExistingStudents(currentStds);
      if (cls.length > 0) {
        setSelectedBatchClass(cls[0]);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper: Normalize class name with master classes
  const normalizeClassName = (rawClass: string, availableClasses: string[]): { name: string; isMatched: boolean } => {
    const clean = (rawClass || '').trim().replace(/\s+/g, ' ');
    if (!clean) {
      return {
        name: availableClasses.length > 0 ? availableClasses[0] : 'Kelas Umum',
        isMatched: availableClasses.length > 0
      };
    }

    const matched = availableClasses.find(
      c => c.trim().toLowerCase() === clean.toLowerCase()
    );

    if (matched) {
      return { name: matched, isMatched: true };
    }

    return { name: clean, isMatched: false };
  };

  // Helper: Generate random 10-digit NISN
  const generateRandomNisn = (): string => {
    return `00${Math.floor(10000000 + Math.random() * 90000000)}`;
  };

  // Helper: Generate random RFID UID
  const generateRandomRfid = (): string => {
    return `000${Math.floor(10000000 + Math.random() * 90000000)}`;
  };

  // Smart Column Header Mapper:
  // Detects which column index belongs to which property based on header text
  const detectColumnMapping = (headerRow: string[]) => {
    const mapping = {
      no: -1,
      name: -1,
      nis: -1,
      nisn: -1,
      class: -1,
      rfid: -1,
      gender: -1,
      phone: -1
    };

    headerRow.forEach((col, idx) => {
      const c = (col || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (c === 'no' || c === 'nomor' || c === 'num') {
        mapping.no = idx;
      } else if (c.includes('nama') || c.includes('siswa') || c.includes('student') || c === 'name') {
        mapping.name = idx;
      } else if (c.includes('nisn')) {
        mapping.nisn = idx;
      } else if (c === 'nis' || c.includes('induk')) {
        mapping.nis = idx;
      } else if (c.includes('kelas') || c.includes('rombel') || c.includes('class') || c.includes('tingkat')) {
        mapping.class = idx;
      } else if (c.includes('rfid') || c.includes('uid') || c.includes('kartu') || c.includes('mifare') || c.includes('card')) {
        mapping.rfid = idx;
      } else if (c.includes('kelamin') || c.includes('gender') || c === 'jk' || c === 'lp' || c === 'sex') {
        mapping.gender = idx;
      } else if (c.includes('hp') || c.includes('telepon') || c.includes('phone') || c.includes('wa') || c.includes('whatsapp') || c.includes('kontak')) {
        mapping.phone = idx;
      }
    });

    return mapping;
  };

  // Parse raw matrix of rows (from Excel sheet_to_json or parsed CSV lines)
  const processRawMatrix = (matrix: (string | number)[][], sourceDesc = '') => {
    if (!matrix || matrix.length === 0) {
      setRows([]);
      return;
    }

    const available = masterClasses.length > 0 ? masterClasses : AttendanceStorage.getClasses();
    const fallbackClass = available[0] || 'X MIPA 1';

    // Detect if first row is header
    const firstRowStr = matrix[0].map(cell => (cell ?? '').toString().trim());
    const isFirstRowHeader = firstRowStr.some(cell => {
      const lower = cell.toLowerCase();
      return lower.includes('nama') || lower.includes('kelas') || lower.includes('nisn') || lower.includes('nis') || lower.includes('rfid') || lower === 'no';
    });

    let mapping = {
      no: -1,
      name: -1,
      nis: -1,
      nisn: -1,
      class: -1,
      rfid: -1,
      gender: -1,
      phone: -1
    };

    let startRowIndex = 0;

    if (isFirstRowHeader) {
      mapping = detectColumnMapping(firstRowStr);
      startRowIndex = 1;
    }

    const parsed: StudentImportRow[] = [];

    for (let r = startRowIndex; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      // Check if row is completely blank
      const hasAnyValue = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (!hasAnyValue) continue;

      let name = '';
      let nis = '';
      let nisn = '';
      let rawClass = '';
      let rfidUid = '';
      let genderStr = '';
      let phone = '';

      if (isFirstRowHeader && mapping.name !== -1) {
        // Use detected header mappings
        name = mapping.name !== -1 ? String(row[mapping.name] || '').trim() : '';
        nis = mapping.nis !== -1 ? String(row[mapping.nis] || '').trim() : '';
        nisn = mapping.nisn !== -1 ? String(row[mapping.nisn] || '').trim() : '';
        rawClass = mapping.class !== -1 ? String(row[mapping.class] || '').trim() : '';
        rfidUid = mapping.rfid !== -1 ? String(row[mapping.rfid] || '').trim() : '';
        genderStr = mapping.gender !== -1 ? String(row[mapping.gender] || '').trim() : '';
        phone = mapping.phone !== -1 ? String(row[mapping.phone] || '').trim() : '';
      } else {
        // Positional fallback:
        // Check if column 0 looks like an index number (1, 2, 3...)
        let offset = 0;
        if (/^\d{1,4}$/.test(String(row[0] || '').trim()) && row.length > 2) {
          offset = 1;
        }

        // If template has 8 columns: No, NIS, Nama, NISN, Kelas, RFID, Gender, Phone
        if (row.length >= offset + 7) {
          nis = String(row[offset] || '').trim();
          name = String(row[offset + 1] || '').trim();
          nisn = String(row[offset + 2] || '').trim();
          rawClass = String(row[offset + 3] || '').trim();
          rfidUid = String(row[offset + 4] || '').trim();
          genderStr = String(row[offset + 5] || '').trim();
          phone = String(row[offset + 6] || '').trim();
        } else if (row.length >= offset + 5) {
          name = String(row[offset] || '').trim();
          nisn = String(row[offset + 1] || '').trim();
          rawClass = String(row[offset + 2] || '').trim();
          rfidUid = String(row[offset + 3] || '').trim();
          genderStr = String(row[offset + 4] || '').trim();
          phone = String(row[offset + 5] || '').trim();
        }

        // If nisn column actually contains class-like string, shift values
        if (nisn && (nisn.includes('MIPA') || nisn.includes('IPS') || nisn.includes('X') || nisn.includes('XI') || nisn.includes('XII') || nisn.includes('TKJ') || nisn.includes('RPL'))) {
          rawClass = nisn;
          nisn = '';
        }
      }

      if (!name) continue;

      const resolvedGender: 'L' | 'P' = 
        (genderStr.toUpperCase().startsWith('P') || genderStr.toUpperCase().includes('PEREMPUAN') || genderStr.toUpperCase().includes('WANITA'))
          ? 'P' 
          : 'L';

      const finalNisn = nisn || (autoGenerateNisn ? generateRandomNisn() : '');
      const finalRfid = rfidUid || (autoGenerateRfid ? generateRandomRfid() : '');
      const { name: resolvedClass, isMatched } = normalizeClassName(rawClass || fallbackClass, available);

      parsed.push({
        id: `row-${Date.now()}-${r}-${Math.random().toString(36).substring(2, 6)}`,
        name,
        nis: nis || undefined,
        nisn: finalNisn,
        class: resolvedClass,
        rfidUid: finalRfid,
        gender: resolvedGender,
        phone: phone ? phone.replace(/[^0-9+]/g, '') : '',
        isNewClass: !isMatched
      });
    }

    setRows(parsed);
    if (sourceDesc) setFileName(sourceDesc);
  };

  // Parse Text (supports Tab \t, Semicolon ;, Comma ,)
  const parseRawText = (text: string) => {
    if (!text.trim()) {
      setRows([]);
      return;
    }

    const lines = text.trim().split(/\r?\n/);
    const matrix: string[][] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      let cols: string[] = [];
      if (trimmed.includes('\t')) {
        // Tab separated (copy-paste from Excel / Google Sheets)
        cols = trimmed.split('\t').map(c => c.trim().replace(/^"|"$/g, ''));
      } else if (trimmed.includes(';')) {
        // Semicolon separated (Indonesian Excel CSV)
        cols = trimmed.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      } else {
        // Comma separated
        cols = trimmed.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      }

      matrix.push(cols);
    });

    processRawMatrix(matrix, 'Data Salin & Tempel');
  };

  // Upload Handler: Supports .xlsx, .xls, .csv, .tsv, .txt
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
          // Get matrix of values
          const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, { header: 1 });
          processRawMatrix(matrix, `${file.name} (${matrix.length} baris)`);
        } catch (err) {
          console.error('Error parsing Excel file:', err);
          setStatusMessage({
            type: 'error',
            text: 'Gagal membaca file Excel. Pastikan format file .xlsx valid atau coba gunakan template kami.'
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Text / CSV
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        if (content) {
          setPastedText(content);
          parseRawText(content);
          setFileName(`${file.name}`);
        }
      };
      reader.readAsText(file, 'UTF-8');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Direct Table Row Controls
  const handleAddEmptyRow = () => {
    const fallbackClass = masterClasses[0] || 'X MIPA 1';
    const newRow: StudentImportRow = {
      id: `row-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      nisn: autoGenerateNisn ? generateRandomNisn() : '',
      class: fallbackClass,
      rfidUid: autoGenerateRfid ? generateRandomRfid() : '',
      gender: 'L',
      phone: ''
    };
    setRows(prev => [...prev, newRow]);
  };

  const handleAddMultipleEmptyRows = (count: number) => {
    const fallbackClass = masterClasses[0] || 'X MIPA 1';
    const newItems: StudentImportRow[] = [];
    for (let i = 0; i < count; i++) {
      newItems.push({
        id: `row-manual-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        name: '',
        nisn: autoGenerateNisn ? generateRandomNisn() : '',
        class: fallbackClass,
        rfidUid: autoGenerateRfid ? generateRandomRfid() : '',
        gender: 'L',
        phone: ''
      });
    }
    setRows(prev => [...prev, ...newItems]);
  };

  const handleUpdateRow = (id: string, field: keyof StudentImportRow, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        if (field === 'class') {
          updated.isNewClass = !masterClasses.includes(value);
        }
        return updated;
      }
      return r;
    }));
  };

  const handleDeleteRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleClearAllRows = () => {
    if (rows.length === 0) return;
    setRows([]);
    setPastedText('');
    setFileName('');
    setStatusMessage({ type: 'info', text: 'Semua daftar siswa di pratinjau berhasil dikosongkan.' });
  };

  // Bulk Field Operations
  const handleApplyClassToAll = (targetClass: string) => {
    if (!targetClass) return;
    const isNew = !masterClasses.includes(targetClass);
    setRows(prev => prev.map(r => ({ ...r, class: targetClass, isNewClass: isNew })));
  };

  const handleFillMissingNisn = () => {
    setRows(prev => prev.map(r => ({
      ...r,
      nisn: r.nisn.trim() ? r.nisn : generateRandomNisn()
    })));
  };

  const handleFillMissingRfid = () => {
    setRows(prev => prev.map(r => ({
      ...r,
      rfidUid: r.rfidUid.trim() ? r.rfidUid : generateRandomRfid()
    })));
  };

  // Duplicate Checkers
  const checkDuplicateNisn = (currentId: string, nisn: string): boolean => {
    if (!nisn.trim()) return false;
    const countInBatch = rows.filter(r => r.id !== currentId && r.nisn.trim() === nisn.trim()).length;
    const existsInDb = existingStudents.some(s => s.nisn.trim() === nisn.trim());
    return countInBatch > 0 || existsInDb;
  };

  const checkDuplicateRfid = (currentId: string, rfidUid: string): boolean => {
    if (!rfidUid.trim()) return false;
    const countInBatch = rows.filter(r => r.id !== currentId && r.rfidUid.trim().toUpperCase() === rfidUid.trim().toUpperCase()).length;
    const existsInDb = existingStudents.some(s => s.rfidUid.trim().toUpperCase() === rfidUid.trim().toUpperCase());
    return countInBatch > 0 || existsInDb;
  };

  // Filter rows for view
  const filteredRows = filterClass === 'ALL' 
    ? rows 
    : rows.filter(r => r.class === filterClass);

  // Save to Database
  const handleConfirmImport = async () => {
    const validRows = rows.filter(r => r.name.trim() !== '');

    if (validRows.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Tidak ada data siswa yang memiliki nama lengkap untuk diimpor. Silakan isi minimal satu nama siswa.'
      });
      return;
    }

    const currentStudents = AttendanceStorage.getStudents();
    const newStudentsList = [...currentStudents];
    const newClassesToRegister: string[] = [];

    validRows.forEach((r, idx) => {
      const finalClass = r.class.trim() || masterClasses[0] || 'Kelas Umum';
      if (!masterClasses.includes(finalClass) && !newClassesToRegister.includes(finalClass)) {
        newClassesToRegister.push(finalClass);
      }

      newStudentsList.push({
        id: `std-bulk-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        name: r.name.trim(),
        nis: r.nis?.trim() || undefined,
        nisn: r.nisn.trim() || generateRandomNisn(),
        class: finalClass,
        rfidUid: r.rfidUid.trim() || generateRandomRfid(),
        gender: r.gender,
        phone: r.phone ? r.phone.trim() : undefined
      });
    });

    // Auto-register new classes into Master Data
    if (newClassesToRegister.length > 0) {
      AttendanceStorage.addClasses(newClassesToRegister);
    }

    // Persist all students (syncs to LocalStorage and Cloud Firestore)
    await AttendanceStorage.saveStudents(newStudentsList);

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80">
      <div className="modal-dialog-container max-w-5xl w-full flex flex-col max-h-[94vh] overflow-hidden text-slate-100 shadow-2xl relative">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 shrink-0 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Import Massal & Template Siswa Per Kolom</h3>
              <p className="text-xs text-slate-400">
                Pilih format Excel (.xlsx) atau CSV dengan pemisahan kolom rapi untuk data nama, NISN, kelas, dan RFID.
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

        {/* TEMPLATE DOWNLOAD ACTION BAR */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Unduh Template Siap Pakai (Data Terpisah Antar Kolom):</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Pilih template Excel (.xlsx) agar setiap data otomatis berada di kolom terpisah tanpa perlu konversi teks.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadStudentExcelTemplate(masterClasses)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-xs transition-all cursor-pointer border border-emerald-500/40"
                title="Unduh Template Microsoft Excel (.xlsx) dengan kolom terpisah dan lembar petunjuk"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Template Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => downloadStudentCsvTemplate(masterClasses)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                title="Unduh Template CSV dengan encoding UTF-8 BOM"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Template CSV (.csv)</span>
              </button>
            </div>
          </div>
        </div>

        {/* MASTER CLASSES REFERENCE STRIP */}
        <div className="px-5 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
            <GraduationCap className="w-4 h-4 text-blue-400" />
            <span>Master Data Kelas ({masterClasses.length} Terdaftar):</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {masterClasses.slice(0, 7).map(c => (
              <span key={c} className="px-2 py-0.5 bg-blue-950/60 text-blue-300 border border-blue-800/50 rounded-md text-[10px] font-semibold">
                {c}
              </span>
            ))}
            {masterClasses.length > 7 && (
              <span className="text-[10px] text-slate-400 font-bold">
                +{masterClasses.length - 7} lainnya
              </span>
            )}
          </div>
        </div>

        {/* INPUT METHOD NAVIGATION TABS */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'file'
                ? 'bg-slate-900 border-slate-700 text-white shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span>1. Upload File Excel (.xlsx) / CSV</span>
            {fileName && <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400"></span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'paste'
                ? 'bg-slate-900 border-slate-700 text-white shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>2. Salin & Tempel (Paste) dari Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('table');
              if (rows.length === 0) {
                handleAddMultipleEmptyRows(3);
              }
            }}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'table'
                ? 'bg-slate-900 border-slate-700 text-white shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Table className="w-4 h-4 text-emerald-400" />
            <span>3. Input Langsung di Tabel Per Kolom</span>
            {rows.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-sm font-mono text-[10px] bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-bold">
                {rows.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB PANELS & CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {statusMessage && (
            <div className={`p-3 rounded text-xs flex items-center gap-2 ${
              statusMessage.type === 'error' ? 'bg-rose-950/60 border border-rose-800 text-rose-300' : 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
            }`}>
              {statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* TAB 1: FILE UPLOAD */}
          {activeTab === 'file' && (
            <div className="space-y-4">
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
                    Klik untuk Memilih File atau Tarik (Drop) File ke Sini
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Mendukung format file <strong className="text-emerald-400">Excel (.xlsx, .xls)</strong> dan <strong className="text-slate-300">CSV (.csv, .tsv, .txt)</strong>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Sistem otomatis mengenali dan memetakan kolom Nama, NISN, Kelas, RFID, Gender, dan No HP.
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
                        {rows.length} baris data berhasil diekstrak ke dalam kolom terpisah
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFileName('');
                      setRows([]);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Hapus file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COPY-PASTE */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Tempelkan (Paste) Teks dari Excel / Google Sheets:</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Tip: Cukup blok baris di Excel, tekan Ctrl+C, lalu tekan Ctrl+V di kotak ini
                </span>
              </div>

              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  parseRawText(e.target.value);
                }}
                placeholder={`Contoh data yang di-copy dari Excel (kolom terpisah):\nAhmad Fauzi\t0068492011\t${masterClasses[0] || 'X MIPA 1'}\t0008451293\tL\t081234567890\nSiti Nurhaliza\t0072849102\t${masterClasses[0] || 'X MIPA 1'}\tA34F221C\tP\t081298765432\nBudi Santoso\t0061928475\t${masterClasses[1] || 'X MIPA 2'}\t0009988771\tL\t085611223344`}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed placeholder-slate-600"
              />
            </div>
          )}

          {/* TAB 3: DIRECT TABLE INPUT HEADER TOOLBAR */}
          {activeTab === 'table' && (
            <div className="card-container-compact flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddEmptyRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah 1 Baris</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddMultipleEmptyRows(5)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-xs font-medium border border-slate-700 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah 5 Baris</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-400">
                Isi data langsung per sel kolom di bawah layaknya spreadsheet.
              </div>
            </div>
          )}

          {/* BULK TOOLBAR: AUTO-GENERATE & BATCH CLASS SETTER */}
          {rows.length > 0 && (
            <div className="card-container-compact space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Batch Class Assign */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    Set Kelas Semua Siswa:
                  </span>
                  <select
                    value={selectedBatchClass}
                    onChange={(e) => {
                      setSelectedBatchClass(e.target.value);
                      handleApplyClassToAll(e.target.value);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {masterClasses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Quick Auto-Generators */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFillMissingNisn}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-[11px] font-bold border border-indigo-500/30 transition-all cursor-pointer"
                    title="Isi NISN acak untuk baris yang masih kosong"
                  >
                    <span>Isi NISN Kosong</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFillMissingRfid}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[11px] font-bold border border-amber-500/30 transition-all cursor-pointer"
                    title="Isi RFID acak untuk baris yang masih kosong"
                  >
                    <span>Isi RFID Kosong</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAllRows}
                    className="px-2.5 py-1 text-rose-400 hover:text-white hover:bg-rose-950/60 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                  >
                    Kosongkan Tabel
                  </button>
                </div>
              </div>

              {/* Checkbox auto options */}
              <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-900 text-[11px] text-slate-400">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenerateNisn}
                    onChange={(e) => setAutoGenerateNisn(e.target.checked)}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Auto-generate NISN saat menambah baris baru</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenerateRfid}
                    onChange={(e) => setAutoGenerateRfid(e.target.checked)}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Auto-generate RFID saat menambah baris baru</span>
                </label>
              </div>
            </div>
          )}

          {/* TABLE PREVIEW & COLUMN-BY-COLUMN SPREADSHEET EDITOR */}
          {rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Daftar Siswa Per Kolom ({rows.length} Siswa Siap Diimpor)</span>
                  </h4>
                </div>

                {/* Filter by class */}
                {masterClasses.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-semibold">Tampilkan Kelas:</span>
                    <select
                      value={filterClass}
                      onChange={(e) => setFilterClass(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-bold"
                    >
                      <option value="ALL">Semua Kelas ({rows.length})</option>
                      {masterClasses.map(c => {
                        const count = rows.filter(r => r.class === c).length;
                        return (
                          <option key={c} value={c}>
                            {c} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              {/* STRICT SEPARATE COLUMN TABLE */}
              <div className="table-container-sharp overflow-hidden">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-800/90 text-slate-300 uppercase text-[10px] font-black tracking-wider sticky top-0 z-10 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5 w-10 text-center">No</th>
                        <th className="p-2.5 min-w-[180px]">Nama Lengkap Siswa *</th>
                        <th className="p-2.5 min-w-[130px]">NISN</th>
                        <th className="p-2.5 min-w-[150px]">Kelas</th>
                        <th className="p-2.5 min-w-[130px]">RFID UID MIFARE</th>
                        <th className="p-2.5 w-16 text-center">L/P</th>
                        <th className="p-2.5 min-w-[120px]">No WhatsApp Ortu</th>
                        <th className="p-2.5 w-12 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-medium">
                      {filteredRows.map((row, idx) => {
                        const isDupNisn = checkDuplicateNisn(row.id, row.nisn);
                        const isDupRfid = checkDuplicateRfid(row.id, row.rfidUid);
                        const isClassRegistered = masterClasses.includes(row.class);

                        return (
                          <tr key={row.id} className="hover:bg-slate-900/60 transition-colors">
                            {/* Column 1: No */}
                            <td className="p-2 text-center text-slate-500 font-mono text-[11px]">
                              {idx + 1}
                            </td>

                            {/* Column 2: Nama Siswa */}
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.name}
                                onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                                placeholder="Nama lengkap siswa"
                                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white font-bold focus:outline-none focus:border-blue-500"
                              />
                            </td>

                            {/* Column 3: NISN */}
                            <td className="p-2">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.nisn}
                                  onChange={(e) => handleUpdateRow(row.id, 'nisn', e.target.value)}
                                  placeholder="10 digit NISN"
                                  className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1 text-xs font-mono font-bold focus:outline-none ${
                                    isDupNisn 
                                      ? 'border-rose-500 text-rose-300' 
                                      : 'border-slate-700/80 text-indigo-300 focus:border-indigo-500'
                                  }`}
                                />
                                {isDupNisn && (
                                  <span 
                                    className="absolute right-2 top-1.5 text-rose-400"
                                    title="Peringatan: NISN duplikat dengan siswa lain atau database"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Column 4: Kelas */}
                            <td className="p-2">
                              {masterClasses.length > 0 ? (
                                <div className="space-y-1">
                                  <select
                                    value={row.class}
                                    onChange={(e) => handleUpdateRow(row.id, 'class', e.target.value)}
                                    className={`w-full text-xs font-bold rounded-lg px-2 py-1 border transition-colors cursor-pointer ${
                                      isClassRegistered
                                        ? 'bg-blue-950/60 text-blue-200 border-blue-800/80 focus:border-blue-500'
                                        : 'bg-amber-950/60 text-amber-200 border-amber-700/80 focus:border-amber-500'
                                    }`}
                                  >
                                    {!isClassRegistered && row.class && (
                                      <option value={row.class}>+ {row.class} (Kelas Baru)</option>
                                    )}
                                    {masterClasses.map((cls) => (
                                      <option key={cls} value={cls}>
                                        {cls}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={row.class}
                                  onChange={(e) => handleUpdateRow(row.id, 'class', e.target.value)}
                                  placeholder="Contoh: X MIPA 1"
                                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-blue-300 font-bold focus:outline-none focus:border-blue-500"
                                />
                              )}
                            </td>

                            {/* Column 5: RFID UID */}
                            <td className="p-2">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.rfidUid}
                                  onChange={(e) => handleUpdateRow(row.id, 'rfidUid', e.target.value)}
                                  placeholder="UID Kartu RFID"
                                  className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1 text-xs font-mono font-bold focus:outline-none ${
                                    isDupRfid 
                                      ? 'border-rose-500 text-rose-300' 
                                      : 'border-slate-700/80 text-amber-300 focus:border-amber-500'
                                  }`}
                                />
                                {isDupRfid && (
                                  <span 
                                    className="absolute right-2 top-1.5 text-rose-400"
                                    title="Peringatan: RFID UID duplikat dengan siswa lain atau database"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Column 6: Jenis Kelamin */}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleUpdateRow(row.id, 'gender', row.gender === 'L' ? 'P' : 'L')}
                                className={`w-8 h-7 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                                  row.gender === 'P'
                                    ? 'bg-pink-950/60 text-pink-300 border-pink-700/60'
                                    : 'bg-blue-950/60 text-blue-300 border-blue-700/60'
                                }`}
                                title="Klik untuk beralih Laki-laki / Perempuan"
                              >
                                {row.gender}
                              </button>
                            </td>

                            {/* Column 7: No WhatsApp Ortu */}
                            <td className="p-2">
                              <input
                                type="text"
                                value={row.phone || ''}
                                onChange={(e) => handleUpdateRow(row.id, 'phone', e.target.value)}
                                placeholder="08xxxxxxxxxx"
                                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500"
                              />
                            </td>

                            {/* Column 8: Aksi Hapus */}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Hapus baris siswa ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer Bar: Add Row Action */}
                <div className="p-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={handleAddEmptyRow}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-lg text-xs font-bold border border-slate-700 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Tambah Baris Siswa</span>
                  </button>

                  <span className="text-[11px]">
                    Total <strong className="text-white">{rows.length}</strong> siswa siap diproses ke database
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-slate-950 border border-dashed border-slate-800 rounded p-6 card-container">
              <FileSpreadsheet className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-200">Belum Ada Data Siswa Dimasukkan</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Silakan upload file template Excel (.xlsx), tempel data dari spreadsheet, atau klik tombol di bawah untuk mengisi langsung per kolom.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadStudentExcelTemplate(masterClasses)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('table');
                    handleAddMultipleEmptyRows(5);
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Isi Langsung di Tabel (5 Baris)</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-2xs bg-emerald-400"></span>
            <span>Data akan otomatis tersinkronisasi ke Cloud Firestore & LocalStorage</span>
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
              disabled={rows.filter(r => r.name.trim() !== '').length === 0}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded shadow-xs flex items-center gap-2 cursor-pointer transition-all"
            >
              <Database className="w-4 h-4" />
              <span>Simpan ({rows.filter(r => r.name.trim() !== '').length}) Siswa ke Database</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
