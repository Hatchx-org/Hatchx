export default function AdminClubsLoading() {
  return <main className="mx-auto w-full max-w-7xl animate-pulse space-y-5 px-5 py-8 sm:px-6 lg:py-12" aria-busy="true" aria-label="Loading Club management">
    <div className="h-11 w-72 rounded-control bg-card" /><div className="h-5 w-full max-w-xl rounded-control bg-card" />
    <div className="h-16 rounded-control bg-card" /><div className="h-20 rounded-card bg-card" />
    <div className="overflow-hidden rounded-card border border-line bg-card">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-16 border-b border-line last:border-0" />)}</div>
    <span className="sr-only">Loading Clubs…</span>
  </main>;
}
