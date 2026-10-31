import type { Pagination as PaginationInfo } from '../types';

export default function Pagination({
  pagination,
  onPage,
}: {
  pagination: PaginationInfo;
  onPage: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) return null;
  const { page, totalPages } = pagination;

  return (
    <nav className="pagination" aria-label="Pages">
      <button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages}
      </span>
      <button
        className="button secondary"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
