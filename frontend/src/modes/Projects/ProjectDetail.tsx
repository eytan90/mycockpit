import { useState } from 'react'
import type { Project } from '../../stores/projectStore'
import StatusChip from '../../components/StatusChip'
import ProgressBar from '../../components/ProgressBar'
import SummaryTab from './tabs/SummaryTab'
import PlanTab from './tabs/PlanTab'
import TasksTab from './tabs/TasksTab'
import TeamTab from './tabs/TeamTab'
import GoalsTab from './tabs/GoalsTab'
import { api } from '../../api/client'

interface Props {
  project: Project
  onBack: () => void
  onUpdated: () => void
}

const TABS = ['Summary', 'Plan', 'Tasks', 'Team', 'Goals'] as const
type Tab = typeof TABS[number]

export default function ProjectDetail({ project: p, onBack, onUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Summary')

  const progress = p.calculated_progress ?? p.progress

  return (
    <div className="flex flex-col h-full">
      {/* Mobile back */}
      <div className="md:hidden px-4 pt-3">
        <button onClick={onBack} className="text-sm text-accent-blue">← Projects</button>
      </div>

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border-subtle shrink-0">
        <div className="flex items-start justify-between gap-4 mb-3">
          <InlineField
            label=""
            value={p.name}
            onSave={v => patchProject(p.id, { name: v }, onUpdated)}
            className="text-xl font-semibold text-text-primary leading-tight flex-1 min-w-0"
          />
          <div className="flex items-center gap-2 shrink-0">
            <StatusChip value={p.priority} size="sm" />
            <StatusChip value={p.status} size="sm" />
          </div>
        </div>

        {/* Key metadata row */}
        <div className="flex items-center gap-4 text-sm text-text-secondary mb-4 flex-wrap">
          <InlineField
            label="Owner"
            value={p.owner ?? '—'}
            onSave={v => patchProject(p.id, { owner: v }, onUpdated)}
          />
          <InlineField
            label="Target"
            value={p.target_date ?? 'TBD'}
            onSave={v => patchProject(p.id, { target_date: v }, onUpdated)}
          />
          {p.category && <span className="text-text-muted">{p.category}</span>}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <ProgressBar value={progress} height="h-2" />
          <span className="text-sm font-semibold text-text-primary shrink-0">{progress}%</span>
          {p.milestones_total > 0 && (
            <span className="text-xxs text-text-muted shrink-0">
              {p.milestones_done}/{p.milestones_total} milestones
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-subtle px-6 shrink-0 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent-blue text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab}
            {tab === 'Plan' && p.milestones_total > 0 && (
              <span className="ml-1.5 text-xxs text-text-muted">
                ({p.milestones_done}/{p.milestones_total})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'Summary' && <SummaryTab project={p} onUpdated={onUpdated} />}
        {activeTab === 'Plan'    && <PlanTab project={p} onUpdated={onUpdated} />}
        {activeTab === 'Tasks'   && <TasksTab project={p} />}
        {activeTab === 'Team'    && <TeamTab project={p} />}
        {activeTab === 'Goals'   && <GoalsTab project={p} />}
      </div>
    </div>
  )
}

// ── Inline field editor ────────────────────────────────────────────────────

function InlineField({ label, value, onSave, className }: { label: string; value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {label && <span className="text-text-muted shrink-0">{label}:</span>}
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className={`bg-bg-elevated text-text-primary rounded px-2 py-0.5 border border-accent-blue/50 focus:outline-none flex-1 min-w-0 ${className ?? 'text-sm w-32'}`}
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className={`flex items-center gap-1 hover:text-text-primary group text-left ${className ?? ''}`}
      title="Click to edit"
    >
      {label && <span className="text-text-muted shrink-0">{label}:</span>}
      <span className="group-hover:underline underline-offset-2 decoration-border-subtle">{value}</span>
    </button>
  )
}

async function patchProject(id: string, updates: Record<string, string>, onUpdated: () => void) {
  try {
    await api.patch(`/projects/${id}`, updates)
    onUpdated()
  } catch (e) {
    console.error('patch failed', e)
  }
}
