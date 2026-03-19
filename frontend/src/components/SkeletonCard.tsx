export default function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-card p-5 animate-pulse">
      <div className="h-4 bg-bg-elevated rounded w-2/3 mb-3" />
      <div className="h-3 bg-bg-elevated rounded w-1/2 mb-4" />
      {Array.from({ length: lines - 2 }).map((_, i) => (
        <div key={i} className="h-3 bg-bg-elevated rounded w-full mb-2" />
      ))}
      <div className="h-1.5 bg-bg-elevated rounded-full w-full mt-3" />
    </div>
  )
}
