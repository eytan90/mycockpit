import { useEffect, useState } from 'react'
import { useGoalStore } from '../../stores/goalStore'
import type { Goal } from '../../stores/goalStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../stores/projectStore'
import ProgressBar from '../../components/ProgressBar'
import StatusChip from '../../components/StatusChip'
import { api } from '../../api/client'

const HORIZON_ORDER = ['3-year', '1-year', 'quarterly', 'monthly', 'weekly', 'other']

export default function Planning() {
  const { goals, fetch: fetchGoals, lastFetched: gFetched, invalidate: invalidateGoals } = useGoalStore()
  const { projects, fetch: fetchProjects, lastFetched: pFetched } = useProjectStore()

  useEffect(() => { if (!gFetched) fetchGoals() }, [gFetched])
  useEffect(() => { if (!pFetched) fetchProjects() }, [pFetched])

  const [showAddGoal, setShowAddGoal] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalHorizon, setNewGoalHorizon] = useState('1-year')
  const [saving, setSaving] = useState(false)

  // Group goals by horizon
  const horizons = Array.from(new Set([
    ...HORIZON_ORDER,
    ...goals.map(g => g.horizon || 'other')
  ])).filter(h => goals.some(g => (g.horizon || 'other') === h))

  // Find projects with no linked goal
  const linkedProjectIds = new Set(goals.flatMap(g => g.linked_projects))
  const unlinkedProjects = projects.filter(p =>
    !linkedProjectIds.has(p.id) &&
    p.status !== 'done' &&
    p.status !== 'cancelled'
  )

  async function addGoal() {
    if (!newGoalTitle.trim() || saving) return
    setSaving(true)
    try {
      await api.post('/goals', { title: newGoalTitle.trim(), horizon: newGoalHorizon })
      setNewGoalTitle('')
      setShowAddGoal(false)
      invalidateGoals()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Planning</h1>
        <span className="text-sm text-text-muted">{goals.length} goals · {projects.filter(p => p.status !== 'done').length} active projects</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAddGoal(v => !v)}
          className="text-sm px-3 py-1.5 rounded-lg bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 transition-colors"
        >
          + Goal
        </button>
      </div>

      {/* Add goal form */}
      {showAddGoal && (
        <div className="flex gap-2 flex-wrap p-4 bg-bg-surface border border-border-subtle rounded-lg">
          <input
            autoFocus
            value={newGoalTitle}
            onChange={e => setNewGoalTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') setShowAddGoal(false) }}
            placeholder="Goal title…"
            className="flex-1 min-w-48 bg-bg-elevated text-text-primary text-sm rounded-lg px-3 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-blue/50"
          />
          <select
            value={newGoalHorizon}
            onChange={e => setNewGoalHorizon(e.target.value)}
            className="bg-bg-elevated text-text-primary text-sm rounded-lg px-3 py-1.5 border border-border-subtle focus:outline-none cursor-pointer"
          >
            {['weekly', 'monthly', 'quarterly', '1-year', '3-year'].map(h =>
              <option key={h} value={h}>{h}</option>
            )}
          </select>
          <button
            onClick={addGoal}
            disabled={!newGoalTitle.trim() || saving}
            className="px-4 py-1.5 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 disabled:opacity-40 transition-colors"
          >
            {saving ? '…' : 'Add'}
          </button>
        </div>
      )}

      {/* Goals by horizon */}
      {horizons.map(horizon => {
        const horizonGoals = goals.filter(g => (g.horizon || 'other') === horizon)
        return (
          <div key={horizon} className="space-y-3">
            <div className="text-xxs font-semibold uppercase tracking-widest text-text-muted border-b border-border-subtle pb-1">
              {horizon}
            </div>
            {horizonGoals.map(goal => (
              <GoalCard key={goal.id} goal={goal} projects={projects} />
            ))}
          </div>
        )
      })}

      {/* Unlinked projects */}
      {unlinkedProjects.length > 0 && (
        <div className="space-y-3">
          <div className="text-xxs font-semibold uppercase tracking-widest text-accent-amber border-b border-border-subtle pb-1">
            Projects Without a Goal ({unlinkedProjects.length})
          </div>
          <div className="space-y-2">
            {unlinkedProjects.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-bg-surface border border-accent-amber/20 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">{p.name}</p>
                </div>
                <StatusChip value={p.status} />
                <span className="text-xxs text-accent-amber">No goal linked</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {goals.length === 0 && (
        <div className="py-12 text-center text-sm text-text-muted">
          No goals yet. Add one to start linking projects.
          <p className="text-xxs mt-1">Goals live in <code className="bg-bg-elevated px-1 rounded">00_Dashboard/goals.md</code></p>
        </div>
      )}
    </div>
  )
}

function GoalCard({ goal: g, projects }: { goal: Goal; projects: Project[] }) {
  const linked = projects.filter(p => g.linked_projects.includes(p.id))
  const allDone = linked.length > 0 && linked.every(p => p.status === 'done')
  const hasWarning = g.status !== 'done' && linked.length === 0

  return (
    <div className={`rounded-lg border ${hasWarning ? 'border-accent-amber/30 bg-accent-amber/5' : 'border-border-subtle bg-bg-surface'}`}>
      {/* Goal header */}
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
          g.status === 'done' ? 'bg-accent-green' :
          g.status === 'active' || g.status === 'in-progress' ? 'bg-accent-blue' :
          'bg-border-subtle'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{g.title}</p>
          {g.area && <p className="text-xxs text-text-muted mt-0.5">{g.area}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasWarning && (
            <span className="text-xxs text-accent-amber">No projects linked</span>
          )}
          <StatusChip value={g.status} />
        </div>
      </div>

      {/* Linked projects */}
      {linked.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-border-subtle pt-3 ml-5">
          {linked.map(p => (
            <LinkedProjectRow key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function LinkedProjectRow({ project: p }: { project: Project }) {
  const pct = p.milestones_total > 0
    ? Math.round(p.milestones_done / p.milestones_total * 100)
    : null

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-secondary truncate">{p.name}</p>
      </div>
      {pct !== null && (
        <div className="w-20 shrink-0">
          <ProgressBar value={pct} />
        </div>
      )}
      <StatusChip value={p.status} />
    </div>
  )
}
