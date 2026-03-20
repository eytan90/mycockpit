import { useEffect, useState } from 'react'
import type { Project } from '../stores/projectStore'
import { useProjectStore } from '../stores/projectStore'
import { api } from '../api/client'
import { useToast } from './Toast'

interface Props {
  project: Project
  onClose: () => void
  onUpdated: () => void
}

type EditableFields = {
  status: string
  priority: string
  progress: number
  owner: string
  target_date: string
  next_action: string
  blockers: string
  confidence: string
  description: string
  risks: string
  category: string
}

export default function ProjectEditDrawer({ project: p, onClose, onUpdated }: Props) {
  const toast = useToast()
  const { projects, invalidate } = useProjectStore()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<EditableFields>({
    status:      p.status,
    priority:    p.priority,
    progress:    p.progress,
    owner:       p.owner ?? '',
    target_date: p.target_date ?? '',
    next_action: p.next_action ?? '',
    blockers:    p.blockers ?? '',
    confidence:  p.confidence ?? '',
    description: p.description ?? '',
    risks:       p.risks ?? '',
    category:    p.category ?? '',
  })

  // Escape key closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  function set<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    // Build diff
    const diff: Record<string, string | number> = {}
    if (form.status      !== p.status)           diff.status      = form.status
    if (form.priority    !== p.priority)         diff.priority    = form.priority
    if (form.progress    !== p.progress)         diff.progress    = form.progress
    if (form.owner       !== (p.owner ?? ''))    diff.owner       = form.owner
    if (form.target_date !== (p.target_date ?? '')) diff.target_date = form.target_date
    if (form.next_action !== (p.next_action ?? '')) diff.next_action = form.next_action
    if (form.blockers    !== (p.blockers ?? '')) diff.blockers    = form.blockers
    if (form.confidence  !== (p.confidence ?? '')) diff.confidence  = form.confidence
    if (form.description !== (p.description ?? '')) diff.description = form.description
    if (form.risks       !== (p.risks ?? ''))    diff.risks       = form.risks
    if (form.category    !== (p.category ?? '')) diff.category    = form.category

    if (Object.keys(diff).length === 0) { onClose(); return }

    try {
      await api.patch(`/projects/${p.id}`, diff)
      invalidate()
      onUpdated()
      toast.success('Project updated')
      onClose()
    } catch (e) {
      toast.error('Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200]"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[201] flex flex-col overflow-hidden md:w-[420px] w-full"
        style={{
          background: '#1C1C1F',
          borderLeft: '1px solid #27272B',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#27272B' }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">Editing</p>
            <p className="text-base font-semibold text-white truncate">{p.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close edit drawer"
            className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-500 hover:text-white transition-colors ml-3 shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select className="ios-input cursor-pointer" value={form.status} onChange={e => set('status', e.target.value)}>
                {['planning','in-progress','waiting','stalled','done','cancelled'].map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </Field>

            <Field label="Priority">
              <select className="ios-input cursor-pointer" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {['high','medium','low'].map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence">
              <select className="ios-input cursor-pointer" value={form.confidence} onChange={e => set('confidence', e.target.value)}>
                <option value="">—</option>
                {['high','medium','low'].map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </Field>

            <Field label="Progress (0–100)">
              <input
                type="number"
                min={0} max={100}
                className="ios-input"
                value={form.progress}
                onChange={e => set('progress', Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Owner">
            <input className="ios-input" value={form.owner} onChange={e => set('owner', e.target.value)} placeholder="e.g. Eytan" />
          </Field>

          <Field label="Target Date">
            <input type="date" className="ios-input" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
          </Field>

          <Field label="Category">
            <input className="ios-input" value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Hardware" />
          </Field>

          <Field label="Next Action">
            <input className="ios-input" value={form.next_action} onChange={e => set('next_action', e.target.value)} placeholder="Next step…" />
          </Field>

          <Field label="Blockers">
            <input className="ios-input" value={form.blockers} onChange={e => set('blockers', e.target.value)} placeholder="Anything blocking?" />
          </Field>

          <Field label="Description">
            <textarea
              className="ios-input resize-none"
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Project description…"
            />
          </Field>

          <Field label="Risks">
            <textarea
              className="ios-input resize-none"
              rows={2}
              value={form.risks}
              onChange={e => set('risks', e.target.value)}
              placeholder="Known risks…"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex gap-3" style={{ borderColor: '#27272B' }}>
          <button onClick={onClose} className="ios-btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
