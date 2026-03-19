import { useState } from 'react'
import { api } from '../api/client'
import { useInboxStore } from '../stores/inboxStore'

export default function TopBar() {
  const invalidateInbox = useInboxStore(s => s.invalidate)
  const [capturing, setCapturing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCapture() {
    if (!text.trim()) return
    setSaving(true)
    try {
      await api.post('/inbox', { text: text.trim() })
      setText('')
      setCapturing(false)
      invalidateInbox()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <header className="h-11 hidden md:flex items-center px-4 gap-3 glass-topbar shrink-0 z-40">
      <span className="md:hidden text-white font-bold text-[15px] tracking-tight">MyCockpit</span>

      <div className="flex-1 max-w-sm hidden sm:block">
        <input
          type="text"
          placeholder="Search…"
          className="ios-input w-full text-[15px] h-8"
          style={{ padding: '6px 12px', fontSize: '14px' }}
        />
      </div>

      <div className="ml-auto flex items-center">
        {capturing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCapture(); if (e.key === 'Escape') setCapturing(false) }}
              placeholder="Capture a thought…"
              className="ios-input w-52 h-8"
              style={{ padding: '6px 12px', fontSize: '14px' }}
            />
            <button onClick={handleCapture} disabled={saving || !text.trim()} className="ios-btn-primary h-8 px-3 text-[13px]">
              {saving ? '…' : 'Add'}
            </button>
            <button onClick={() => setCapturing(false)} className="text-white/30 hover:text-white/60 px-1 text-[15px] transition-colors">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setCapturing(true)}
            className="flex items-center gap-1.5 text-accent-blue text-[15px] font-semibold hover:opacity-80 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Capture
          </button>
        )}
      </div>
    </header>
  )
}
