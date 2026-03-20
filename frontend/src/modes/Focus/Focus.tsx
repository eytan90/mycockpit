import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBacklogStore } from '../../stores/backlogStore'
import { useProjectStore } from '../../stores/projectStore'
import type { Task } from '../../stores/backlogStore'
import StatusChip from '../../components/StatusChip'
import CardMenu from '../../components/CardMenu'
import { useChatContextStore } from '../../stores/chatContextStore'
import { api } from '../../api/client'
import { useToast } from '../../components/Toast'

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonTaskRow() {
  return (
    <div className="flex items-stretch rounded-2xl overflow-hidden animate-pulse" style={{ background: '#1e1e22', border: '1px solid rgba(63,63,70,0.5)' }}>
      <div className="w-[3px] shrink-0 bg-zinc-700" />
      <div className="flex flex-1 items-start gap-3 px-3 py-3">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-3/4 rounded bg-zinc-800" />
          <div className="h-2.5 w-1/2 rounded bg-zinc-800" />
        </div>
        <div className="h-5 w-16 rounded-full bg-zinc-800" />
      </div>
    </div>
  )
}

export default function Focus() {
  const toast = useToast()
  const { tasks, fetch: fetchBacklog, lastFetched: btFetched, invalidate } = useBacklogStore()
  const { projects, fetch: fetchProjects, lastFetched: ptFetched, invalidate: invalidateProjects } = useProjectStore()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [view, setView] = useState<'now' | 'projects'>('now')

  useEffect(() => { if (!btFetched) fetchBacklog() },   [btFetched])
  useEffect(() => { if (!ptFetched) fetchProjects() }, [ptFetched])

  const loading = !btFetched || !ptFetched

  const today = new Date(); today.setHours(0,0,0,0)

  const overdueMilestones = projects.flatMap(p =>
    p.milestones
      .filter(m => !m.done && m.due && new Date(m.due) < today)
      .map(m => ({ ...m, projectName: p.name, projectId: p.id }))
  )
  const inProgress   = tasks.filter(t => ['in-progress','wip','doing'].includes(t.status))
  const highPriority = tasks.filter(t => t.priority === 'high' && !['done','cancelled'].includes(t.status) && !inProgress.find(x => x.id === t.id))
  const backlogTasks = tasks.filter(t => !['done','cancelled'].includes(t.status) && t.priority !== 'high' && !inProgress.find(x => x.id === t.id))
  const totalOpen    = tasks.filter(t => !['done','cancelled'].includes(t.status)).length

  // Smart focus signal
  const focusSignal = getFocusSignal(overdueMilestones.length, inProgress.length, highPriority.length, totalOpen)

  // Projects view: active projects with next milestone and next_action
  const activeProjects = projects
    .filter(p => !['done','cancelled'].includes(p.status))
    .sort((a, b) => {
      const po: Record<string, number> = { high: 0, medium: 1, low: 2 }
      return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
    })

  return (
    <div className="ios-page space-y-5 px-4 pt-6">

      {/* Header + view toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">Focus</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {totalOpen} open
            {overdueMilestones.length > 0 && <span className="text-red-400"> · {overdueMilestones.length} overdue</span>}
            {inProgress.length > 0 && <span style={{ color: 'var(--accent)' }}> · {inProgress.length} active</span>}
          </p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mt-1">
          <ViewBtn label="Now" active={view === 'now'} onClick={() => setView('now')} />
          <ViewBtn label="Projects" active={view === 'projects'} onClick={() => setView('projects')} />
        </div>
      </div>

      {view === 'now' ? (
        <>
          {/* Focus signal banner */}
          {!loading && (
            <div
              className="px-4 py-3.5 rounded-2xl"
              style={{ background: focusSignal.bg, border: `1px solid ${focusSignal.border}` }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: focusSignal.accent }}>{focusSignal.label}</p>
              <p className="text-sm text-white font-medium leading-snug">{focusSignal.message}</p>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <SkeletonTaskRow key={i} />)}
            </div>
          ) : (
            <>
              {/* Overdue milestones */}
              {overdueMilestones.length > 0 && (
                <Section title="Overdue Milestones" accent="#EF4444">
                  {overdueMilestones.map((m, i) => (
                    <OverdueRow key={i} milestone={m} onDone={() => invalidateProjects()} />
                  ))}
                </Section>
              )}

              {/* In progress */}
              {inProgress.length > 0 && (
                <Section title="In Progress" accent="var(--accent)">
                  {inProgress.map((t, i) => <TaskRow key={i} task={t} accent="var(--accent)" onClick={() => setSelectedTask(t)} />)}
                </Section>
              )}

              {/* High priority */}
              {highPriority.length > 0 && (
                <Section title="High Priority" accent="#F59E0B">
                  {highPriority.map((t, i) => <TaskRow key={i} task={t} accent="#F59E0B" onClick={() => setSelectedTask(t)} />)}
                </Section>
              )}

              {/* Up next */}
              {backlogTasks.length > 0 && (
                <Section title="Up Next" accent="#52525B">
                  {backlogTasks.slice(0, 12).map((t, i) => <TaskRow key={i} task={t} accent="#3F3F46" onClick={() => setSelectedTask(t)} />)}
                </Section>
              )}

              {inProgress.length === 0 && highPriority.length === 0 && overdueMilestones.length === 0 && backlogTasks.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-2xl mb-2">✓</p>
                  <p className="text-sm text-zinc-500">Nothing urgent. You're in good shape.</p>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* Projects view */
        <div className="space-y-3">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: '#1e1e22', border: '1px solid rgba(63,63,70,0.5)', height: 80 }} />
            ))
          ) : (
            <>
              {activeProjects.length === 0 && (
                <p className="text-sm text-zinc-500 py-4">No active projects.</p>
              )}
              {activeProjects.map(p => {
                const nextMilestone = p.milestones.find(m => !m.done)
                const projTasks = tasks.filter(t =>
                  !['done','cancelled'].includes(t.status) &&
                  (t.project_ref === p.id || t.project_ref === p.name || t.area === p.name || t.area === p.id)
                )
                const isOverdue = nextMilestone?.due && new Date(nextMilestone.due) < today
                return (
                  <div
                    key={p.id}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: '#1e1e22', border: '1px solid rgba(63,63,70,0.5)' }}
                  >
                    {/* Project header */}
                    <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <PriorityDot priority={p.priority} />
                          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                        </div>
                        {p.next_action && (
                          <p className="text-xs mt-1.5 text-accent-blue leading-snug pl-[18px]">→ {p.next_action}</p>
                        )}
                        {p.blockers && (
                          <p className="text-xs mt-1 text-red-400 leading-snug pl-[18px]">⚠ {p.blockers}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <span className="text-xs text-zinc-500 font-medium">{p.calculated_progress ?? p.progress}%</span>
                        <StatusChip value={p.status} />
                      </div>
                    </div>

                    {/* Next milestone */}
                    {nextMilestone && (
                      <div
                        className="mx-3 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
                        style={{ background: isOverdue ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)' }}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-zinc-600'}`} />
                        <p className={`text-xs flex-1 truncate ${isOverdue ? 'text-red-300' : 'text-zinc-400'}`}>
                          {nextMilestone.title}
                        </p>
                        {nextMilestone.due && (
                          <span className={`text-xs shrink-0 ${isOverdue ? 'text-red-400 font-medium' : 'text-zinc-600'}`}>
                            {nextMilestone.due}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tasks for this project */}
                    {projTasks.length > 0 && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {projTasks.slice(0, 4).map((t, i) => (
                          <div
                            key={i}
                            onClick={() => setSelectedTask(t)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer active:opacity-70"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              ['in-progress','wip','doing'].includes(t.status) ? 'bg-accent' : 'bg-zinc-700'
                            }`} style={['in-progress','wip','doing'].includes(t.status) ? { background: 'var(--accent)' } : {}} />
                            <p className="text-xs text-zinc-300 flex-1 truncate">{t.title}</p>
                            <StatusChip value={t.status} />
                          </div>
                        ))}
                        {projTasks.length > 4 && (
                          <p className="text-xs text-zinc-600 pl-3">+{projTasks.length - 4} more tasks</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {selectedTask && (
        <TaskEditModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSaved={() => { invalidate(); setSelectedTask(null) }}
        />
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFocusSignal(overdueCount: number, inProgressCount: number, highPriorityCount: number, totalOpen: number) {
  if (overdueCount > 0) return {
    label: 'Needs Immediate Attention',
    message: `${overdueCount} overdue milestone${overdueCount > 1 ? 's' : ''} — address these first before anything else.`,
    accent: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.2)',
  }
  if (inProgressCount > 0) return {
    label: 'Stay in Flow',
    message: `${inProgressCount} task${inProgressCount > 1 ? 's' : ''} in progress — focus on finishing before picking up new work.`,
    accent: 'var(--accent)',
    bg: 'rgba(10,132,255,0.06)',
    border: 'rgba(10,132,255,0.15)',
  }
  if (highPriorityCount > 0) return {
    label: 'High Priority Work',
    message: `${highPriorityCount} high-priority task${highPriorityCount > 1 ? 's' : ''} waiting. Pick one and start moving.`,
    accent: '#F59E0B',
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.15)',
  }
  if (totalOpen > 0) return {
    label: 'All Clear',
    message: `${totalOpen} open items, nothing urgent. Good time to advance a project or clear backlog.`,
    accent: '#30D158',
    bg: 'rgba(48,209,88,0.06)',
    border: 'rgba(48,209,88,0.15)',
  }
  return {
    label: 'Clean Slate',
    message: 'No open tasks. You\'re fully caught up.',
    accent: '#30D158',
    bg: 'rgba(48,209,88,0.06)',
    border: 'rgba(48,209,88,0.15)',
  }
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#52525B' }
  return <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[priority] ?? '#52525B' }} />
}

function ViewBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/65'
      }`}
    >
      {label}
    </button>
  )
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function TaskRow({ task: t, accent, onClick, onUpdated }: { task: Task; accent?: string; onClick?: () => void; onUpdated?: () => void }) {
  const { invalidate } = useBacklogStore()
  const { set: setContext } = useChatContextStore()
  const navigate = useNavigate()
  const toast = useToast()

  async function patchTask(updates: Record<string, string>) {
    try {
      await api.patch(`/backlog/${t.id}`, updates)
      toast.success('Status updated')
      invalidate()
      onUpdated?.()
    } catch (e) {
      toast.error('Failed to update task')
      console.error(e)
    }
  }

  function chatAbout() {
    const parts = [
      `Help me with this task: "${t.title}"`,
      `Status: ${t.status}${t.priority ? ` | Priority: ${t.priority}` : ''}`,
      (t.area || t.project_ref) ? `Project/Area: ${t.project_ref || t.area}` : null,
      t.due ? `Due: ${t.due}` : null,
      t.notes ? `Notes: ${t.notes}` : null,
    ].filter(Boolean).join('\n')
    setContext({ type: 'task', label: t.title, message: parts })
    navigate('/chat')
  }

  const menuItems = [
    { label: 'Chat about this…', onClick: chatAbout },
    { label: 'Mark in-progress', onClick: () => patchTask({ status: 'in-progress' }), disabled: t.status === 'in-progress', divider: true },
    { label: 'Mark done',        onClick: () => patchTask({ status: 'done' }),         disabled: t.status === 'done' },
    { label: 'Mark up-next',     onClick: () => patchTask({ status: 'up-next' }),      disabled: t.status === 'up-next' },
    { label: 'Edit…',            onClick: () => onClick?.(),                           divider: true },
    { label: 'Cancel task',      onClick: () => patchTask({ status: 'cancelled' }),    danger: true, divider: true },
  ]

  return (
    <div
      className="flex items-stretch rounded-2xl overflow-hidden transition-all duration-200 active:scale-[0.99] group"
      style={{ background: '#1e1e22', border: '1px solid rgba(63,63,70,0.5)' }}
    >
      {accent && <div className="w-[3px] shrink-0" style={{ background: accent }} />}
      <div className="flex flex-1 items-start gap-3 px-3 py-3 cursor-pointer" onClick={onClick}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-snug">{t.title}</p>
          {(t.area || t.project_ref) && (
            <p className="text-[11px] mt-1 font-medium text-zinc-600">{t.project_ref || t.area}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {t.due && (
            <span className={`text-xs ${new Date(t.due) < new Date() ? 'text-red-400 font-medium' : 'text-zinc-600'}`}>
              {t.due}
            </span>
          )}
          <StatusChip value={t.status} />
        </div>
      </div>
      <div className="flex items-center pr-2">
        <CardMenu items={menuItems} />
      </div>
    </div>
  )
}

function OverdueRow({ milestone: m, onDone }: {
  milestone: { title: string; due?: string; projectName: string; projectId: string; index: number; done: boolean }
  onDone: () => void
}) {
  const toast = useToast()
  const [toggling, setToggling] = useState(false)

  async function handleDone() {
    setToggling(true)
    try {
      await api.patch(`/projects/${m.projectId}/milestones/${m.index}`, { done: true })
      toast.success('Milestone marked done')
      onDone()
    } catch (e) {
      toast.error('Failed to update milestone')
      console.error(e)
    }
    setToggling(false)
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-red-500/8 border border-red-500/20">
      <button
        onClick={handleDone}
        disabled={toggling}
        className="flex items-center justify-center shrink-0 disabled:opacity-50"
        style={{ width: 44, height: 44, margin: '-10px -6px -10px -12px' }}
        aria-label="Mark done"
      >
        <div className="w-5 h-5 rounded-md border-2 border-red-500/40 hover:border-red-400" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-snug">{m.title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{m.projectName}</p>
      </div>
      <span className="text-xs text-red-400 font-medium shrink-0 mt-0.5">{m.due}</span>
    </div>
  )
}

const STATUS_OPTIONS = ['backlog', 'up-next', 'in-progress', 'done', 'cancelled']

function TaskEditModal({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [title, setTitle]   = useState(task.title)
  const [status, setStatus] = useState(task.status)
  const [area, setArea]     = useState(task.area || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updates: Record<string, string> = {}
      if (title.trim() !== task.title)           updates.title = title.trim()
      if (status !== task.status)                updates.status = status
      if (area.trim() !== (task.area || ''))     updates.area = area.trim()
      if (Object.keys(updates).length > 0) {
        await api.patch(`/backlog/${task.id}`, updates)
        toast.success('Task saved')
      }
      onSaved()
    } catch (e) {
      toast.error('Failed to save task')
      console.error(e)
    }
    finally { setSaving(false) }
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
          padding: '20px',
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
            <input className="ios-input w-full" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 block mb-1.5">Status</label>
            <select className="ios-input w-full cursor-pointer" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 block mb-1.5">Area / Project</label>
            <input className="ios-input w-full" value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Hulk Box, Testing…" />
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
