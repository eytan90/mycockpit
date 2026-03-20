import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../../stores/projectStore'
import { useInboxStore } from '../../stores/inboxStore'
import { useAttentionStore } from '../../stores/attentionStore'
import { useBacklogStore } from '../../stores/backlogStore'
import { useGoalStore } from '../../stores/goalStore'
import { useThemeStore } from '../../stores/themeStore'
import type { AttentionItem } from '../../stores/attentionStore'
import type { Project } from '../../stores/projectStore'
import type { Task } from '../../stores/backlogStore'
import ProjectCard from '../../components/ProjectCard'
import StatusChip from '../../components/StatusChip'
import ProgressBar from '../../components/ProgressBar'
import CardMenu from '../../components/CardMenu'
import { useChatContextStore } from '../../stores/chatContextStore'
import { api } from '../../api/client'
import { useToast } from '../../components/Toast'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

// ── Skeleton components ──────────────────────────────────────────────────────

function SkeletonStatGrid() {
  return (
    <div className="px-4 md:px-6 mb-7">
      <div className="stat-grid">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="stat-tile animate-pulse">
            <div className="h-8 w-10 rounded bg-zinc-800 mb-2" />
            <div className="h-3 w-16 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="ios-row animate-pulse">
          <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/4 rounded bg-zinc-800" />
            <div className="h-2.5 w-1/2 rounded bg-zinc-800" />
          </div>
        </div>
      ))}
    </>
  )
}

