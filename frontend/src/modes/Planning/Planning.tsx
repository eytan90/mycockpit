import { useEffect, useState } from 'react'
import { useGoalStore } from '../../stores/goalStore'
import type { Goal } from '../../stores/goalStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../stores/projectStore'
import ProgressBar from '../../components/ProgressBar'
import StatusChip from '../../components/StatusChip'
import { api } from '../../api/client'
import { useToast } from '../../components/Toast'

const HORIZON_ORDER = ['3-year', '1-year', 'quarterly', 'monthly', 'weekly', 'other']

export default function Planning() {
  const toast = useToast()
  const { goals, fetch: fetchGoals, lastFetched: gFetched, invalidate: invalidateGoals } = useGoalStore()
  const { projects, fetch: fetchProjects, lastFetched: pFetched } = useProjectStore()

  useEffect(() => { if (!gFetched) fetchGoals() }, [gFetched])
  useEffect(() => { if (!pFetched) fetchProjects() }, [pFetched])

  const [showAddGoal, setShowAddGoal] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalHorizon, setNewGoalHorizon] = useState('1-year')
  const [newGoalStatus, setNewGoalStatus] = useState('active')
  const [newGoalProjects, setNewGoalProjects] = useState('')
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
      const linked = newGoalProjects.trim()
        ? newGoalProjects.split(',').map(s => s.trim()).filter(Boolean)
        : []
      await api.post('/goals', {
        title: newGoalTitle.trim(),
        horizon: newGoalHorizon,
        status: newGoalStatus,
        linked_projects: linked,
      })
      setNewGoalTitle('')
      setNewGoalProjects('')
      setShowAddGoal(false)
      invalidateGoals()
      toast.success('Goal created')
    } catch (e) {
      toast.error('Failed to create goal')
      console.error(e)
    }
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
          + New Goal
        </button>
      </div>

      {/* Add goal form — bottom sheet style */}
      {showAddGoal && (
        <div className="p-5 bg-bg-surface border border-border-subtle rounded-xl space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-text-primary">New Goal</p>
            <button onClick={() => setShowAddGoal(false)} className="text-text-muted hover:text-text-secondary text-xs">Cancel</button>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 block mb-1.5">Title *</label>
            <input
              autoFocus
              value={newGoalTitle}
              onChange={e => setNewGoalTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') setShowAddGoal(false) }}
              placeholder="Goal title…"
              className="ios-input w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 block mb-1.5">Horizon</label>
              <select
                value={newGoalHorizon}
                onChange={e => setNewGoalHorizon(e.target.value)}
                className="ios-input cursor-pointer"
              >
                {['weekly', 'monthly', 'quarterly', '1-year', '3-year'].map(h =>
                  <option key={h} value={h}>{h}</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 block mb-1.5">Status</label>
              <select
                value={newGoalStatus}
                onChange={e => setNewGoalStatus(e.target.value)}
                className="ios-input cursor-pointer"
              >
                {['active', 'done', 'archived'].map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 block mb-1.5">Linked Projects (comma-separated IDs)</label>
            <input
              value={newGoalProjects}
              onChange={e => setNewGoalProjects(e.target.value)}
              placeholder="project_id_1, project_id_2…"
              className="ios-input w-full"
            />
          </div>
          <button
            onClick={addGoal}
            disabled={!newGoalTitle.trim() || saving}
            className="btn-primary w-full"
          >
            {saving ? 'Creating…' : 'Create Goal'}
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
