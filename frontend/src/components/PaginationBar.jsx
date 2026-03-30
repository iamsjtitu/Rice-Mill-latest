import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export default function PaginationBar({ page, totalPages, total, pageSize, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-2 py-2 border-t border-gray-200" data-testid="pagination-bar">
      <span className="text-xs text-gray-500">{from}-{to} of {total?.toLocaleString()}</span>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page <= 1}
          onClick={() => onPageChange(1)} data-testid="page-first"><ChevronsLeft className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page <= 1}
          onClick={() => onPageChange(page - 1)} data-testid="page-prev"><ChevronLeft className="w-3.5 h-3.5" /></Button>
        {pages.map(p => (
          <Button key={p} variant={p === page ? "default" : "ghost"} size="sm"
            className={`h-7 w-7 p-0 text-xs ${p === page ? 'bg-amber-600 text-white hover:bg-amber-700' : ''}`}
            onClick={() => onPageChange(p)} data-testid={`page-${p}`}>{p}</Button>
        ))}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)} data-testid="page-next"><ChevronRight className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)} data-testid="page-last"><ChevronsRight className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}
