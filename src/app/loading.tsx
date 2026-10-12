export default function Loading() {
  return <div className="mx-auto w-full max-w-6xl animate-pulse px-6 py-10" role="status" aria-label="Loading page">
    <div className="h-10 w-2/3 rounded-card bg-cream/10" />
    <div className="mt-6 h-40 rounded-card bg-cream/10" />
  </div>;
}
