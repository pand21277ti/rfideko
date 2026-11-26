import React, { useState, useEffect } from 'react';
import { Role, GateLocation } from '../types';
import { SchoolLogo } from './SchoolLogo';
import { 
  Monitor, 
  UserCheck, 
  ShieldCheck, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  Sliders,
  Lock,
  LogOut,
  Menu,
  X,
  MapPin,
  ChevronRight,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { AttendanceStorage } from '../lib/storage';

interface AuthUser {
  username: string;
  role: Role;
  name: string;
}

interface NavbarProps {
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  currentUser: AuthUser | null;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  selectedGate: GateLocation;
  setSelectedGate: (gate: GateLocation) => void;
  onOpenManualCheckin: () => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  onOpenOfflineModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  setCurrentRole,
  currentUser,
  onOpenLoginModal,
  onLogout,
  selectedGate,
  setSelectedGate,
  onOpenManualCheckin,
  isMuted,
  setIsMuted,
  onOpenOfflineModal
}) => {
  const [time, setTime] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [syncSummary, setSyncSummary] = useState(() => AttendanceStorage.getSyncSummary());

  useEffect(() => {
    const updateSync = () => {
      setSyncSummary(AttendanceStorage.getSyncSummary());
    };
    updateSync();
    window.addEventListener('online', updateSync);
    window.addEventListener('offline', updateSync);
    const interval = setInterval(updateSync, 3000);
    return () => {
      window.removeEventListener('online', updateSync);
      window.removeEventListener('offline', updateSync);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('id-ID', { hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const handleRoleSelect = (role: Role) => {
    setCurrentRole(role);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-700 sticky top-0 z-50 shadow-md w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-2.5 sm:px-4 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-14 py-1.5 gap-1.5 sm:gap-4">
          
          {/* Logo & App Title - Refined Dark Neutral Container */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink">
            <div className="bg-slate-800/80 p-1.5 rounded-lg shrink-0 border border-slate-700/70 shadow-xs flex items-center justify-center">
              <SchoolLogo size="xs" variant="full" />
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <span className="font-bold text-xs sm:text-sm text-slate-100 tracking-tight uppercase leading-tight select-none truncate">
                SMK EKONOMIKA DEPOK
              </span>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 tracking-wide uppercase leading-tight select-none mt-0.5 truncate">
                Smart RFID Terminal
              </span>
            </div>
          </div>

          {/* Desktop Navigation (Center: Streamlined Mode Switcher) */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 shrink-0">
              {currentUser?.role !== 'guru_piket' && (
                <button
                  onClick={() => setCurrentRole('kiosk')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    currentRole === 'kiosk'
                      ? 'bg-slate-800 text-slate-100 shadow-xs border border-slate-700/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                  title="Buka Tampilan Mode Kiosk Tap RFID Pelajar"
                >
                  Mode Kiosk
                </button>
              )}

              {currentUser && (
                <button
                  onClick={() => setCurrentRole(currentUser.role)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    currentRole === currentUser.role
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  {currentUser.role === 'admin' ? 'Panel Admin' : 'Guru Piket'}
                </button>
              )}
            </div>
          </div>

          {/* Action Tools & Auth Button */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            
            {/* Real-time Connection & Offline Auto-Save Badge */}
            <button
              onClick={onOpenOfflineModal}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border shadow-2xs shrink-0 whitespace-nowrap ${
                syncSummary.isOnline && syncSummary.pendingQueueCount === 0
                  ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/50'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-950/60'
              }`}
              title={
                syncSummary.isOnline && syncSummary.pendingQueueCount === 0
                  ? 'Koneksi Cloud Firestore Aktif. Seluruh data tersinkron.'
                  : `Mode Offline / ${syncSummary.pendingQueueCount} Catatan Menunggu Sinkronisasi.`
              }
            >
              <span className={`w-1.5 h-1.5 rounded-xs ${syncSummary.isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="hidden sm:inline">{syncSummary.isOnline ? 'Online Cloud' : 'Auto-Save Offline'}</span>
              {syncSummary.pendingQueueCount > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold font-mono bg-amber-500/30 text-amber-200">
                  {syncSummary.pendingQueueCount}
                </span>
              )}
            </button>

            {/* Manual Checkin Button for Logged in Guru/Admin (Desktop only) */}
            {currentUser && (
              <button
                onClick={onOpenManualCheckin}
                className="hidden lg:flex items-center px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700/80 text-xs font-medium rounded-lg transition-all cursor-pointer"
              >
                Absen Manual
              </button>
            )}

            {/* Audio Mute Toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700/60 cursor-pointer shrink-0"
              title={isMuted ? "Suara Mati" : "Suara Aktif"}
              aria-label="Toggle Audio"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-slate-300" />}
            </button>

            {/* Fullscreen Toggle (Desktop only) */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700/60 hidden sm:block cursor-pointer shrink-0"
              title="Layar Penuh"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* Desktop Auth Section */}
            <div className="hidden md:flex items-center">
              {currentUser ? (
                <div className="flex items-center gap-2.5 pl-3 border-l border-slate-800">
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">{currentUser.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {currentUser.role === 'admin' ? 'Super Admin' : 'Guru Piket'}
                    </span>
                  </div>
                  <button
                    onClick={onLogout}
                    className="px-2.5 py-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 rounded-lg transition-all text-xs font-medium cursor-pointer"
                    title="Keluar dari Akun"
                  >
                    Keluar
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenLoginModal}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-all cursor-pointer"
                >
                  Login
                </button>
              )}
            </div>

            {/* Mobile Bulk Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-700 md:hidden cursor-pointer shrink-0 transition-colors shadow-xs"
              aria-label="Buka Menu Navigasi"
            >
              {isMobileMenuOpen ? (
                <X className="w-4 h-4 text-amber-300" />
              ) : (
                <>
                  <Menu className="w-4 h-4" />
                  <span className="text-[11px] font-bold hidden xs:inline">Menu</span>
                </>
              )}
            </button>

          </div>

        </div>
      </div>

      {/* MOBILE BULK HAMBURGER DRAWER MENU */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-700 shadow-2xl px-3 sm:px-4 py-3 space-y-3 animate-in slide-in-from-top duration-200 max-h-[85vh] overflow-y-auto">
          
          {/* User Status Bar / Login CTA */}
          {currentUser ? (
            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-md border border-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.role === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <UserCheck className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
                  <p className="text-[9px] text-emerald-400 font-bold uppercase truncate">{currentUser.role === 'admin' ? 'Super Admin' : 'Guru Piket'}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  onLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                onOpenLoginModal();
                setIsMobileMenuOpen(false);
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Login Petugas / Admin</span>
            </button>
          )}

          {/* Navigation Links */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Navigasi Utama</p>

            {currentUser?.role !== 'guru_piket' && (
              <button
                onClick={() => handleRoleSelect('kiosk')}
                className={`w-full flex items-center justify-between p-2.5 rounded text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'kiosk'
                    ? 'bg-slate-800 text-emerald-300 border border-slate-600'
                    : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Layar Mode Kiosk (Tap Kartu)</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            )}

            {currentUser?.role === 'admin' && (
              <button
                onClick={() => handleRoleSelect('admin')}
                className={`w-full flex items-center justify-between p-2.5 rounded text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'admin'
                    ? 'bg-slate-800 text-emerald-300 border border-slate-600'
                    : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Panel Super Admin</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            )}

            {currentUser?.role === 'guru_piket' && (
              <button
                onClick={() => handleRoleSelect('guru_piket')}
                className={`w-full flex items-center justify-between p-2.5 rounded text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'guru_piket'
                    ? 'bg-slate-800 text-emerald-300 border border-slate-600'
                    : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Dashboard Guru Piket</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            )}
          </div>

          {/* Gate Selection for Mobile */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Lokasi Pintu Gate RFID</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSelectedGate('pintu_depan');
                  setIsMobileMenuOpen(false);
                }}
                className={`py-2 px-2.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedGate === 'pintu_depan'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-950 text-slate-400 border border-slate-700'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Pintu Depan</span>
              </button>
              <button
                onClick={() => {
                  setSelectedGate('pintu_belakang');
                  setIsMobileMenuOpen(false);
                }}
                className={`py-2 px-2.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedGate === 'pintu_belakang'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-950 text-slate-400 border border-slate-700'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Pintu Belakang</span>
              </button>
            </div>
          </div>

          {/* Quick Tools & Toggles */}
          <div className="pt-2 border-t border-slate-700 space-y-2">
            {currentUser && (
              <button
                onClick={() => {
                  onOpenManualCheckin();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
              >
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Input Absensi Manual</span>
              </button>
            )}

            {/* Offline Auto-Save & Sync Center Button */}
            <button
              onClick={() => {
                onOpenOfflineModal();
                setIsMobileMenuOpen(false);
              }}
              className={`w-full py-2.5 px-3 rounded text-xs font-bold flex items-center justify-between border cursor-pointer transition-colors ${
                syncSummary.isOnline && syncSummary.pendingQueueCount === 0
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {syncSummary.isOnline && syncSummary.pendingQueueCount === 0 ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-400" />
                )}
                <span>
                  {syncSummary.isOnline && syncSummary.pendingQueueCount === 0
                    ? 'Database Cloud: Terhubung'
                    : 'Auto-Save Offline: Aktif'}
                </span>
              </div>
              {syncSummary.pendingQueueCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                  {syncSummary.pendingQueueCount} Pending
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 font-semibold">Tersinkron</span>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="py-2 px-2 bg-slate-950 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{isMuted ? 'Suara: Mati' : 'Suara: Aktif'}</span>
              </button>

              <button
                onClick={toggleFullscreen}
                className="py-2 px-2 bg-slate-950 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                <span>{isFullscreen ? 'Normal' : 'Layar Penuh'}</span>
              </button>
            </div>
          </div>

        </div>
      )}
    </header>
  );
};