export default function Home() {
  const navigate  = useNavigate()
  const toast     = useToast()
  const { theme } = useThemeStore()

  const { projects, fetch: fetchProjects, lastFetched: projFetched, invalidate: invalidateProjects } = useProjectStore()
  const { items: inbox, fetch: fetchInbox, lastFetched: inboxFetched, invalidate: invalidateInbox }   = useInboxStore()
  const { items: attention, summary, fetch: fetchAttention, lastFetched: attFetched, invalidate: invalidateAtt } = useAttentionStore()
  const { tasks, fetch: fetchTasks, lastFetched: tasksFetched, invalidate: invalidateTasks } = useBacklogStore()
  const { goals, fetch: fetchGoals, lastFetched: goalsFetched } = useGoalStore()

  const [reviewing, setReviewing]       = useState(false)
  const [reviewResult, setReviewResult] = useState<{ category: string; text: string }[] | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const loaded = !!(projFetched && attFetched && tasksFetched)

  useEffect(() => {
    if (!projFetched)  fetchProjects()
    if (!inboxFetched) fetchInbox()
    if (!attFetched)   fetchAttention()
    if (!tasksFetched) fetchTasks()
    if (!goalsFetched) fetchGoals()
  }, [projFetched, inboxFetched, attFetched, tasksFetched, goalsFetched])

  async function handleReview() {
    setReviewing(true)
    setReviewResult(null)
    try {
      const res = await api.post<{ processed: { category: string; text: string; destination: string }[] }>('/inbox/review', {})
      setReviewResult(res.processed)
      invalidateInbox()
      invalidateAtt()
    } catch (e) {
      toast.error('Review failed')
      console.error(e)
    }
    setReviewing(false)
  }

  const now = new Date(); now.setHours(0,0,0,0)
  const priorityProjects  = projects.filter(p => p.status !== 'done' && p.status !== 'cancelled').slice(0, 6)
  const highAttention     = attention.filter(i => i.severity === 'high')
  const otherAttention    = attention.filter(i => i.severity !== 'high').slice(0, 3)
  const overdueMilestones = projects.flatMap(p =>
    p.milestones.filter(m => !m.done && m.due && new Date(m.due) < now)
      .map(m => ({ ...m, projectName: p.name, projectId: p.id }))
  )
  const inProgressTasks   = tasks.filter(t => ['in-progress','wip','doing'].includes(t.status)).slice(0, 5)
  const highPriorityTasks = tasks.filter(t => t.priority === 'high' && !['done','cancelled'].includes(t.status) && !inProgressTasks.find(x => x.id === t.id)).slice(0, 3)
  const upNextTasks = tasks.filter(t =>
    !['done','cancelled','in-progress','wip','doing'].includes(t.status) &&
    t.priority !== 'high' &&
    !inProgressTasks.find(x => x.id === t.id)
  ).slice(0, 5)
  const currentGoals = goals.filter(g => g.status !== 'done')

  if (theme === 'vibrant') {
    return <>
      <VibrantHome
        projects={priorityProjects}
        inbox={inbox}
        attention={[...highAttention, ...otherAttention].slice(0, 4)}
        summary={summary}
        reviewing={reviewing}
        reviewResult={reviewResult}
        onReview={handleReview}
        onNavigate={navigate}
        inProgressTasks={inProgressTasks}
        highPriorityTasks={highPriorityTasks}
        upNextTasks={upNextTasks}
        overdueMilestones={overdueMilestones}
        onTaskClick={setSelectedTask}
        loaded={loaded}
      />
      {selectedTask && <TaskEditModal task={selectedTask} onClose={() => setSelectedTask(null)} onSaved={() => { invalidateTasks(); setSelectedTask(null) }} />}
    </>
  }

  return (
    <div className="ios-page page-enter">
      {/* Header */}
      <div className="px-4 pt-8 pb-5 md:px-6">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-[#8E8E93] mb-2">{today}</p>
        <h1 className="text-4xl font-semibold text-white tracking-tight leading-tight">{greeting()},<br />Eytan.</h1>
      </div>

      {/* Stat chips */}
      {!loaded ? (
        <div className="px-4 md:px-6 mb-5 flex gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-[44px] w-20 rounded-full bg-zinc-800 animate-pulse" />)}
        </div>
      ) : (
        <div className="px-4 md:px-6 mb-5 flex gap-2 flex-wrap">
          <button onClick={() => navigate('/projects')} className="flex items-center gap-1.5 h-[44px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <span className="text-base font-semibold" style={{ color: 'var(--accent)' }}>{summary?.active_projects ?? '—'}</span>
            <span className="text-[13px] text-text-secondary">Projects</span>
          </button>
          <button className="flex items-center gap-1.5 h-[44px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <span className="text-base font-semibold" style={{ color: summary?.inbox_count ? '#FF9F0A' : 'var(--text-secondary)' }}>{summary?.inbox_count ?? '0'}</span>
            <span className="text-[13px] text-text-secondary">Inbox</span>
          </button>
          <button onClick={() => navigate('/ideas')} className="flex items-center gap-1.5 h-[44px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <span className="text-base font-semibold" style={{ color: summary?.ideas_ready_to_promote ? '#30D158' : 'var(--text-secondary)' }}>{summary?.ideas_ready_to_promote ?? '0'}</span>
            <span className="text-[13px] text-text-secondary">Ready</span>
          </button>
          <button className="flex items-center gap-1.5 h-[44px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <span className="text-base font-semibold" style={{ color: attention.length ? '#FF453A' : 'var(--text-secondary)' }}>{attention.length}</span>
            <span className="text-[13px] text-text-secondary">Flags</span>
          </button>
        </div>
      )}

      {/* ── SUGGESTED MODE ───────────────────────────────── */}
      <SuggestedMode
        overdueCount={overdueMilestones.length}
        inProgressCount={inProgressTasks.length}
        highPriorityCount={highPriorityTasks.length}
        attentionCount={attention.length}
        readyToPromote={summary?.ideas_ready_to_promote ?? 0}
        inboxCount={summary?.inbox_count ?? 0}
        onNavigate={navigate}
      />

      {/* ── FOCUS: Overdue + In Progress + Up Next ───────── */}
      {(overdueMilestones.length > 0 || inProgressTasks.length > 0 || highPriorityTasks.length > 0 || upNextTasks.length > 0) && (
        <IosSection title="Focus" action={<button onClick={() => navigate('/focus')} className="text-[13px] text-accent-blue font-medium pr-4">Full view</button>}>
          {!loaded ? <SkeletonRows count={3} /> : (
            <>
              {overdueMilestones.map((m, i) => (
                <OverdueRow key={i} milestone={m} onDone={() => { invalidateProjects() }} />
              ))}
              {inProgressTasks.map((t, i) => (
                <FocusTaskRow key={i} task={t} accent="var(--accent)" onClick={() => setSelectedTask(t)} />
              ))}
              {highPriorityTasks.map((t, i) => (
                <FocusTaskRow key={i} task={t} accent="#F59E0B" onClick={() => setSelectedTask(t)} />
              ))}
              {upNextTasks.map((t, i) => (
                <FocusTaskRow key={i} task={t} accent="#3F3F46" onClick={() => setSelectedTask(t)} />
              ))}
            </>
          )}
        </IosSection>
      )}
      {selectedTask && <TaskEditModal task={selectedTask} onClose={() => setSelectedTask(null)} onSaved={() => { invalidateTasks(); setSelectedTask(null) }} />}

      {/* ── NEEDS ATTENTION ──────────────────────────────── */}
      {attention.length > 0 && (
        <IosSection title="Needs Attention">
          {[...highAttention, ...otherAttention].slice(0, 4).map((item, i) => <AttentionRow key={i} item={item} />)}
        </IosSection>
      )}

      {/* ── GOALS ────────────────────────────────────────── */}
      {currentGoals.length > 0 && (
        <IosSection title="Active Goals">
          {currentGoals.slice(0, 6).map(g => (
            <div key={g.id} className="ios-row">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                g.status === 'active' || g.status === 'in-progress' ? 'bg-accent-blue' : 'bg-border-default'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-white font-medium truncate">{g.title}</p>
                {g.horizon && <p className="text-[12px] text-text-muted">{g.horizon}</p>}
              </div>
              <StatusChip value={g.status} />
            </div>
          ))}
        </IosSection>
      )}

      {/* ── PRIORITY PROJECTS ────────────────────────────── */}
      <IosSection title="Priority Projects" action={<button onClick={() => navigate('/projects')} className="text-[13px] text-accent-blue font-medium pr-4">See all</button>}>
        {!loaded ? <SkeletonRows count={2} /> : priorityProjects.length === 0 ? (
          <div className="ios-row"><p className="text-[15px] text-text-muted">No active projects</p></div>
        ) : priorityProjects.map(p => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </IosSection>

      {/* ── INBOX ────────────────────────────────────────── */}
      {(inbox.length > 0 || (reviewResult && reviewResult.length > 0)) && (
        <IosSection
          title="Inbox"
          action={inbox.length > 0 ? (
            <button onClick={handleReview} disabled={reviewing} className="text-[13px] text-accent-blue font-medium pr-4 disabled:opacity-40">
              {reviewing ? 'Filing…' : 'Review Now'}
            </button>
          ) : undefined}
        >
          {reviewResult && reviewResult.length > 0 && (
            <div className="ios-row" style={{ background: 'rgba(48,209,88,0.08)' }}>
              <p className="text-[13px] text-accent-green">Filed {reviewResult.length} item{reviewResult.length !== 1 ? 's' : ''}</p>
            </div>
          )}
          {inbox.slice(0, 5).map((item, i) => <InboxRow key={i} text={item} />)}
          {inbox.length > 5 && (
            <div className="ios-row"><p className="text-[13px] text-text-muted">+{inbox.length - 5} more items</p></div>
          )}
        </IosSection>
      )}
    </div>
  )
}

// ── Focus components ──────────────────────────────────────────────────────────

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
    <div className="ios-row" style={{ background: 'rgba(239,68,68,0.05)' }}>
      <button
        onClick={handleDone}
        disabled={toggling}
        className="flex items-center justify-center shrink-0 w-11 h-11 -ml-2 -my-2 disabled:opacity-50"
        aria-label="Mark done"
      >
        <div className="w-4 h-4 rounded border-2 border-red-500/50 hover:border-red-400" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-white font-medium truncate">{m.title}</p>
        <p className="text-[12px] text-text-muted">{m.projectName}</p>
      </div>
      <span className="text-[12px] text-red-400 font-medium shrink-0">{m.due}</span>
    </div>
  )
}

