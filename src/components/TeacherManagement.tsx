import React, { useState, useMemo, useEffect } from 'react';
import { Teacher } from '../types';
import { AttendanceStorage } from '../lib/storage';
import { TeacherBulkImportModal } from './TeacherBulkImportModal';
import { MifareScannerModal } from './MifareScannerModal';
import { 
  downloadTeacherCsvTemplate, 
  downloadTeacherExcelTemplate, 
  exportTeachersToExcel, 
  exportTeachersToCSV 
} from '../lib/exportUtils';
import { processAndCompressImage } from '../lib/imageUtils';
import { TablePagination } from './TablePagination';
import { UserAvatar } from './UserAvatar';
import {
  UserCheck,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit3,
  CreditCard,
  Download,
  Upload,
  UploadCloud,
  ArrowUpDown,
  CheckSquare,
  Square,
  Sparkles,
  Camera,
  X,
  Phone,
  Briefcase,
  Layers,
  Users,
  GraduationCap,
  Scan
} from 'lucide-react';

interface TeacherManagementProps {
  onOpenCardPairing?: (teacher: Teacher) => void;
  showToast: (msg: string) => void;
  onNavigateTab: (tab: 'students' | 'classes' | 'teachers') => void;
}

export const TeacherManagement: React.FC<TeacherManagementProps> = ({
  onOpenCardPairing,
  showToast,
  onNavigateTab
}) => {
  const [teachers, setTeachers] = useState<Teacher[]>(() => AttendanceStorage.getTeachers());
  const [teacherSearch, setTeacherSearch] = useState<string>('');
  const [teacherGenderFilter, setTeacherGenderFilter] = useState<string>('ALL');
  const [teacherRfidFilter, setTeacherRfidFilter] = useState<string>('ALL');
  const [teacherSortBy, setTeacherSortBy] = useState<string>('name_asc');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);

  // Pagination State
  const [teacherCurrentPage, setTeacherCurrentPage] = useState<number>(1);
  const [teacherPageSize, setTeacherPageSize] = useState<number>(10);

  useEffect(() => {
    setTeacherCurrentPage(1);
  }, [teacherSearch, teacherGenderFilter, teacherRfidFilter, teacherSortBy]);

  // Modals
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState<boolean>(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);
  const [isMifareScannerOpen, setIsMifareScannerOpen] = useState<boolean>(false);

  // Form State
  const [teacherForm, setTeacherForm] = useState<{
    name: string;
    nip: string;
    position: string;
    rfidUid: string;
    gender: 'L' | 'P';
    phone: string;
    avatarUrl: string;
  }>({
    name: '',
    nip: '',
    position: 'Guru Mata Pelajaran',
    rfidUid: '',
    gender: 'L',
    phone: '',
    avatarUrl: ''
  });

  const reloadData = () => {
    setTeachers(AttendanceStorage.getTeachers());
  };

  // Filter and sort teachers
  const filteredAndSortedTeachers = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();

    const filtered = teachers.filter(t => {
      const matchesSearch =
        !query ||
        t.name.toLowerCase().includes(query) ||
        (t.nip && t.nip.toLowerCase().includes(query)) ||
        (t.position && t.position.toLowerCase().includes(query)) ||
        (t.rfidUid && t.rfidUid.toLowerCase().includes(query));

      const matchesGender = teacherGenderFilter === 'ALL' || t.gender === teacherGenderFilter;
      const hasCard = Boolean(t.rfidUid && t.rfidUid.trim() !== '');
      const matchesRfid =
        teacherRfidFilter === 'ALL' ||
        (teacherRfidFilter === 'HAS_CARD' && hasCard) ||
        (teacherRfidFilter === 'NO_CARD' && !hasCard);

      return matchesSearch && matchesGender && matchesRfid;
    });

    return filtered.sort((a, b) => {
      switch (teacherSortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'id');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'id');
        case 'nip_asc':
          return (a.nip || '').localeCompare(b.nip || '', undefined, { numeric: true });
        case 'position_asc':
          return (a.position || '').localeCompare(b.position || '');
        case 'rfid_assigned_first':
          return (b.rfidUid ? 1 : 0) - (a.rfidUid ? 1 : 0);
        case 'rfid_unassigned_first':
          return (a.rfidUid ? 1 : 0) - (b.rfidUid ? 1 : 0);
        default:
          return 0;
      }
    });
  }, [teachers, teacherSearch, teacherGenderFilter, teacherRfidFilter, teacherSortBy]);

  const paginatedTeachers = useMemo(() => {
    const start = (teacherCurrentPage - 1) * teacherPageSize;
    return filteredAndSortedTeachers.slice(start, start + teacherPageSize);
  }, [filteredAndSortedTeachers, teacherCurrentPage, teacherPageSize]);

  // Bulk selection
  const handleToggleSelect = (id: string) => {
    setSelectedTeacherIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedTeacherIds.length === filteredAndSortedTeachers.length && filteredAndSortedTeachers.length > 0) {
      setSelectedTeacherIds([]);
    } else {
      setSelectedTeacherIds(filteredAndSortedTeachers.map(t => t.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedTeacherIds.length === 0) return;
    if (window.confirm(`Hapus massal ${selectedTeacherIds.length} data guru yang dipilih?`)) {
      const updated = AttendanceStorage.bulkDeleteTeachers(selectedTeacherIds);
      setTeachers(updated);
      setSelectedTeacherIds([]);
      showToast(`${selectedTeacherIds.length} data guru berhasil dihapus`);
    }
  };

  // Add / Edit Modal handlers
  const openAddTeacherModal = () => {
    setEditingTeacher(null);
    setTeacherForm({
      name: '',
      nip: `19${Math.floor(70000000 + Math.random() * 20000000)}`,
      position: 'Guru Mata Pelajaran',
      rfidUid: `000${Math.floor(10000000 + Math.random() * 90000000)}`,
      gender: 'L',
      phone: '',
      avatarUrl: ''
    });
    setIsTeacherModalOpen(true);
  };

  const openEditTeacherModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setTeacherForm({
      name: teacher.name,
      nip: teacher.nip || '',
      position: teacher.position || 'Guru Mata Pelajaran',
      rfidUid: teacher.rfidUid || '',
      gender: teacher.gender || 'L',
      phone: teacher.phone || '',
      avatarUrl: teacher.avatarUrl || ''
    });
    setIsTeacherModalOpen(true);
  };

  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.name || !teacherForm.rfidUid) {
      alert('Nama Guru dan Nomor RFID UID wajib diisi!');
      return;
    }

    if (editingTeacher) {
      const updated: Teacher = {
        ...editingTeacher,
        ...teacherForm
      };
      AttendanceStorage.updateTeacher(updated);
      showToast(`Data guru "${updated.name}" berhasil diperbarui`);
    } else {
      const newTeacher: Teacher = {
        id: `tch-${Date.now()}`,
        ...teacherForm
      };
      AttendanceStorage.addTeacher(newTeacher);
      showToast(`Guru baru "${newTeacher.name}" berhasil ditambahkan`);
    }

    setIsTeacherModalOpen(false);
    reloadData();
  };

  const handleDeleteTeacher = (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus data guru "${name}"?`)) {
      AttendanceStorage.deleteTeacher(id);
      reloadData();
      showToast(`Data guru "${name}" berhasil dihapus dari database`);
    }
  };

  // Export Teacher List to Excel
  const handleExportTeacherList = () => {
    if (teachers.length === 0) {
      showToast('Belum ada data guru untuk diekspor');
      return;
    }
    exportTeachersToExcel(teachers, 'SMK EKONOMIKA DEPOK');
    showToast('File Excel master data guru berhasil diunduh');
  };

  // Export Teacher List to CSV
  const handleExportTeacherCsv = () => {
    if (teachers.length === 0) {
      showToast('Belum ada data guru untuk diekspor');
      return;
    }
    exportTeachersToCSV(teachers);
    showToast('File CSV master data guru berhasil diunduh');
  };

  return (
    <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 space-y-6 text-left shadow-lg">

      {/* Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <span>Master Data Guru & Tenaga Kependidikan</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Total <strong className="text-emerald-400 font-mono tabular-nums">{teachers.length}</strong> guru terdaftar. Menampilkan <strong className="text-white font-mono tabular-nums">{filteredAndSortedTeachers.length}</strong> guru sesuai filter.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedTeacherIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded shadow transition-all cursor-pointer border border-rose-500/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus ({selectedTeacherIds.length}) Terpilih</span>
            </button>
          )}

          <button
            onClick={() => setIsMifareScannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs rounded border border-amber-500/30 transition-all cursor-pointer"
            title="Scan & Deteksi Kartu MIFARE Guru / Siswa"
          >
            <Scan className="w-3.5 h-3.5 text-amber-400" />
            <span>Mode MIFARE</span>
          </button>

          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded border border-slate-700 transition-all cursor-pointer"
            title="Import Massal Guru dari Excel (.xlsx) atau CSV"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Import Excel / CSV</span>
          </button>

          <button
            onClick={downloadTeacherExcelTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium text-xs rounded border border-slate-700 transition-all cursor-pointer"
            title="Download Template Format Excel (.xlsx) Kolom Terpisah"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Template Excel</span>
          </button>

          <button
            onClick={handleExportTeacherList}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded shadow transition-all cursor-pointer border border-emerald-500/40"
            title="Ekspor Seluruh Guru ke File Excel (.xlsx) dengan kolom rapi"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Excel</span>
          </button>

          <button
            onClick={handleExportTeacherCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded border border-slate-700 transition-all cursor-pointer"
            title="Ekspor Seluruh Guru ke File CSV (Pemisah Semicolon ; UTF-8 BOM)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={openAddTeacherModal}
            className="btn-primary-sharp flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Guru</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card-container-compact space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Filter className="w-4 h-4 text-emerald-400" />
            <span>Filter & Pencarian Data Guru</span>
          </div>

          {(teacherSearch || teacherGenderFilter !== 'ALL' || teacherRfidFilter !== 'ALL' || teacherSortBy !== 'name_asc') && (
            <button
              onClick={() => {
                setTeacherSearch('');
                setTeacherGenderFilter('ALL');
                setTeacherRfidFilter('ALL');
                setTeacherSortBy('name_asc');
              }}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
              placeholder="Cari Nama, NIP, Jabatan, RFID..."
              className="input-control-sharp pl-9"
            />
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={teacherGenderFilter}
              onChange={(e) => setTeacherGenderFilter(e.target.value)}
              className="input-control-sharp"
            >
              <option value="ALL">Semua Jenis Kelamin (L / P)</option>
              <option value="L">Laki-laki (L)</option>
              <option value="P">Perempuan (P)</option>
            </select>
          </div>

          {/* RFID Status Filter */}
          <div>
            <select
              value={teacherRfidFilter}
              onChange={(e) => setTeacherRfidFilter(e.target.value)}
              className="input-control-sharp"
            >
              <option value="ALL">Status Kartu: Semua</option>
              <option value="HAS_CARD">Sudah Punya Kartu RFID</option>
              <option value="NO_CARD">Belum Terpasang RFID</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={teacherSortBy}
              onChange={(e) => setTeacherSortBy(e.target.value)}
              className="input-control-sharp"
            >
              <option value="name_asc">Urutkan: Nama A - Z</option>
              <option value="name_desc">Urutkan: Nama Z - A</option>
              <option value="nip_asc">Urutkan: NIP Terkecil</option>
              <option value="position_asc">Urutkan: Jabatan / Mapel</option>
              <option value="rfid_assigned_first">Prioritas Kartu Terdaftar</option>
              <option value="rfid_unassigned_first">Prioritas Tanpa Kartu</option>
            </select>
          </div>
        </div>
      </div>

      {/* Teachers Table */}
      <div className="table-container-sharp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="cursor-pointer text-slate-400 hover:text-white"
                  >
                    {selectedTeacherIds.length > 0 && selectedTeacherIds.length === filteredAndSortedTeachers.length ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-3">Foto & Nama Guru / Gelar</th>
                <th className="p-3">NIP / NUPTK</th>
                <th className="p-3">Jabatan / Mapel</th>
                <th className="p-3">Nomor Kartu RFID MIFARE</th>
                <th className="p-3">L/P</th>
                <th className="p-3">Kontak / HP</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {filteredAndSortedTeachers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400 font-medium">
                    Tidak ditemukan data guru yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                paginatedTeachers.map((teacher) => {
                  const isSelected = selectedTeacherIds.includes(teacher.id);
                  const hasRfid = Boolean(teacher.rfidUid && teacher.rfidUid.trim() !== '');

                  return (
                    <tr
                      key={teacher.id}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-slate-800/60' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(teacher.id)}
                          className="cursor-pointer text-slate-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Name & Avatar */}
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={teacher.name}
                            avatarUrl={teacher.avatarUrl}
                            gender={teacher.gender}
                            role="GURU"
                            size="sm"
                            shape="passport"
                          />
                          <div>
                            <p className="font-semibold text-white text-xs">{teacher.name}</p>
                            <span className="text-[11px] text-slate-400 block font-normal">
                              {teacher.position || 'Tenaga Pendidik'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* NIP */}
                      <td className="p-3">
                        <span className="font-mono tabular-nums text-slate-300 font-medium bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                          {teacher.nip || '-'}
                        </span>
                      </td>

                      {/* Jabatan / Mapel */}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                          {(() => {
                            const pos = (teacher.position || 'Guru').trim();
                            const parts = pos.split(/\s*(?:&|\/|\bdan\b)\s*/i).filter(Boolean);
                            if (parts.length > 1) {
                              return parts.map((part, pIdx) => {
                                const isRole = /kepala|waka|wali|staff|tata usaha|tu|pembina|koordinator|direktur/i.test(part);
                                return (
                                  <span
                                    key={pIdx}
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border leading-tight ${
                                      isRole
                                        ? 'bg-slate-800 text-slate-200 border-slate-600'
                                        : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                                    }`}
                                  >
                                    {part}
                                  </span>
                                );
                              });
                            }
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-medium leading-normal">
                                {pos}
                              </span>
                            );
                          })()}
                        </div>
                      </td>

                      {/* RFID UID */}
                      <td className="p-3">
                        {hasRfid ? (
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-mono tabular-nums text-amber-300 font-semibold text-xs bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                              {teacher.rfidUid}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Belum dipasangkan</span>
                        )}
                      </td>

                      {/* Gender */}
                      <td className="p-3 font-semibold">
                        {teacher.gender === 'P' ? (
                          <span className="text-pink-400">P</span>
                        ) : (
                          <span className="text-blue-400">L</span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="p-3 text-slate-300 font-mono tabular-nums text-[11px]">
                        {teacher.phone || '-'}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditTeacherModal(teacher)}
                            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer border border-slate-700"
                            title="Edit Data Guru"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTeacher(teacher.id, teacher.name)}
                            className="p-1.5 text-rose-400 hover:text-white bg-slate-800 hover:bg-rose-700 rounded transition-colors cursor-pointer border border-slate-700"
                            title="Hapus Data Guru"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={teacherCurrentPage}
          totalItems={filteredAndSortedTeachers.length}
          pageSize={teacherPageSize}
          onPageChange={setTeacherCurrentPage}
          onPageSizeChange={setTeacherPageSize}
          itemName="guru"
        />
      </div>

      {/* MODAL: ADD / EDIT TEACHER */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="modal-dialog-container max-w-lg w-full space-y-5 text-left text-slate-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  {editingTeacher ? 'Edit Data Guru / Pegawai' : 'Tambah Data Guru Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsTeacherModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="space-y-4">
              {/* Nama Lengkap & Gelar */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Nama Lengkap beserta Gelar: <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={teacherForm.name}
                  onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                  placeholder="Contoh: Dra. Hj. Siti Aminah, M.Pd"
                  className="input-control-sharp"
                />
              </div>

              {/* NIP & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    NIP / NUPTK / NIK:
                  </label>
                  <input
                    type="text"
                    value={teacherForm.nip}
                    onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })}
                    placeholder="197405121998022001"
                    className="input-control-sharp font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Jenis Kelamin:
                  </label>
                  <select
                    value={teacherForm.gender}
                    onChange={(e) => setTeacherForm({ ...teacherForm, gender: e.target.value as 'L' | 'P' })}
                    className="input-control-sharp"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
              </div>

              {/* Jabatan / Mata Pelajaran */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Jabatan / Tugas / Guru Mapel:
                </label>
                <input
                  type="text"
                  value={teacherForm.position}
                  onChange={(e) => setTeacherForm({ ...teacherForm, position: e.target.value })}
                  placeholder="Contoh: Guru Matematika / Waka Kurikulum"
                  className="input-control-sharp"
                />
              </div>

              {/* Nomor Kartu RFID MIFARE */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Nomor Kartu RFID MIFARE UID: <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const randomUid = `000${Math.floor(10000000 + Math.random() * 90000000)}`;
                      setTeacherForm({ ...teacherForm, rfidUid: randomUid });
                    }}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Acak Nomor UID</span>
                  </button>
                </div>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={teacherForm.rfidUid}
                    onChange={(e) => setTeacherForm({ ...teacherForm, rfidUid: e.target.value })}
                    placeholder="Tempelkan kartu ke reader USB / ketik UID"
                    className="input-control-sharp pl-9 font-mono tabular-nums text-amber-300 font-semibold focus:border-amber-500"
                  />
                </div>
              </div>

              {/* WhatsApp / No HP */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Nomor WhatsApp / HP:
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={teacherForm.phone}
                    onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                    placeholder="081234567890"
                    className="input-control-sharp pl-9 font-mono tabular-nums"
                  />
                </div>
              </div>

              {/* Foto Profil Guru (Input File JPG/PNG & Base64 Database Storage) */}
              <div className="bg-slate-950 p-3 rounded-md border border-slate-800 space-y-3">
                <label className="text-xs font-medium text-slate-300 block">
                  Foto Profil Guru (Pasfoto 3x4):
                </label>

                <div className="flex items-center gap-4">
                  {/* Photo Preview - Pasfoto 3x4 */}
                  <div className="relative group shrink-0">
                    <UserAvatar
                      name={teacherForm.name || 'Guru'}
                      avatarUrl={teacherForm.avatarUrl}
                      gender={teacherForm.gender}
                      role="GURU"
                      size="lg"
                      shape="passport"
                    />
                    {teacherForm.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setTeacherForm({ ...teacherForm, avatarUrl: '' })}
                        className="absolute -top-1.5 -right-1.5 p-1 bg-rose-600 hover:bg-rose-500 text-white rounded shadow transition-colors cursor-pointer"
                        title="Hapus foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Upload Actions */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 shadow-xs cursor-pointer transition-all">
                        <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Upload File Foto (JPG/PNG)</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressedBase64 = await processAndCompressImage(file, 256, 256, 0.82);
                                setTeacherForm(prev => ({ ...prev, avatarUrl: compressedBase64 }));
                                showToast('Foto guru berhasil diunggah dan siap disimpan ke database');
                              } catch (err: any) {
                                alert(err.message || 'Gagal memproses file foto');
                              }
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* URL Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={teacherForm.avatarUrl}
                        onChange={(e) => setTeacherForm({ ...teacherForm, avatarUrl: e.target.value })}
                        className="input-control-sharp text-[11px] py-1.5"
                        placeholder="Atau tempel URL foto lokal/CDN (https://...)"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Avatar Presets */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
                  <span>Format Pasfoto:</span>
                  <span className="font-mono text-slate-300">Rasio 3:4 Resmi</span>
                  <span className="text-slate-600">/</span>
                  <button
                    type="button"
                    onClick={() => setTeacherForm({ ...teacherForm, avatarUrl: '' })}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] cursor-pointer"
                  >
                    Gunakan Monogram Inisial
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="btn-secondary-sharp"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary-sharp"
                >
                  {editingTeacher ? 'Simpan Perubahan' : 'Tambah Guru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      <TeacherBulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          reloadData();
          showToast('Berhasil mengimpor data guru');
        }}
      />

      {/* MIFARE SCANNER RECOGNITION MODAL */}
      <MifareScannerModal
        isOpen={isMifareScannerOpen}
        onClose={() => setIsMifareScannerOpen(false)}
        onStudentUpdated={() => {
          reloadData();
          showToast('Sinkronisasi kartu RFID MIFARE berhasil');
        }}
      />

    </div>
  );
};
