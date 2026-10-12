export default function AdminLoading() {
  return <main className="mx-auto max-w-6xl animate-pulse space-y-5 px-6 py-8" aria-busy="true" aria-label="Loading administration">
    <div className="h-10 w-64 rounded-control bg-card" /><div className="h-5 w-96 max-w-full rounded-control bg-card" />
    <div className="grid gap-5 md:grid-cols-2"><div className="h-72 rounded-card bg-card" /><div className="h-72 rounded-card bg-card" /></div>
    <span className="sr-only">Loading administration…</span>
  </main>;
}
