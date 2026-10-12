export default function HubLoading() {
  return <main className="mx-auto w-full max-w-6xl animate-pulse px-5 py-8" aria-busy="true" aria-label="Loading page">
    <div className="h-9 w-2/5 rounded-control bg-card" />
    <div className="mt-4 h-5 w-3/5 rounded-control bg-card" />
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-44 rounded-card bg-card" />)}</div>
    <span className="sr-only">Loading content…</span>
  </main>;
}
