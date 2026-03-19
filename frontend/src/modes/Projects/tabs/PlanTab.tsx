import { useState } from 'react'
import type { Project, Milestone } from '../../../stores/projectStore'
import { api } from '../../../api/client'

interface Props { project: Project; onUpdated: () => void }

export default function PlanTab({ project: p, onUpdated }: Props) {
  const [toggling, setToggling] = useState<number | null>(null)

  async function handleToggle(milestone: Milestone) {
    if (toggling !== null) return
    setToggling(milestone.index)
    try {
      await api.patch(`/projects/${p.id}/milestones/${milestone.index}`, { done: !milestone.done })
      onUpdated()
    } catch (e) {
      console.error(e)
    } finally {
      setToggling(null)
    }
  }

  if (p.milestones.length === 0) {
    return (
      <div className="text-sm text-text-muted py-4">
        No milestones defined yet. Add them to the project file.
      </div>
    )
  }

  const total = p.milestones.length
  const done = p.milestones.filter(m => m.done).length

  return (
    <div className="max-w-2xl">
      {/* Progress summary */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-blue rounded-full transition-all duration-500"
            style={{ width: `${Math.round(done / total * 100)}%` }}
          />
        </div>
        <span className="text-sm text-text-secondary shrink-0">{done}/{total} done</span>
      </div>

      {/* Milestone list */}
      <div className="space-y-2">
        {p.milestones.map(m => (
          <MilestoneRow
            key={m.index}
            milestone={m}
            loading={toggling === m.index}
            onToggle={() => handleToggle(m)}
          />
        ))}
      </div>
    </div>
  )
}

function MilestoneRow({ milestone: m, loading, onToggle }: {
  milestone: Milestone; loading: boolean; onToggle: () => void
}) {
  const isOverdue = m.due && !m.done && new Date(m.due) < new Date()

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      m.done ? 'bg-bg-base border-border-subtle opacity-60' : 'bg-bg-surface border-border-subtle hover:border-accent-blue/20'
    }`}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        disabled={loading}
        className={`mt-0.5 w-4.5 h-4.5 rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-all ${
          m.done
            ? 'bg-accent-green border-accent-green'
            : 'border-border-subtle hover:border-accent-blue'
        } ${loading ? 'opacity-50' : ''}`}
        style={{ width: 18, height: 18 }}
      >
        {m.done && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,6 5,9 10,3"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${m.done ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {m.title}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          {m.owner && <span className="text-xxs text-text-muted">{m.owner}</span>}
          {m.due && (
            <span className={`text-xxs ${isOverdue ? 'text-accent-red font-medium' : 'text-text-muted'}`}>
              {isOverdue ? 'Overdue · ' : ''}{m.due}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      {m.status && m.status !== 'done' && m.status !== 'pending' && (
        <span className="text-xxs text-text-muted shrink-0">{m.status}</span>
      )}
    </div>
  )
}
