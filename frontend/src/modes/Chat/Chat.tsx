import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatContextStore } from '../../stores/chatContextStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: string[]   // object URLs for display
}

interface Attachment {
  file: File
  previewUrl?: string  // for images
}

const SUGGESTIONS = [
  "What's high priority right now?",
  "What's in my inbox?",
  "Summarize my active projects",
  "What's in progress?",
  "Add task: ",
  "Capture idea: ",
]

// ── Markdown components styled to match Claude.ai ────────────────────────────

const mdComponents = {
  p: ({ children }: any) => (
    <p className="mb-3 last:mb-0 leading-7">{children}</p>
  ),
  h1: ({ children }: any) => (
    <h1 className="text-xl font-semibold mb-3 mt-4 first:mt-0 text-white">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-white">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-semibold mb-2 mt-3 first:mt-0 text-white/90">{children}</h3>
  ),
  ul: ({ children }: any) => (
    <ul className="mb-3 space-y-1 pl-4">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="mb-3 space-y-1 pl-5 list-decimal">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-6 text-white/88 before:content-['·'] before:mr-2 before:text-white/30">{children}</li>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-white/80">{children}</em>
  ),
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="px-1.5 py-0.5 rounded text-[12.5px] font-mono" style={{ background: '#2d2d2d', color: '#e2e8f0' }}>
        {children}
      </code>
    ) : (
      <code>{children}</code>
    ),
  pre: ({ children }: any) => (
    <pre
      className="rounded-xl text-[13px] font-mono overflow-x-auto mb-3 mt-1"
      style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', lineHeight: 1.6 }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }: any) => (
    <blockquote
      className="pl-4 my-3 text-white/60 italic"
      style={{ borderLeft: '3px solid rgba(255,255,255,0.15)' }}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-white/10" />,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
      {children}
    </a>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="text-left px-3 py-2 text-white/60 text-xs uppercase tracking-wider font-semibold" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-2 text-white/80" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{children}</td>
  ),
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChatStatus {
  ready: boolean
  error: string | null
  has_context: boolean
  init_summary: string | null
}

