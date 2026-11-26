import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, KeyRound, AlertTriangle, Eye, EyeOff, Delete, LogIn, Monitor, School, CheckCircle2 } from 'lucide-react';
import { AttendanceStorage } from '../lib/storage';
import { SchoolLogo } from './SchoolLogo';

interface DeviceGatekeeperScreenProps {
  onVerified: () => void;
  onOpenLoginModal: () => void;
  schoolName: string;
}

export const DeviceGatekeeperScreen: React.FC<DeviceGatekeeperScreenProps> = ({
  onVerified,
  onOpenLoginModal,
  schoolName
}) => {
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [todayFormatted, setTodayFormatted] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const now = new Date();
    setTodayFormatted(now.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }));
    // Auto focus the hidden input on load
    inputRef.current?.focus();
  }, []);

  const handleKeyPress = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      if (nextPin.length === 6) {
        submitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setErrorMessage('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage('');
    inputRef.current?.focus();
  };

  const submitPin = (pinToVerify: string) => {
    if (pinToVerify.length !== 6) {
      setErrorMessage('Masukkan 6 digit PIN kunci rahasia perangkat.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');

    setTimeout(() => {
      const result = AttendanceStorage.verifyDevicePin(pinToVerify);
      if (result.success) {
        onVerified();
      } else {
        setErrorMessage(result.message);
        setPin('');
        setIsVerifying(false);
        inputRef.current?.focus();
      }
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      handleKeyPress(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitPin(pin);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans select-none relative overflow-y-auto">
      {/* Background Subtle Grid Texture */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* TOP HEADER */}
      <header className="w-full max-w-xl mx-auto flex items-center justify-between py-2 border-b border-slate-800 text-xs text-slate-400 shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          <SchoolLogo className="w-7 h-7" />
          <span className="font-bold text-white tracking-wide">{schoolName}</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          {todayFormatted}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="my-auto py-6 sm:py-8 w-full max-w-md mx-auto relative z-10">
        <div className="bg-slate-900 border border-slate-700 rounded-md shadow-2xl p-6 sm:p-8 text-center space-y-6">
          
          {/* Security Badge Icon */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-sm bg-[#0a1832] border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Otorisasi Terminal Absensi
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Masukkan 6-digit kunci rahasia untuk memverifikasi bahwa gawai ini adalah terminal presensi resmi sekolah.
            </p>
          </div>

          {/* Hidden Keyboard Input */}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={() => {}}
            onKeyDown={handleKeyDown}
            className="absolute opacity-0 pointer-events-none w-0 h-0"
            autoFocus
          />

          {/* 6-Digit PIN Display Boxes */}
          <div className="space-y-2">
            <div 
              onClick={() => inputRef.current?.focus()}
              className="flex items-center justify-center gap-2.5 sm:gap-3 cursor-pointer py-1"
              title="Klik untuk mengetik PIN"
            >
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const char = pin[index];
                const isCurrent = pin.length === index;
                return (
                  <div
                    key={index}
                    className={`w-11 h-13 sm:w-12 sm:h-14 rounded border flex items-center justify-center text-xl font-mono font-bold transition-all ${
                      char
                        ? 'border-emerald-500 bg-slate-950 text-emerald-400 shadow-sm'
                        : isCurrent
                        ? 'border-blue-400 bg-slate-800/80 ring-2 ring-blue-500/30'
                        : 'border-slate-700 bg-slate-950/60 text-slate-500'
                    }`}
                  >
                    {char ? (showPin ? char : '•') : isCurrent ? <span className="w-1.5 h-5 bg-blue-400 animate-pulse" /> : ''}
                  </div>
                );
              })}
            </div>

            {/* Toggle Show/Hide PIN */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
              <span>{pin.length} / 6 Digit Terisi</span>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPin ? 'Sembunyikan' : 'Tampilkan'}</span>
              </button>
            </div>
          </div>

          {/* Error Message Box */}
          {errorMessage && (
            <div className="p-2.5 rounded bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2 text-left">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="leading-tight">{errorMessage}</span>
            </div>
          )}

          {/* Virtual Keypad for Touch Screen / Kiosk */}
          <div className="grid grid-cols-3 gap-2 pt-1 max-w-xs mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-11 rounded bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 text-base font-bold text-white transition-colors cursor-pointer flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 transition-colors cursor-pointer flex items-center justify-center uppercase tracking-wider"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-11 rounded bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 text-base font-bold text-white transition-colors cursor-pointer flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 text-slate-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Hapus Digit Terakhir"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          {/* Submit Action Button */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isVerifying || pin.length !== 6}
              onClick={() => submitPin(pin)}
              className={`w-full py-2.5 rounded text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                pin.length === 6 && !isVerifying
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              {isVerifying ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Perangkat...</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4" />
                  <span>Verifikasi & Aktifkan Layar Kiosk</span>
                </>
              )}
            </button>

            {/* Emergency Admin Login Option */}
            <button
              type="button"
              onClick={onOpenLoginModal}
              className="w-full py-2 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login Pengelola / Administrator Sekolah</span>
            </button>
          </div>

          {/* Session Validity Notice */}
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
            <p className="flex items-center justify-center gap-1 text-slate-400">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Sesi Otorisasi Harian (Reset Otomatis Pukul 00:00 WIB)</span>
            </p>
            <p className="text-[10px] text-slate-500">
              PIN Default: <span className="font-mono text-slate-400">789012</span> (dapat diubah Super Admin di Pengaturan).
            </p>
          </div>

        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-xl mx-auto py-2 text-center text-[10px] text-slate-500 shrink-0 relative z-10">
        Sistem Absensi RFID Sekolah Terverifikasi • Keamanan Fisik Perangkat Kiosk
      </footer>
    </div>
  );
};
