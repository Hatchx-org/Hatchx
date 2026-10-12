import Link from "next/link";

export default function Pagination({
  basePath,
  page,
  total,
  pageSize,
  query = {},
}: {
  basePath: string;
  page: number;
  total: number;
  pageSize: number;
  query?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams({ ...query, page: String(target) });
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="rounded-full border border-line px-4 py-2 font-semibold text-ink">
          ← Previous
        </Link>
      ) : <span />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className="rounded-full border border-line px-4 py-2 font-semibold text-ink">
          Next →
        </Link>
      ) : <span />}
    </nav>
  );
}
