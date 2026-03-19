import { memo, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project } from '../../stores/projectStore'
import StatusChip from '../../components/StatusChip'
import ProgressBar from '../../components/ProgressBar'
import SkeletonCard from '../../components/SkeletonCard'
import CardMenu from '../../components/CardMenu'
import { useProjectStore } from '../../stores/projectStore'
import { useChatContextStore } from '../../stores/chatContextStore'
import { api } from '../../api/client'

interface Props { projects: Project[]; selectedId?: string; onSelect: (id: string) => void }

const STATUS_FILTERS = ['all', 'in-progress', 'planning', 'waiting', 'done']

export default function ProjectList({ projects, selectedId, onSelect }: Props) {
  const { isLoading } = useProjectStore()
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = useMemo(() => projects.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    return matchSearch && matchStatus
  }), [projects, search, statusFilter])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 shrink-0">
        <h2 className="text-xl font-semibold text-white mb-4">Projects</h2>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter projects…"
          className="ios-input mb-4"
          style={{ padding: '9px 14px' }}
        />

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`filter-chip ${statusFilter === s ? 'filter-chip-active' : ''}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
        {isLoading && projects.length === 0 ? (
          [0,1,2].map(i => <SkeletonCard key={i} lines={3} />)
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-10">No projects match.</p>
        ) : (
          filtered.map(p => (
            <ProjectRow key={p.id} project={p} selected={p.id === selectedId} onClick={() => onSelect(p.id)} />
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-border-subtle shrink-0" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom) + 80px)' }}>
        <span className="text-xs text-zinc-600">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

const ProjectRow = memo(function ProjectRow({ project: p, selected, onClick }: { project: Project; selected: boolean; onClick: () => void }) {
  const { invalidate } = useProjectStore()
  const { set: setContext } = useChatContextStore()
  const navigate = useNavigate()
  const progress = p.calculated_progress ?? p.progress

  async function patch(updates: Record<string, string>) {
    try { await api.patch(`/projects/${p.id}`, updates); invalidate() } catch (e) { console.error(e) }
  }

  function chatAbout() {
    const nextMilestone = p.milestones.find(m => !m.done)
    const parts = [
      `Tell me about project "${p.name}".`,
      `Status: ${p.status} | Priority: ${p.priority} | Progress: ${progress}%`,
      p.owner       ? `Owner: ${p.owner}` : null,
      p.target_date ? `Target date: ${p.target_date}` : null,
      p.next_action ? `Next action: ${p.next_action}` : null,
      p.blockers    ? `Blockers: ${p.blockers}` : null,
      nextMilestone ? `Next milestone: ${nextMilestone.title}${nextMilestone.due ? ` (due ${nextMilestone.due})` : ''}` : null,
    ].filter(Boolean).join('\n')
    setContext({ type: 'project', label: p.name, message: parts })
    navigate('/chat')
  }

  const menuItems = [
    { label: 'Chat about this…', onClick: chatAbout },
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

  return (
    <div
      onClick={onClick}
      className={`card card-press group transition-all duration-200 ${selected ? 'border-accent-blue/40' : ''}`}
      style={selected ? { borderColor: 'var(--accent)', background: 'rgba(59,130,246,0.06)' } : {}}
    >
      {/* Title + menu */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-sm font-semibold text-white leading-tight flex-1 min-w-0">{p.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusChip value={p.priority} />
          <CardMenu items={menuItems} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <ProgressBar value={progress} height="h-1.5" />
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-zinc-400">{progress}%</span>
          {p.owner && <span className="text-xs text-zinc-600">{p.owner}</span>}
          {p.target_date && <span className="text-xs text-zinc-700">{p.target_date}</span>}
        </div>
        <StatusChip value={p.status} />
      </div>
    </div>
  )
})