function FocusTaskRow({ task: t, accent, onClick, onUpdated }: { task: Task; accent: string; onClick?: () => void; onUpdated?: () => void }) {
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
    <div className="ios-row group cursor-pointer active:opacity-70" onClick={onClick}>
      <div className="w-[3px] h-8 rounded-full shrink-0" style={{ background: accent }} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-white font-medium truncate">{t.title}</p>
        {(t.area || t.project_ref) && (
          <p className="text-[12px] text-text-muted truncate">{t.project_ref || t.area}</p>
        )}
      </div>
      <StatusChip value={t.status} />
      <CardMenu items={menuItems} />
    </div>
  )
}

// ── Shared dark layout components ─────────────────────────────────────────────

function IosSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-1.5">
        <p className="ios-section-label">{title}</p>
        {action}
      </div>
      <div className="mx-4 md:mx-6 ios-grouped">{children}</div>
    </div>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const navigate = useNavigate()
  const dotColor = item.severity === 'high' ? '#FF453A' : item.severity === 'medium' ? '#FF9F0A' : '#0A84FF'

  function handleClick() {
    if (item.action) navigate(item.action)
  }

  const isClickable = !!item.action

  return (
    <div
      className={`ios-row ${isClickable ? 'ios-row-press cursor-pointer hover:bg-elevated' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-white font-medium truncate">{item.title}</p>
        <p className="text-[12px] text-text-muted truncate">{item.detail}</p>
      </div>
      {isClickable && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-zinc-600">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </div>
  )
}

function InboxRow({ text }: { text: string }) {
  const tsMatch = text.match(/^\[([^\]]+)\]/)
  const ts   = tsMatch?.[1] ?? ''
  const body = text.replace(/^\[[^\]]+\]\s*/, '')
  return (
    <div className="ios-row">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-white truncate">{body}</p>
        {ts && <p className="text-[12px] text-text-muted mt-0.5">{ts}</p>}
      </div>
    </div>
  )
}

// ── Suggested Mode ────────────────────────────────────────────────────────────

function SuggestedMode({ overdueCount, inProgressCount, highPriorityCount, attentionCount, readyToPromote, inboxCount, onNavigate }: {
  overdueCount: number; inProgressCount: number; highPriorityCount: number
  attentionCount: number; readyToPromote: number; inboxCount: number
  onNavigate: (path: string) => void
}) {
  let path = '/focus'
  let label = 'Focus'
  let reason = 'Start your day with your top tasks.'
  let accent = 'var(--accent)'
  let urgent = false

  if (overdueCount > 0) {
    path = '/focus'; label = 'Focus — Overdue';
    reason = `${overdueCount} overdue milestone${overdueCount > 1 ? 's' : ''} need attention.`
    accent = '#EF4444'; urgent = true
  } else if (attentionCount >= 3) {
    path = '/plan'; label = 'Organize'
    reason = `${attentionCount} vault issues flagged — good time to review.`
    accent = '#F59E0B'
  } else if (inProgressCount > 0) {
    path = '/focus'; label = 'Focus'
    reason = `${inProgressCount} task${inProgressCount > 1 ? 's' : ''} in progress — stay in flow.`
    accent = 'var(--accent)'
  } else if (readyToPromote > 0) {
    path = '/ideas'; label = 'Ideas'
    reason = `${readyToPromote} idea${readyToPromote > 1 ? 's' : ''} ready to promote to a project.`
    accent = '#30D158'
  } else if (inboxCount > 0) {
    path = '/'; label = 'Review Inbox'
    reason = `${inboxCount} unreviewed item${inboxCount > 1 ? 's' : ''} in inbox.`
    accent = '#FF9F0A'
  } else if (highPriorityCount > 0) {
    path = '/focus'; label = 'Focus'
    reason = `${highPriorityCount} high-priority task${highPriorityCount > 1 ? 's' : ''} waiting.`
    accent = '#F59E0B'
  }

  return (
    <div className="px-4 md:px-6 mb-6">
      <button
        onClick={() => onNavigate(path)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.99]"
        style={{
          background: urgent ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${urgent ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
        }}
      >
        <div
          className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-base"
          style={{ background: `${accent}18` }}
        >
          {label.startsWith('Focus') ? '⚡' : label === 'Organize' ? '🔍' : label === 'Ideas' ? '💡' : label === 'Review Inbox' ? '📥' : '⚡'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/50 uppercase tracking-widest leading-none mb-1">Suggested</p>
          <p className="text-[15px] font-semibold text-white leading-snug">{label}</p>
          <p className="text-[12px] text-white/40 mt-0.5 leading-snug">{reason}</p>
        </div>
        <span className="text-white/25 text-lg shrink-0">›</span>
      </button>
    </div>
  )
}

// ── Vibrant layout ─────────────────────────────────────────────────────────────

function VibrantHome({ projects, inbox, attention, summary, reviewing, reviewResult, onReview, onNavigate, inProgressTasks, highPriorityTasks, upNextTasks, overdueMilestones, onTaskClick, loaded }: {
  projects: Project[]
  inbox: string[]
  attention: AttentionItem[]
  summary: any
  reviewing: boolean
  reviewResult: any
  onReview: () => void
  onNavigate: (path: string) => void
  inProgressTasks: Task[]
  highPriorityTasks: Task[]
  upNextTasks: Task[]
  overdueMilestones: { title: string; due?: string; projectName: string; projectId: string; index: number; done: boolean }[]
  onTaskClick: (t: Task) => void
  loaded: boolean
}) {
  return (
    <div className="ios-page">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--accent)' }}>{today}</p>
        <h1 className="text-[30px] font-bold text-white tracking-tight leading-tight">
          {greeting()},<br />Eytan.
        </h1>
      </div>

      {/* Stat chips */}
      <div className="px-5 mb-5">
        {!loaded ? (
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-[30px] w-20 rounded-full bg-zinc-800 animate-pulse" />)}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onNavigate('/projects')} className="flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
              <span className="text-[13px] font-semibold" style={{ color: '#0A84FF' }}>{summary?.active_projects ?? '—'}</span>
              <span className="text-[12px] text-text-secondary">Projects</span>
            </button>
            <button className="flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
              <span className="text-[13px] font-semibold" style={{ color: summary?.inbox_count ? '#FF9F0A' : 'var(--text-secondary)' }}>{summary?.inbox_count || '0'}</span>
              <span className="text-[12px] text-text-secondary">Inbox</span>
            </button>
            <button className="flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
              <span className="text-[13px] font-semibold" style={{ color: attention.length ? '#FF453A' : 'var(--text-secondary)' }}>{attention.length || '0'}</span>
              <span className="text-[12px] text-text-secondary">Flags</span>
            </button>
          </div>
        )}
      </div>

      {/* Focus: overdue + in-progress + high priority + up next */}
      {(overdueMilestones.length > 0 || inProgressTasks.length > 0 || highPriorityTasks.length > 0 || upNextTasks.length > 0) && (
        <div className="mb-7">
          <VibSectionHeader title="Focus" onSeeAll={() => onNavigate('/focus')} seeAllLabel="Full view →" />
          <div className="px-5 flex flex-col gap-2">
            {overdueMilestones.map((m, i) => (
              <div key={i} className="vib-attention-row" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-accent-red" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-white font-medium truncate">{m.title}</p>
                  <p className="text-[11px] text-white/35">{m.projectName} · overdue {m.due}</p>
                </div>
              </div>
            ))}
            {inProgressTasks.map((t, i) => (
              <div key={i} className="vib-attention-row cursor-pointer active:opacity-70" onClick={() => onTaskClick(t)}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-white font-medium truncate">{t.title}</p>
                  {(t.area || t.project_ref) && <p className="text-[11px] text-white/35 truncate">{t.project_ref || t.area}</p>}
                </div>
              </div>
            ))}
            {highPriorityTasks.map((t, i) => (
              <div key={i} className="vib-attention-row cursor-pointer active:opacity-70" style={{ borderColor: 'rgba(245,158,11,0.3)' }} onClick={() => onTaskClick(t)}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-white font-medium truncate">{t.title}</p>
                  {(t.area || t.project_ref) && <p className="text-[11px] text-white/35 truncate">{t.project_ref || t.area}</p>}
                </div>
              </div>
            ))}
            {upNextTasks.map((t, i) => (
              <div key={i} className="vib-attention-row cursor-pointer active:opacity-70" onClick={() => onTaskClick(t)}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-zinc-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-white font-medium truncate">{t.title}</p>
                  {(t.area || t.project_ref) && <p className="text-[11px] text-white/35 truncate">{t.project_ref || t.area}</p>}
                </div>
                <span className="text-[11px] text-white/25 shrink-0">{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attention */}
      {attention.length > 0 && (
        <div className="mb-7">
          <VibSectionHeader title="Needs Attention" />
          <div className="px-5 flex flex-col gap-2">
            {attention.map((item, i) => <VibAttentionRow key={i} item={item} />)}
          </div>
        </div>
      )}

      {/* Priority projects */}
      <div className="mb-7">
        <VibSectionHeader title="Active Projects" onSeeAll={() => onNavigate('/projects')} />
        {!loaded ? (
          <div className="px-5 flex gap-3 overflow-x-hidden">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="vib-card animate-pulse shrink-0">
                <div className="vib-card-header bg-zinc-800" />
                <div className="vib-card-body space-y-2">
                  <div className="h-3 w-3/4 rounded bg-zinc-800" />
                  <div className="h-2.5 w-1/2 rounded bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="px-5 text-[14px] text-white/30">No active projects</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-5 pb-2" style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
            {projects.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </div>

      {/* Inbox */}
      {(inbox.length > 0 || (reviewResult && reviewResult.length > 0)) && (
        <div className="mb-7">
          <VibSectionHeader
            title="Inbox"
            onSeeAll={inbox.length > 0 ? onReview : undefined}
            seeAllLabel={reviewing ? 'Filing…' : 'Review Now'}
          />
          <div className="px-5 flex flex-col gap-2">
            {reviewResult && reviewResult.length > 0 && (
              <div className="vib-attention-row" style={{ borderColor: 'rgba(48,209,88,0.3)' }}>
                <p className="text-[13px] text-accent-green">Filed {reviewResult.length} item{reviewResult.length !== 1 ? 's' : ''}</p>
              </div>
            )}
            {inbox.slice(0, 5).map((item, i) => <VibInboxRow key={i} text={item} />)}
            {inbox.length > 5 && <p className="text-[12px] text-white/30 px-1">+{inbox.length - 5} more</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function VibSectionHeader({ title, onSeeAll, seeAllLabel = 'See all' }: { title: string; onSeeAll?: () => void; seeAllLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-5 mb-3">
      <p className="text-[20px] font-bold text-white tracking-tight">{title}</p>
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>
          {seeAllLabel} →
        </button>
      )}
    </div>
  )
}

function VibStatTile({ value, label, icon, accent, onClick }: { value: any; label: string; icon: string; accent: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="vib-stat-tile">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {label === 'Projects' && <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></>}
        {label === 'Inbox'    && <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>}
        {label === 'Flags'    && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>}
      </svg>
      <span className="text-[24px] font-bold text-white leading-none mt-1">{value}</span>
      <span className="text-[11px] font-medium mt-0.5" style={{ color: accent }}>{label}</span>
    </button>
  )
}

function VibAttentionRow({ item }: { item: AttentionItem }) {
  const dotColor = item.severity === 'high' ? '#FF453A' : item.severity === 'medium' ? '#FF9F0A' : 'var(--accent)'
  return (
    <div className="vib-attention-row" style={{ borderColor: `${dotColor}33` }}>
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-white font-medium truncate">{item.title}</p>
        <p className="text-[11px] text-white/35 truncate">{item.detail}</p>
      </div>
    </div>
  )
}

function VibInboxRow({ text }: { text: string }) {
  const tsMatch = text.match(/^\[([^\]]+)\]/)
  const ts   = tsMatch?.[1] ?? ''
  const body = text.replace(/^\[[^\]]+\]\s*/, '')
  return (
    <div className="vib-attention-row">
      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[13px]"
        style={{ background: 'var(--accent-15)' }}>📝</div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-white truncate">{body}</p>
        {ts && <p className="text-[11px] text-white/30 mt-0.5">{ts}</p>}
      </div>
    </div>
  )
}

// ── Task Edit Modal ───────────────────────────────────────────────────────────

const TASK_STATUS_OPTIONS = ['backlog', 'up-next', 'in-progress', 'done', 'cancelled']

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
      if (title.trim() !== task.title)       updates.title = title.trim()
      if (status !== task.status)            updates.status = status
      if (area.trim() !== (task.area || '')) updates.area = area.trim()
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
    <div className="fixed inset-0 z-50" style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl"
        style={{ background: '#18181b', padding: '20px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,0.08)' }}
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
              {TASK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 block mb-1.5">Area / Project</label>
            <input className="ios-input w-full" value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Hulk Box, Testing…" />
          </div>
        </div>
        <button onClick={save} disabled={saving} className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50" style={{ background: 'var(--accent)' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
