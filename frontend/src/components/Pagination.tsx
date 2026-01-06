import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  colorTheme?: 'blue' | 'green';
}

const Pagination = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems, 
  itemsPerPage,
  colorTheme = 'blue'
}: PaginationProps) => {
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Logic to show simplified page numbers (e.g., 1 2 3 ... 10)
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  const activeColorClass = colorTheme === 'green' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white';
  const hoverColorClass = colorTheme === 'green' ? 'hover:bg-green-50 text-green-700' : 'hover:bg-blue-50 text-blue-700';

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-4 border-t border-gray-100 gap-4">
      <div className="text-xs text-gray-500 font-medium">
        Menampilkan <span className="font-bold text-gray-900">{startItem}-{endItem}</span> dari <span className="font-bold text-gray-900">{totalItems}</span> data
      </div>

      <div className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`p-2 rounded-lg border border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${hoverColorClass}`}
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map((page, index) => (
          <button
            key={index}
            onClick={() => typeof page === 'number' && onPageChange(page)}
            disabled={page === '...'}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
              page === currentPage 
                ? activeColorClass 
                : page === '...' ? 'text-gray-400 cursor-default' : `text-gray-600 border border-gray-200 ${hoverColorClass}`
            }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`p-2 rounded-lg border border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${hoverColorClass}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;