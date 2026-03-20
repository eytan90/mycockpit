import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Idea } from '../../stores/ideaStore'
import { api } from '../../api/client'
import { useIdeaStore } from '../../stores/ideaStore'
import CardMenu from '../../components/CardMenu'
import { useChatContextStore } from '../../stores/chatContextStore'
import { useToast } from '../../components/Toast'

interface Props { idea: Idea }

const EFFORT_OPTIONS = ['low', 'med', 'high']

export default function IdeaCard({ idea: g }: Props) {
  const invalidate = useIdeaStore(s => s.invalidate)
  const { set: setContext } = useChatContextStore()
  const navigate = useNavigate()
  const toast = useToast()
  const [promoting, setPromoting] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  async function patch(updates: Record<string, string>) {
    try {
      await api.patch(`/ideas/${g.index}`, updates)
      invalidate()
    } catch (e) { console.error(e) }
  }

  async function promote() {
    if (promoting) return
    setPromoting(true)
    try {
      await api.post(`/ideas/${g.index}/promote`, {})
      toast.success('Idea promoted to backlog')
      invalidate()
    } catch (e) {
      toast.error('Failed to promote idea')
      console.error(e)
    }
    setPromoting(false)
  }

  function startEdit(field: string, current: string) {
    setDraft(current || '')
    setEditingField(field)
  }

  function commitEdit(field: string) {
    if (draft.trim()) patch({ [field]: draft.trim() })
    setEditingField(null)
  }

  const matBg: Record<number, string> = {
    90: 'border-l-accent-green',
    60: 'border-l-accent-amber',
    30: 'border-l-accent-blue',
    10: 'border-l-border-subtle',
  }
  const borderColor = matBg[g.maturity] ?? 'border-l-border-subtle'

  function chatAbout() {
    const parts = [
      `Help me sharpen this idea: "${g.title}"`,
      g.area   ? `Area: ${g.area}` : null,
      g.effort ? `Effort estimate: ${g.effort}` : null,
      g.from_  ? `Source: ${g.from_}` : null,
      `Maturity score: ${g.maturity}/100`,
      `Challenge this idea — what's weak about it? What would make it stronger? What's the clearest path to action?`,
    ].filter(Boolean).join('\n')
    setContext({ type: 'idea', label: g.title, message: parts })
    navigate('/chat')
  }

  const menuItems = [
    { label: 'Chat about this…',  onClick: chatAbout },
    { label: 'Promote to Backlog', onClick: promote,                                      disabled: g.maturity < 90 || g.graduated || promoting, divider: true },
    { label: 'Effort: low',        onClick: () => patch({ effort: 'low' }),               disabled: g.effort === 'low', divider: true },
    { label: 'Effort: med',        onClick: () => patch({ effort: 'med' }),               disabled: g.effort === 'med' },
    { label: 'Effort: high',       onClick: () => patch({ effort: 'high' }),              disabled: g.effort === 'high' },
    { label: 'Edit title',         onClick: () => startEdit('title', g.title),            divider: true },
    { label: 'Archive',            onClick: () => patch({ done: 'true' }),                danger: true, divider: true },
  ]

  return (
    <div className={`bg-bg-surface border border-border-subtle border-l-2 ${borderColor} rounded-lg p-3 space-y-2 group`}>
      {/* Title row with menu */}
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
      {editingField === 'title' ? (
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commitEdit('title')}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit('title') }
            if (e.key === 'Escape') setEditingField(null)
          }}
          className="ios-input w-full resize-none text-sm font-medium leading-snug"
        />
      ) : (
        <p
          className="text-sm font-medium text-text-primary leading-snug cursor-pointer hover:text-accent-blue transition-colors"
          onClick={() => startEdit('title', g.title)}
        >{g.title}</p>
      )}
        </div>
        <div className="shrink-0 -mt-0.5 -mr-1">
          <CardMenu items={menuItems} />
        </div>
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap gap-1.5">
        {/* Area */}
        <Tag
          label="area"
          value={g.area}
          editing={editingField === 'area'}
          draft={draft}
          onEdit={() => startEdit('area', g.area || '')}
          onDraftChange={setDraft}
          onCommit={() => commitEdit('area')}
          onCancel={() => setEditingField(null)}
        />
        {/* Effort */}
        {editingField === 'effort' ? (
          <select
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { patch({ effort: draft }); setEditingField(null) }}
            className="text-xxs bg-bg-elevated text-text-primary rounded px-1.5 py-0.5 border border-accent-blue/50 focus:outline-none"
          >
            {EFFORT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <button
            onClick={() => startEdit('effort', g.effort || 'low')}
            className={`text-xxs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${
              g.effort === 'low' ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' :
              g.effort === 'med' ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber' :
              g.effort === 'high' ? 'bg-accent-red/10 border-accent-red/30 text-accent-red' :
              'bg-bg-elevated border-border-subtle text-text-muted'
            }`}
          >
            {g.effort ? `effort: ${g.effort}` : '+ effort'}
          </button>
        )}
        {/* From */}
        <Tag
          label="from"
          value={g.from_}
          editing={editingField === 'from'}
          draft={draft}
          onEdit={() => startEdit('from', g.from_ || '')}
          onDraftChange={setDraft}
          onCommit={() => commitEdit('from')}
          onCancel={() => setEditingField(null)}
        />
      </div>

      {/* Section + added */}
      <div className="flex items-center justify-between">
        <span className="text-xxs text-text-muted truncate">{g.section}</span>
        {g.added && <span className="text-xxs text-text-muted shrink-0">{g.added}</span>}
      </div>

      {/* Promote button — only show for ready ideas */}
      {g.maturity >= 90 && !g.graduated && (
        <button
          onClick={promote}
          disabled={promoting}
          className="w-full text-xxs font-medium py-1 rounded bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20 transition-colors disabled:opacity-50"
        >
          {promoting ? 'Promoting…' : 'Promote to Backlog'}
        </button>
      )}
      {g.graduated && (
        <span className="text-xxs text-text-muted italic">Graduated to backlog</span>
      )}
    </div>
  )
}

function Tag({ label, value, editing, draft, onEdit, onDraftChange, onCommit, onCancel }: {
  label: string
  value?: string
  editing: boolean
  draft: string
  onEdit: () => void
  onDraftChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => onDraftChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel() }}
        placeholder={label}
        className="text-xxs bg-bg-elevated text-text-primary rounded px-2 py-0.5 border border-accent-blue/50 focus:outline-none w-24"
      />
    )
  }
  return (
    <button
      onClick={onEdit}
      className="text-xxs px-2 py-0.5 rounded-full bg-bg-elevated border border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-default transition-colors"
    >
      {value ? `${label}: ${value}` : `+ ${label}`}
    </button>
  )
}
