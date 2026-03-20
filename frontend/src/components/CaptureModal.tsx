import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useInboxStore } from '../stores/inboxStore'
import { useToast } from './Toast'

interface Props { onClose: () => void }

export default function CaptureModal({ onClose }: Props) {
  const invalidate = useInboxStore(s => s.invalidate)
  const toast = useToast()
  const [text, setText]     = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 100)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function save() {
    const t = text.trim()
    if (!t || status !== 'idle') return
    setStatus('saving')
    try {
      await api.post('/inbox', { text: t })
      invalidate()
      toast.success('Captured to inbox')
      setStatus('done')
      setTimeout(onClose, 750)
    } catch {
      toast.error('Failed to capture')
      setStatus('idle')
    }
  }

  return (
    <div
      className="capture-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="capture-sheet">
        {/* Handle */}
        <div className="flex justify-center mb-5">
          <div className="w-10 h-1.5 rounded-full bg-zinc-700" />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Capture a thought</h2>
          <button
            onClick={onClose}
            aria-label="Close capture modal"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Input */}
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
          placeholder="What's on your mind?"
          rows={4}
          className="ios-input resize-none leading-relaxed mb-4"
          style={{ minHeight: 120 }}
          disabled={status !== 'idle'}
        />

        {/* Save */}
        <button
          onClick={save}
          disabled={!text.trim() || status !== 'idle'}
          className="btn-primary w-full h-12 text-[15px]"
          style={status === 'done' ? { background: '#22C55E', boxShadow: '0 4px 16px rgba(34,197,94,0.35)' } : {}}
        >
          {status === 'saving' ? 'Saving…' : status === 'done' ? '✓ Saved to inbox' : 'Save to Inbox'}
        </button>

        <p className="text-center text-xs text-zinc-600 mt-3 hidden md:block">⌘ + Enter to save</p>
      </div>
    </div>
  )
}
