import { useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailSummary {
  id: string
  from: string
  fromAddress: string
  subject: string
  preview: string
  date: string
  isRead: boolean
  hasAttachment: boolean
  importance: string
}

interface EmailDetail extends EmailSummary {
  to: { name: string; address: string }[]
  body: string
  bodyType: string
}

// ── API helpers ───────────────────────────────────────────────────────────────

const token = () => localStorage.getItem('dd_token') || ''
const headers = () => ({ 'X-Session-Token': token(), 'Content-Type': 'application/json' })

async function fetchInbox(): Promise<EmailSummary[]> {
  const r = await fetch('/api/email/inbox?top=50', { headers: headers() })
  if (!r.ok) throw new Error(await r.text())
  const d = await r.json()
  return d.messages
}

async function fetchMessage(id: string): Promise<EmailDetail> {
  const r = await fetch(`/api/email/${id}`, { headers: headers() })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

async function markRead(id: string) {
  await fetch(`/api/email/${id}/read`, { method: 'POST', headers: headers() })
}

async function sendEmail(to: string, subject: string, body: string) {
  const r = await fetch('/api/email/send', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ to, subject, body, bodyType: 'HTML' }),
  })
  if (!r.ok) throw new Error(await r.text())
}

async function replyEmail(id: string, body: string) {
  const r = await fetch(`/api/email/${id}/reply`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ body, bodyType: 'HTML' }),
  })
  if (!r.ok) throw new Error(await r.text())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Compose modal ─────────────────────────────────────────────────────────────

