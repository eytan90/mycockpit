import { useEffect, useState } from 'react'
import type { Project } from '../../../stores/projectStore'
import { useBacklogStore } from '../../../stores/backlogStore'
import type { Task } from '../../../stores/backlogStore'
import StatusChip from '../../../components/StatusChip'
import { api } from '../../../api/client'

interface Props { project: Project }

const STATUS_OPTIONS = ['backlog', 'up-next', 'in-progress', 'done', 'cancelled']

export default function TasksTab({ project: p }: Props) {
  const { tasks, fetch, lastFetched, isLoading, invalidate } = useBacklogStore()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  useEffect(() => {
    if (!lastFetched) fetch()
  }, [lastFetched])

  const projectTasks = tasks.filter(t => {
    if (t.project_ref && t.project_ref.toLowerCase().includes(p.id.toLowerCase())) return true
    if (t.area && p.id.toLowerCase().includes(t.area.toLowerCase())) return true
    if (t.area && p.name.toLowerCase().includes(t.area.toLowerCase())) return true
    return false
  })

  if (isLoading) {
    return <div className="text-sm text-text-muted py-4">Loading tasks…</div>
  }

  if (projectTasks.length === 0) {
    return (
      <div className="text-sm text-text-muted py-4">
        No backlog tasks linked to this project.
        <p className="mt-1 text-xxs">Tag tasks with <code className="bg-bg-elevated px-1 rounded">[project_ref:: {p.id}]</code></p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 max-w-2xl">
        {projectTasks.map((t, i) => (
          <div
            key={i}
            onClick={() => setSelectedTask(t)}
            className="flex items-start gap-3 p-3 bg-bg-surface border border-border-subtle rounded-lg cursor-pointer hover:border-border-default transition-colors active:opacity-80"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary">{t.title}</p>
              {t.notes && <p className="text-xxs text-text-muted mt-0.5">{t.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusChip value={t.status} />
              <span className="text-text-muted opacity-40">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </span>
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <TaskEditModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSaved={() => { invalidate(); setSelectedTask(null) }}
        />
      )}
    </>
  )
}

function TaskEditModal({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle]   = useState(task.title)
  const [status, setStatus] = useState(task.status)
  const [area, setArea]     = useState(task.area || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updates: Record<string, string> = {}
      if (title.trim() !== task.title)          updates.title  = title.trim()
      if (status !== task.status)               updates.status = status
      if (area.trim() !== (task.area || ''))    updates.area   = area.trim()
      if (Object.keys(updates).length > 0) {
        await api.patch(`/backlog/${task.id}`, updates)
      }
      onSaved()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl"
        style={{
          background: '#18181b',
          padding: '20px 20px',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm font-semibold text-white">Edit Task</span>
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-white px-2 py-1">Cancel</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 block mb-1.5">Title</label>
            <input
              className="ios-input w-full"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 block mb-1.5">Status</label>
            <select
              className="ios-input w-full cursor-pointer"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 block mb-1.5">Area / Project</label>
            <input
              className="ios-input w-full"
              value={area}
              onChange={e => setArea(e.target.value)}
              placeholder="e.g. Hulk Box, Testing…"
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
