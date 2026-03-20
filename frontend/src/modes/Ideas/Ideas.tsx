import { useEffect, useState } from 'react'
import { useIdeaStore } from '../../stores/ideaStore'
import type { Idea } from '../../stores/ideaStore'
import IdeaCard from './IdeaCard'
import SkeletonCard from '../../components/SkeletonCard'
import { useSearchStore } from '../../stores/searchStore'

const COLUMNS: { key: number; label: string; color: string }[] = [
  { key: 10,  label: 'Needs Refinement', color: 'text-text-muted' },
  { key: 30,  label: 'Long-term',        color: 'text-accent-blue' },
  { key: 60,  label: 'Needs Scoping',    color: 'text-accent-amber' },
  { key: 90,  label: 'Ready to Promote', color: 'text-accent-green' },
]

export default function Ideas() {
  const { ideas, fetch, lastFetched, isLoading } = useIdeaStore()
  const { query: globalQuery } = useSearchStore()
  const [areaFilter, setAreaFilter] = useState('all')

  useEffect(() => {
    if (!lastFetched) fetch()
  }, [lastFetched])

  const active = ideas.filter(g => !g.done && !g.graduated)

  const areas = ['all', ...Array.from(new Set(active.map(g => g.area).filter(Boolean) as string[]))]

  // Use global search query from searchStore, fall back to no local search
  const effectiveSearch = globalQuery

  const filtered = active.filter(g => {
    if (effectiveSearch && !g.title.toLowerCase().includes(effectiveSearch.toLowerCase())) return false
    if (areaFilter !== 'all' && g.area !== areaFilter) return false
    return true
  })

  const byMaturity = (mat: number) => filtered.filter(g => g.maturity === mat)

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h1 className="text-lg font-semibold text-text-primary">Ideas</h1>
        <span className="text-sm text-text-muted">{active.length} active</span>
        <div className="flex-1" />
        <select
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
          className="bg-bg-elevated text-text-primary text-sm rounded-lg px-3 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-blue/50 cursor-pointer"
        >
          {areas.map(a => <option key={a} value={a}>{a === 'all' ? 'All areas' : a}</option>)}
        </select>
      </div>

      {/* Kanban board */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 min-h-0 overflow-y-auto pb-4">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            label={col.label}
            color={col.color}
            ideas={byMaturity(col.key)}
            isLoading={isLoading && !lastFetched}
          />
        ))}
      </div>
    </div>
  )
}

function KanbanColumn({ label, color, ideas, isLoading }: {
  label: string
  color: string
  ideas: Idea[]
  isLoading: boolean
}) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2 shrink-0 pb-1 border-b border-border-subtle">
        <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</span>
        <span className="text-xxs text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded-full ml-auto">{ideas.length}</span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
        {isLoading ? (
          <><SkeletonCard /><SkeletonCard /></>
        ) : ideas.length === 0 ? (
          <p className="text-xxs text-text-muted py-3 text-center">No ideas here</p>
        ) : (
          ideas.map(g => <IdeaCard key={g.index} idea={g} />)
        )}
      </div>
    </div>
  )
}