function ComposeModal({
  onClose,
  replyTo,
  replySubject,
  replyMsgId,
}: {
  onClose: () => void
  replyTo?: string
  replySubject?: string
  replyMsgId?: string
}) {
  const [to, setTo] = useState(replyTo || '')
  const [subject, setSubject] = useState(replySubject ? `Re: ${replySubject.replace(/^Re: /i, '')}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!to.trim() || !subject.trim()) return
    setSending(true)
    setError('')
    try {
      if (replyMsgId) {
        await replyEmail(replyMsgId, body.replace(/\n/g, '<br>'))
      } else {
        await sendEmail(to.trim(), subject.trim(), body.replace(/\n/g, '<br>'))
      }
      onClose()
    } catch (e: any) {
      setError(e.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-panel border border-white/8 rounded-2xl w-full max-w-lg mx-4 mb-4 md:mb-0 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
          <span className="text-white font-semibold text-[15px]">{replyMsgId ? 'Reply' : 'New Message'}</span>
          <button onClick={onClose} className="text-white/35 hover:text-white/70 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-3 space-y-3">
          <input
            className="w-full bg-transparent text-white/80 text-[13px] border-b border-white/8 pb-2 outline-none placeholder-white/25"
            placeholder="To"
            value={to}
            onChange={e => setTo(e.target.value)}
          />
          <input
            className="w-full bg-transparent text-white/80 text-[13px] border-b border-white/8 pb-2 outline-none placeholder-white/25"
            placeholder="Subject"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          <textarea
            className="w-full bg-transparent text-white/80 text-[13px] outline-none placeholder-white/25 resize-none"
            placeholder="Message…"
            rows={8}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>
        {error && <p className="px-5 pb-2 text-red-400 text-[12px]">{error}</p>}
        <div className="px-5 py-4 border-t border-white/6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-white/45 hover:text-white/70 text-[13px] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim() || !subject.trim()}
            className="px-5 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 text-white text-[13px] font-medium transition-colors"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reading pane ──────────────────────────────────────────────────────────────

function ReadPane({
  msg,
  onReply,
}: {
  msg: EmailDetail
  onReply: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return
    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin: 0; padding: 16px; font-family: -apple-system, Inter, sans-serif;
                 font-size: 14px; line-height: 1.6; color: #d4d4d8; background: transparent; }
          a { color: #60a5fa; }
          img { max-width: 100%; height: auto; }
          blockquote { border-left: 3px solid #3f3f46; margin: 0; padding-left: 12px; color: #71717a; }
          pre { background: #18181b; padding: 12px; border-radius: 6px; overflow-x: auto; }
        </style>
      </head>
      <body>${msg.bodyType === 'html' ? msg.body : msg.body.replace(/\n/g, '<br>')}</body>
      </html>
    `)
    doc.close()
  }, [msg.body, msg.bodyType])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-white/6 shrink-0">
        <h2 className="text-white font-semibold text-[16px] leading-snug mb-2">{msg.subject}</h2>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-white/75 text-[13px] font-medium">{msg.from}</span>
            <span className="text-white/35 text-[12px] ml-1.5">&lt;{msg.fromAddress}&gt;</span>
          </div>
          <span className="text-white/35 text-[12px]">{new Date(msg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        {msg.to?.length > 0 && (
          <p className="text-white/30 text-[12px] mt-0.5">
            To: {msg.to.map(r => r.name || r.address).join(', ')}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin"
          className="w-full h-full border-0"
          title="email-body"
        />
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-white/6 shrink-0 flex gap-2">
        <button
          onClick={onReply}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/6 hover:bg-white/10 text-white/70 hover:text-white text-[13px] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          Reply
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Email() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [messages, setMessages] = useState<EmailSummary[]>([])
  const [selected, setSelected] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [compose, setCompose] = useState(false)
  const [replyData, setReplyData] = useState<{ to: string; subject: string; id: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const r = await fetch('/api/email/status', { headers: headers() })
      const d = await r.json()
      setConnected(d.connected)
      setAccount(d.account)
      if (d.connected) loadInbox()
    } catch {
      setConnected(false)
    }
  }

  async function loadInbox() {
    setLoading(true)
    setError('')
    try {
      const msgs = await fetchInbox()
      setMessages(msgs)
    } catch (e: any) {
      setError(e.message || 'Failed to load inbox')
    } finally {
      setLoading(false)
    }
  }

  async function openMessage(msg: EmailSummary) {
    setLoadingMsg(true)
    try {
      const detail = await fetchMessage(msg.id)
      setSelected(detail)
      if (!msg.isRead) {
        await markRead(msg.id)
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load message')
    } finally {
      setLoadingMsg(false)
    }
  }

  function handleReply() {
    if (!selected) return
    setReplyData({ to: selected.fromAddress, subject: selected.subject, id: selected.id })
  }

  function closeCompose() {
    setCompose(false)
    setReplyData(null)
  }


  // ── Not connected ──────────────────────────────────────────────────────────

  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold text-[17px] mb-1.5">Connect via Power Automate</p>
          <p className="text-white/40 text-[13px]">No credentials needed — set up a flow in your work account.</p>
        </div>
        <div className="bg-white/4 border border-white/8 rounded-xl px-5 py-4 text-left w-full space-y-3">
          <p className="text-white/60 text-[12px] font-semibold uppercase tracking-wide">Setup steps</p>
          {[
            ['1', 'Go to make.powerautomate.com with your work account'],
            ['2', 'New flow → Automated → Trigger: "When a new email arrives" (Outlook)'],
            ['3', 'Add action: HTTP → POST to your ngrok URL + /api/webhook/email'],
            ['4', 'Map email fields in the body (see comments in webhook_email.py)'],
            ['5', 'For replies: add another flow with HTTP trigger → "Send an email"'],
            ['6', 'Paste that flow\'s URL into config.json as "pa_send_email_url"'],
          ].map(([n, txt]) => (
            <div key={n} className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[11px] font-bold flex items-center justify-center">{n}</span>
              <span className="text-white/50 text-[12px] leading-relaxed">{txt}</span>
            </div>
          ))}
        </div>
        <button
          onClick={checkStatus}
          className="px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/70 text-[14px] transition-colors"
        >
          Check again
        </button>
      </div>
    )
  }

  const unread = messages.filter(m => !m.isRead).length

  // ── Connected ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* Inbox list */}
      <div className={`flex flex-col shrink-0 border-r border-white/6 ${selected ? 'hidden md:flex w-72 lg:w-80' : 'flex w-full md:w-72 lg:w-80'}`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
          <div>
            <span className="text-white font-semibold text-[15px]">Inbox</span>
            {unread > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={loadInbox}
              disabled={loading}
              className="p-1.5 rounded-lg text-white/35 hover:text-white/65 hover:bg-white/5 transition-colors"
              title="Refresh list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
            <button
              onClick={() => setCompose(true)}
              className="p-1.5 rounded-lg text-white/35 hover:text-white/65 hover:bg-white/5 transition-colors"
              title="Compose"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <p className="px-4 py-2 text-red-400 text-[12px]">{error}</p>}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-white/15 border-t-blue-400 animate-spin" />
            </div>
          )}
          {messages.map(msg => (
            <button
              key={msg.id}
              onClick={() => openMessage(msg)}
              className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/4 transition-colors ${selected?.id === msg.id ? 'bg-white/6' : ''}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  {!msg.isRead && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  <span className={`text-[13px] truncate ${msg.isRead ? 'text-white/55 font-normal' : 'text-white font-semibold'}`}>
                    {msg.from}
                  </span>
                </div>
                <span className="text-white/30 text-[11px] shrink-0 ml-2">{formatDate(msg.date)}</span>
              </div>
              <p className={`text-[13px] truncate mb-0.5 ${msg.isRead ? 'text-white/40' : 'text-white/80'}`}>{msg.subject}</p>
              <p className="text-[12px] text-white/28 truncate leading-tight">{msg.preview}</p>
            </button>
          ))}
          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-white/25 text-[13px]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Inbox is empty
            </div>
          )}
        </div>

        {/* Account footer */}
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center shrink-0">
          <span className="text-white/25 text-[11px] truncate">{account}</span>
        </div>
      </div>

      {/* Reading pane */}
      {selected && (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="md:hidden flex items-center px-4 py-3 border-b border-white/6 shrink-0">
            <button onClick={() => setSelected(null)} className="text-blue-400 text-[14px] flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              Inbox
            </button>
          </div>
          {loadingMsg ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-5 h-5 rounded-full border-2 border-white/15 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <ReadPane msg={selected} onReply={handleReply} />
          )}
        </div>
      )}

      {/* Empty state when no message selected (desktop) */}
      {!selected && (
        <div className="hidden md:flex flex-1 items-center justify-center text-white/20 text-[14px] flex-col gap-3">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Select a message to read
        </div>
      )}

      {/* Compose / reply modal */}
      {(compose || replyData) && (
        <ComposeModal
          onClose={closeCompose}
          replyTo={replyData?.to}
          replySubject={replyData?.subject}
          replyMsgId={replyData?.id}
        />
      )}
    </div>
  )
}
