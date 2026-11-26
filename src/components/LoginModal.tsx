import React, { useState } from 'react';
import { Role, AuthUser } from '../types';
import { SchoolLogo } from './SchoolLogo';
import { User, KeyRound, ShieldCheck, X, Eye, EyeOff } from 'lucide-react';
import { AttendanceStorage } from '../lib/storage';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const authResult = AttendanceStorage.authenticateUser(username, password);

      if (authResult.success && authResult.user) {
        // Record login time in storage & cloud
        AttendanceStorage.recordUserLogin(authResult.user.id);

        onLoginSuccess({
          id: authResult.user.id,
          username: authResult.user.username,
          role: authResult.user.role,
          name: authResult.user.name,
          allowedFeatures: authResult.user.allowedFeatures
        });
        onClose();
      } else {
        setErrorMessage(authResult.message || 'Username atau kata sandi salah.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage('Terjadi kesalahan saat memproses login. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
      <div className="max-w-md w-full bg-[#0b1426] border border-blue-900/40 rounded-md p-6 sm:p-7 space-y-6 relative shadow-2xl shadow-black/80">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-xs bg-slate-900/90 border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Tutup"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-3">
          <div className="bg-white px-3 py-1.5 rounded-xs inline-flex items-center justify-center mx-auto border border-slate-200 shadow-xs">
            <SchoolLogo size="md" variant="full" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Login Petugas / Admin</h2>
            <p className="text-xs text-slate-400 mt-1">
              Masuk untuk mengakses Dashboard Guru Piket atau Panel Super Admin
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-300 text-xs font-semibold text-center leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Masukkan username akun Anda"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#070b14] border border-slate-700/80 rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 font-medium transition-all"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Masukkan kata sandi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#070b14] border border-slate-700/80 rounded-lg pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 font-medium transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-blue-900/30"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isLoading ? 'Memeriksa Kredensial...' : 'Masuk ke Akun'}</span>
          </button>
        </form>

      </div>
    </div>
  );
};
