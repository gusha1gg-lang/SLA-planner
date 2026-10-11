import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 10,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems || 0);

  // Generate page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first, last, current, and ellipsis
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }

      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-surface border-t border-line">
      <div className="text-sm text-slate-600">
        {totalItems && (
          <>
            Показано <span className="font-medium">{startItem}-{endItem}</span> из{' '}
            <span className="font-medium">{totalItems}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-150 ease-standard disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft />
        </button>

        {getPageNumbers().map((page, idx) => {
          if (page === '...') {
            return (
              <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">
                ...
              </span>
            );
          }

          const pageNum = page as number;
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-150 ease-standard ${
                currentPage === pageNum
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-150 ease-standard disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
