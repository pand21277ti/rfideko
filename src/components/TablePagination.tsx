import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight 
} from 'lucide-react';

export interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemName = 'data',
  className = ''
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  // Generate visible page numbers with ellipsis windowing
  const getVisiblePages = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    if (safePage <= 4) {
      pages.push(1, 2, 3, 4, 5, '...', totalPages);
    } else if (safePage >= totalPages - 3) {
      pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages);
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div 
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-900/90 border-t border-slate-700/80 text-xs text-slate-400 ${className}`}
    >
      {/* LEFT: Info & Page Size Selector */}
      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        <span className="font-medium whitespace-nowrap">
          Menampilkan{' '}
          <strong className="text-white font-mono tabular-nums">{startItem}</strong>
          {' – '}
          <strong className="text-white font-mono tabular-nums">{endItem}</strong>
          {' dari '}
          <strong className="text-white font-mono tabular-nums">{totalItems}</strong>
          {' '}{itemName}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-slate-500">Baris:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                onPageSizeChange(newSize);
                onPageChange(1); // Reset to page 1 on page size change
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono font-bold focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / hal
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* RIGHT: Page Navigation Buttons */}
      <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-center sm:justify-end">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage === 1}
          className="p-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          title="Halaman Pertama"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className="p-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          title="Halaman Sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1 mx-1">
          {visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <span 
                  key={`ellipsis-${index}`} 
                  className="px-1.5 py-1 text-slate-500 font-mono text-xs select-none"
                >
                  ...
                </span>
              );
            }

            const pageNum = Number(page);
            const isActive = pageNum === safePage;

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs border border-indigo-500'
                    : 'bg-slate-800/70 border border-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          className="p-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          title="Halaman Berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage === totalPages}
          className="p-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          title="Halaman Terakhir"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
