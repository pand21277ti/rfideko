import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-[#070d1e] text-slate-100 flex items-center justify-center p-4">
          <div className="card-container max-w-xl w-full p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {this.props.fallbackTitle || 'Gagal Memuat Komponen'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Terjadi kendala saat memproses data pada tampilan ini. Silakan coba segarkan kembali.
              </p>
              {this.state.error?.message && (
                <p className="text-[11px] font-mono text-rose-300 bg-rose-950/40 p-2 rounded mt-3 border border-rose-900/50 break-words text-left">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-primary-sharp inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Coba Lagi / Segarkan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.clear();
                  } catch {}
                  window.location.reload();
                }}
                className="btn-secondary-sharp inline-flex items-center gap-2"
              >
                <span>Reset Cache & Muat Ulang</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
