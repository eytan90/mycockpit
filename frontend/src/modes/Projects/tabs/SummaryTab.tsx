import { useState } from 'react'
import type { Project } from '../../../stores/projectStore'
import { api } from '../../../api/client'

interface Props { project: Project; onUpdated: () => void }

const STATUS_OPTIONS      = ['in-progress', 'planning', 'waiting', 'done', 'cancelled', 'stalled']
const PRIORITY_OPTIONS    = ['high', 'medium', 'low']
const RISK_OPTIONS        = ['', 'low', 'medium', 'high', 'critical']
const CONFIDENCE_OPTIONS  = ['', 'very-high', 'high', 'medium', 'low']

const CONFIDENCE_COLORS: Record<string, string> = {
  'very-high': 'text-accent-green',
  'high':      'text-accent-blue',
  'medium':    'text-accent-amber',
  'low':       'text-accent-red',
}

export default function SummaryTab({ project: p, onUpdated }: Props) {
  return (
    <div className="space-y-6 max-w-2xl">

      {/* Next Action — top priority field */}
      <div className="p-4 rounded-xl border border-accent-blue/20 bg-accent-blue/5">
        <Label>
          <span className="text-accent-blue">Next Action</span>
        </Label>
        <EditableText
          value={p.next_action ?? ''}
          placeholder="What's the immediate next step?"
          onSave={v => patch(p.id, { next_action: v }, onUpdated)}
          className="text-sm text-text-primary"
        />
      </div>

      {/* Blockers */}
      {(p.blockers || true) && (
        <div>
          <Label>Blockers</Label>
          <EditableTextarea
            value={p.blockers ?? ''}
            placeholder="Any blockers or dependencies? Click to add…"
            onSave={v => patch(p.id, { blockers: v }, onUpdated)}
            emptyClass={p.blockers ? 'text-accent-red' : undefined}
          />
        </div>
      )}

      {/* Description */}
      <div>
        <Label>Description</Label>
        <EditableTextarea
          value={p.description ?? ''}
          placeholder="Click to add description…"
          onSave={v => patch(p.id, { description: v }, onUpdated)}
        />
      </div>

      {/* Status, Priority, Confidence */}
      <div className="grid grid-cols-3 gap-4">
        <SelectField
          label="Status"
          value={p.status}
          options={STATUS_OPTIONS}
          onSave={v => patch(p.id, { status: v }, onUpdated)}
        />
        <SelectField
          label="Priority"
          value={p.priority}
          options={PRIORITY_OPTIONS}
          onSave={v => patch(p.id, { priority: v }, onUpdated)}
        />
        <div>
          <Label>Confidence</Label>
          <select
            value={p.confidence || ''}
            onChange={e => patch(p.id, { confidence: e.target.value }, onUpdated)}
            className={`w-full bg-bg-elevated text-sm rounded-lg px-3 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-blue/50 cursor-pointer ${CONFIDENCE_COLORS[p.confidence ?? ''] ?? 'text-text-primary'}`}
          >
            {CONFIDENCE_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
          </select>
        </div>
      </div>

      {/* Category & Risk */}
      <div className="grid grid-cols-2 gap-4">
        <Row label="Category">
          <EditableText
            value={p.category || ''}
            placeholder="Add category…"
            onSave={v => patch(p.id, { category: v }, onUpdated)}
          />
        </Row>
        <SelectField
          label="Risk Level"
          value={p.risks || ''}
          options={RISK_OPTIONS}
          onSave={v => patch(p.id, { risks: v }, onUpdated)}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        {p.start_date && <Row label="Started"><span className="text-sm text-text-secondary">{p.start_date}</span></Row>}
        <Row label="Target">
          <EditableText
            value={p.target_date ?? ''}
            placeholder="TBD"
            onSave={v => patch(p.id, { target_date: v }, onUpdated)}
          />
        </Row>
      </div>

      {/* Milestone stats */}
      {p.milestones_total > 0 && (
        <div>
          <Label>Milestone Progress</Label>
          <div className="flex items-center gap-4 mt-1 text-sm text-text-secondary">
            <span>{p.milestones_done} done</span>
            {p.milestones_wip > 0 && <span>{p.milestones_wip} in progress</span>}
            <span>{p.milestones_total - p.milestones_done - p.milestones_wip} pending</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xxs font-semibold uppercase tracking-widest text-text-muted mb-1">{children}</div>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div>{children}</div>
    </div>
  )
}

function SelectField({ label, value, options, onSave }: {
  label: string; value: string; options: string[]; onSave: (v: string) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={e => onSave(e.target.value)}
        className="w-full bg-bg-elevated text-text-primary text-sm rounded-lg px-3 py-1.5 border border-border-subtle focus:outline-none focus:border-accent-blue/50 cursor-pointer"
      >
        {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    </div>
  )
}

function EditableText({ value, placeholder, onSave, className }: { value: string; placeholder?: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    if (draft.trim() !== value) onSave(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="bg-bg-elevated text-text-primary text-sm rounded px-2 py-0.5 border border-accent-blue/50 focus:outline-none w-full"
      />
    )
  }
  return (
    <button onClick={() => { setDraft(value); setEditing(true) }}
      className={`hover:underline underline-offset-2 decoration-border-subtle text-left ${className ?? 'text-sm text-text-secondary hover:text-text-primary'}`}>
      {value || <span className="text-text-muted italic font-normal">{placeholder || 'Click to edit…'}</span>}
    </button>
  )
}

function EditableTextarea({ value, placeholder, onSave, emptyClass }: { value: string; placeholder?: string; onSave: (v: string) => void; emptyClass?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    if (draft.trim() !== value) onSave(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        autoFocus rows={3}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        className="ios-input w-full resize-none text-sm leading-relaxed"
      />
    )
  }
  return (
    <button onClick={() => { setDraft(value); setEditing(true) }}
      className={`text-sm leading-relaxed text-left w-full hover:underline underline-offset-2 decoration-border-subtle ${value ? (emptyClass ?? 'text-text-secondary hover:text-text-primary') : 'text-text-muted italic hover:text-text-muted'}`}>
      {value || (placeholder || 'Click to add…')}
    </button>
  )
}

async function patch(id: string, updates: Record<string, string>, onUpdated: () => void) {
  try { await api.patch(`/projects/${id}`, updates); onUpdated() } catch (e) { console.error(e) }
}
