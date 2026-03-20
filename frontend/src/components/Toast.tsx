import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((message: string, variant: ToastVariant) => {
    const id = nextId++
    setToasts(prev => {
      const next = [...prev, { id, message, variant }]
      return next.slice(-3) // max 3
    })
    const delay = variant === 'error' ? 5000 : 3500
    setTimeout(() => remove(id), delay)
  }, [remove])

  const value: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error:   (msg) => add(msg, 'error'),
    info:    (msg) => add(msg, 'info'),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div
        className="fixed z-[9999] flex flex-col gap-2 pointer-events-none"
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          right: 16,
          left: 'auto',
          maxWidth: 360,
          width: 'calc(100vw - 32px)',
        }}
      >
        {toasts.map(t => (
          <ToastBubble key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const variantStyle: Record<ToastVariant, { icon: string; accent: string }> = {
    success: { icon: '✓', accent: '#22C55E' },
    error:   { icon: '✕', accent: '#EF4444' },
    info:    { icon: 'i', accent: '#3B82F6' },
  }
  const { icon, accent } = variantStyle[toast.variant]

  return (
    <div
      onClick={onDismiss}
      className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
      style={{
        background: '#1C1C1F',
        border: '1px solid #27272B',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease',
      }}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
        style={{ background: `${accent}22`, color: accent }}
      >
        {icon}
      </div>
      <p className="text-sm text-white font-medium flex-1 leading-snug">{toast.message}</p>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