export default function Chat() {
  const [messages, setMessages]      = useState<Message[]>([])
  const [input, setInput]            = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError]            = useState<string | null>(null)
  const [status, setStatus]          = useState<ChatStatus | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const bottomRef    = useRef<HTMLDivElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { pending, clear } = useChatContextStore()

  // Poll /status until ready
  useEffect(() => {
    let cancelled = false
    async function poll() {
      while (!cancelled) {
        try {
          const token = localStorage.getItem('dd_token') || ''
          const res = await fetch('/api/chat/status', {
            headers: token ? { 'X-Session-Token': token } : {},
          })
          const data: ChatStatus = await res.json()
          if (!cancelled) setStatus(data)
          if (data.ready) break
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 1500))
      }
    }
    poll()
    return () => { cancelled = true }
  }, [])

  // Auto-send context message when navigated from a card
  useEffect(() => {
    if (pending) {
      const msg = pending.message
      clear()
      setTimeout(() => send(msg), 80)
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  function addFiles(files: FileList | null) {
    if (!files) return
    const newAttachments: Attachment[] = Array.from(files).map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }))
    setAttachments(prev => [...prev, ...newAttachments])
  }

  function removeAttachment(index: number) {
    setAttachments(prev => {
      const next = [...prev]
      if (next[index].previewUrl) URL.revokeObjectURL(next[index].previewUrl!)
      next.splice(index, 1)
      return next
    })
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if ((!msg && attachments.length === 0) || isStreaming) return

    const imageUrls = attachments.filter(a => a.previewUrl).map(a => a.previewUrl!)
    const userMsg: Message = { role: 'user', content: msg, images: imageUrls.length ? imageUrls : undefined }

    setInput('')
    setAttachments([])
    setError(null)
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setIsStreaming(true)

    setTimeout(() => textareaRef.current?.focus(), 50)

    try {
      const token = localStorage.getItem('dd_token') || ''
      const formData = new FormData()
      formData.append('message', msg)
      attachments.forEach(a => formData.append('files', a.file))

      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: token ? { 'X-Session-Token': token } : {},
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Request failed (${response.status})`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) {
              setMessages(prev => {
                const last = prev[prev.length - 1]
                return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }]
              })
            }
            if (parsed.tool_use) {
              const label = parsed.tool_use === 'read_file'
                ? `Reading ${parsed.input?.path ?? 'file'}…`
                : `Listing ${parsed.input?.folder ?? 'folder'}…`
              setMessages(prev => {
                const last = prev[prev.length - 1]
                // Append tool indicator inline in the assistant bubble
                const marker = `\n\n*${label}*\n\n`
                return [...prev.slice(0, -1), { ...last, content: last.content + marker }]
              })
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setMessages(prev => {
        const last = prev[prev.length - 1]
        return last?.role === 'assistant' && last.content === ''
          ? prev.slice(0, -1)
          : prev
      })
    } finally {
      setIsStreaming(false)
    }
  }

  async function clearChat() {
    setMessages([])
    setError(null)
    try {
      const token = localStorage.getItem('dd_token') || ''
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: token ? { 'X-Session-Token': token } : {},
      })
    } catch (e) {
      console.error('Failed to clear session', e)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleSuggestion(s: string) {
    if (s.endsWith(': ')) {
      setInput(s)
      setTimeout(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }, 0)
    } else {
      send(s)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div
        className="shrink-0 px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3">
          {/* Claude logo circle */}
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative"
            style={{ background: 'linear-gradient(135deg, #d97706 0%, #dc4a26 100%)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            {/* Ready dot */}
            <div
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
              style={{
                borderColor: '#1a1a1a',
                background: status === null ? '#555'
                  : !status.ready ? '#F59E0B'
                  : status.error  ? '#EF4444'
                  : '#22C55E',
              }}
            />
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: '#ececec' }}>Claude</span>
            <span className="ml-2 text-xs" style={{ color: '#666' }}>
              {isStreaming          ? 'Typing…'
               : status === null   ? 'Connecting…'
               : !status.ready     ? 'Initializing…'
               : status.error      ? 'Limited'
               :                    'Ready'}
            </span>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs px-3 py-1 rounded-lg transition-colors"
            style={{ color: '#666', background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-6 py-12">
            <div className="text-center max-w-sm">
              <p className="text-[22px] font-semibold mb-2" style={{ color: '#ececec' }}>
                {status?.ready ? 'What can I help with?' : 'Initializing…'}
              </p>
              {status?.init_summary ? (
                <div
                  className="text-left text-sm rounded-xl px-4 py-3 mb-1"
                  style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.07)', color: '#999', lineHeight: 1.6 }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {status.init_summary}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#555' }}>
                  {status?.ready ? 'Context loaded.' : 'Loading vault context…'}
                </p>
              )}
              {status?.error && (
                <p className="text-xs mt-2" style={{ color: '#f87171' }}>{status.error}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 w-full max-w-xs">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="w-full text-left text-sm px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                  style={{
                    background: '#2a2a2a',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#bbb',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#bbb' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #d97706 0%, #dc4a26 100%)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                  </div>
                )}

                <div className={`${msg.role === 'user' ? 'max-w-[75%]' : 'flex-1 min-w-0'}`}>
                  {msg.role === 'user' ? (
                    <div
                      className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words"
                      style={{ background: '#2f2f2f', border: '1px solid rgba(255,255,255,0.06)', color: '#ececec' }}
                    >
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.images.map((url, i) => (
                            <img key={i} src={url} alt="attachment" className="max-h-48 max-w-full rounded-lg object-contain" style={{ background: '#1a1a1a' }} />
                          ))}
                        </div>
                      )}
                      {msg.content}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: '#d1d1d1', lineHeight: 1.75 }}>
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : isStreaming && i === messages.length - 1 ? (
                        <span className="inline-flex gap-1 items-center h-5">
                          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#666', animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#666', animationDelay: '120ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#666', animationDelay: '240ms' }} />
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && <div className="w-7 shrink-0" />}
              </div>
            ))}

            {error && (
              <div className="flex justify-center">
                <span className="text-xs px-3 py-2 rounded-lg" style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </span>
              </div>
            )}

            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.md,.py,.js,.ts,.tsx,.jsx,.json,.csv,.yaml,.yml" className="hidden" onChange={e => addFiles(e.target.files)} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => addFiles(e.target.files)} />

      {/* Input bar — sits above the mobile nav pill */}
      <div
        className="shrink-0 px-4 pt-3"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="flex flex-col rounded-2xl max-w-3xl mx-auto"
          style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.file.name} className="h-16 w-16 object-cover rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                  ) : (
                    <div className="h-16 px-3 flex flex-col items-center justify-center rounded-lg gap-1" style={{ background: '#333', border: '1px solid rgba(255,255,255,0.1)', minWidth: '80px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="text-[10px] text-center truncate max-w-[72px]" style={{ color: '#888' }}>{att.file.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: '#555', border: '1px solid rgba(0,0,0,0.4)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-2.5">
            {/* Attach file */}
            <button
              onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click() } }}
              disabled={isStreaming}
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ color: '#666' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              title="Attach file"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            {/* Camera (mobile-friendly) */}
            <button
              onClick={() => { if (cameraInputRef.current) { cameraInputRef.current.value = ''; cameraInputRef.current.click() } }}
              disabled={isStreaming}
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ color: '#666' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              title="Take photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Claude…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-sm resize-none focus:outline-none disabled:opacity-50"
              style={{
                color: '#ececec',
                minHeight: '24px',
                maxHeight: '160px',
                lineHeight: '1.5',
                caretColor: '#fff',
              }}
            />
            <button
              onClick={() => send()}
              disabled={(!input.trim() && attachments.length === 0) || isStreaming}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: (input.trim() || attachments.length > 0) && !isStreaming ? '#fff' : 'rgba(255,255,255,0.12)',
                cursor: (input.trim() || attachments.length > 0) && !isStreaming ? 'pointer' : 'not-allowed',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke={(input.trim() || attachments.length > 0) && !isStreaming ? '#000' : '#555'}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
        </div>
        <p className="hidden md:block text-center mt-2 text-xs" style={{ color: '#444' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

    </div>
  )
}
