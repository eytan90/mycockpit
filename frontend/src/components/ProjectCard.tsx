import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project } from '../stores/projectStore'
import StatusChip from './StatusChip'
import ProgressBar from './ProgressBar'
import CardMenu from './CardMenu'
import { useThemeStore } from '../stores/themeStore'
import { useProjectStore } from '../stores/projectStore'
import { useChatContextStore } from '../stores/chatContextStore'
import { api } from '../api/client'

interface Props { project: Project; compact?: boolean }

function pctColor(p: number) {
  if (p >= 75) return '#22C55E'
  if (p >= 50) return 'var(--accent)'
  if (p >= 25) return '#F59E0B'
  return '#EF4444'
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function cardGradient(priority: string) {
  if (priority === 'high')   return 'linear-gradient(135deg, #EF4444, #F97316)'
  if (priority === 'medium') return 'linear-gradient(135deg, #3B82F6, #6366F1)'
  if (priority === 'low')    return 'linear-gradient(135deg, #22C55E, #14B8A6)'
  return 'linear-gradient(135deg, #52525B, #3F3F46)'
}

const ProjectCard = memo(function ProjectCard({ project: p, compact }: Props) {
  const navigate  = useNavigate()
  const { theme } = useThemeStore()
  const { invalidate } = useProjectStore()
  const { set: setContext } = useChatContextStore()
  const progress  = p.calculated_progress ?? p.progress
  const nextMilestone = p.milestones.find(m => !m.done)

  async function patch(updates: Record<string, string | number>) {
    try { await api.patch(`/projects/${p.id}`, updates); invalidate() } catch (e) { console.error(e) }
  }

  function chatAbout() {
    const parts = [
      `Tell me about project "${p.name}".`,
      `Status: ${p.status} | Priority: ${p.priority} | Progress: ${progress}%`,
      p.owner        ? `Owner: ${p.owner}` : null,
      p.target_date  ? `Target date: ${p.target_date}` : null,
      p.next_action  ? `Next action: ${p.next_action}` : null,
      p.blockers     ? `Blockers: ${p.blockers}` : null,
      p.confidence   ? `Confidence: ${p.confidence}` : null,
      nextMilestone  ? `Next milestone: ${nextMilestone.title}${nextMilestone.due ? ` (due ${nextMilestone.due})` : ''}` : null,
      p.description  ? `Description: ${p.description}` : null,
    ].filter(Boolean).join('\n')
    setContext({ type: 'project', label: p.name, message: parts })
    navigate('/chat')
  }

  const menuItems = [
    { label: 'Open project',     onClick: () => navigate(`/projects/${p.id}`) },
    { label: 'Chat about this…', onClick: chatAbout, divider: true },
    { label: 'Mark in-progress', onClick: () => patch({ status: 'in-progress' }), disabled: p.status === 'in-progress', divider: true },
    { label: 'Mark planning',    onClick: () => patch({ status: 'planning' }),     disabled: p.status === 'planning' },
    { label: 'Mark waiting',     onClick: () => patch({ status: 'waiting' }),      disabled: p.status === 'waiting' },
    { label: 'Mark stalled',     onClick: () => patch({ status: 'stalled' }),      disabled: p.status === 'stalled' },
    { label: 'Mark done',        onClick: () => patch({ status: 'done' }),         disabled: p.status === 'done' },
    { label: '↑ High priority',  onClick: () => patch({ priority: 'high' }),       disabled: p.priority === 'high', divider: true },
    { label: '→ Medium priority',onClick: () => patch({ priority: 'medium' }),     disabled: p.priority === 'medium' },
    { label: '↓ Low priority',   onClick: () => patch({ priority: 'low' }),        disabled: p.priority === 'low' },
    { label: 'Cancel project',   onClick: () => patch({ status: 'cancelled' }),    danger: true, divider: true },
  ]

  if (theme === 'vibrant') {
    return (
      <div className="vib-card group" onClick={() => navigate(`/projects/${p.id}`)}>
        <div className="vib-card-header" style={{ background: cardGradient(p.priority) }}>
          <div className="vib-avatar">{initials(p.name)}</div>
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <div onClick={e => e.stopPropagation()}>
              <CardMenu items={menuItems} />
            </div>
          </div>
        </div>
        <div className="vib-card-body">
          <p className="text-[14px] font-semibold text-white leading-tight truncate">{p.name}</p>
          {!compact && (
            <>
              <div className="vib-progress-track">
                <div className="vib-progress-fill" style={{ width: `${progress}%`, background: cardGradient(p.priority) }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold" style={{ color: pctColor(progress) }}>{progress}%</span>
                {p.owner && <span className="text-[11px] text-zinc-500 truncate max-w-[80px]">{p.owner}</span>}
              </div>
              {nextMilestone && <p className="text-[11px] text-zinc-500 mt-1.5 truncate">→ {nextMilestone.title}</p>}
            </>
          )}
        </div>
      </div>
    )
  }

  // Dark mode
  return (
    <div className="card card-press group" onClick={() => navigate(`/projects/${p.id}`)}>
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[15px] font-semibold text-white leading-tight flex-1 min-w-0 truncate">{p.name}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusChip value={p.status} />
          <CardMenu items={menuItems} />
        </div>
      </div>

      {/* Progress */}
      {!compact && (
        <div className="mb-3">
          <ProgressBar value={progress} height="h-1.5" />
        </div>
      )}

      {/* Metadata row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold" style={{ color: pctColor(progress) }}>{progress}%</span>
          {p.owner && <span className="text-xs text-zinc-500">{p.owner}</span>}
          {p.target_date && <span className="text-xs text-zinc-600">{p.target_date}</span>}
        </div>
        <StatusChip value={p.priority} />
      </div>

      {/* Next milestone */}
      {!compact && nextMilestone && (
        <p className="text-xs text-zinc-600 mt-2 truncate">→ {nextMilestone.title}</p>
      )}
    </div>
  )
})

export default ProjectCard
