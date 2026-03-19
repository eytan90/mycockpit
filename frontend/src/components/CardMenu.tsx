import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  divider?: boolean
}

interface Props {
  items: MenuItem[]
  stopPropagation?: boolean
}

interface MenuPos { top: number; left: number; minWidth: number }

export default function CardMenu({ items, stopPropagation = true }: Props) {
  const [open, setOpen]     = useState(false)
  const [pos, setPos]       = useState<MenuPos | null>(null)
  const [above, setAbove]   = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef    = useRef<HTMLDivElement>(null)

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        menuRef.current   && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Close on scroll (so it doesn't trail behind)
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', () => setOpen(false), { capture: true, passive: true })
    return () => window.removeEventListener('scroll', () => setOpen(false), { capture: true })
  }, [open])

  function toggle(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation()
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const dropH = Math.min(items.length * 36 + 16, 300)
      const openAbove = r.bottom + dropH > window.innerHeight
      setAbove(openAbove)
      setPos({
        top:      openAbove ? r.top   : r.bottom + 4,
        left:     r.right - 168,   // right-align to trigger
        minWidth: 168,
      })
    }
    setOpen(v => !v)
  }

  const dropdown = open && pos ? createPortal(
    <div
      ref={menuRef}
      onClick={e => e.stopPropagation()}
      style={{
        position:   'fixed',
        top:        above ? undefined : pos.top,
        bottom:     above ? window.innerHeight - pos.top : undefined,
        left:       Math.max(8, pos.left),
        minWidth:   pos.minWidth,
        zIndex:     9999,
        background: '#2a2a2e',
        border:     '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        boxShadow:  '0 8px 40px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(24px)',
        padding:    '4px 0',
      }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && i > 0 && (
            <div style={{ margin: '4px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          )}
          <button
            disabled={item.disabled}
            onClick={e => {
              e.stopPropagation()
              if (!item.disabled) { item.onClick(); setOpen(false) }
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.danger ? '#f87171' : 'rgba(255,255,255,0.82)',
              opacity: item.disabled ? 0.35 : 1,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => {
              if (!item.disabled)
                (e.currentTarget as HTMLElement).style.background = item.danger
                  ? 'rgba(239,68,68,0.12)'
                  : 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div
      className="relative"
      onClick={stopPropagation ? e => e.stopPropagation() : undefined}
    >
      <button
        ref={triggerRef}
        onClick={toggle}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
          open
            ? 'bg-white/12 text-white'
            : 'text-white/30 hover:text-white/70 hover:bg-white/8 opacity-0 group-hover:opacity-100'
        }`}
        aria-label="More options"
        title="More options"
      >
        <DotsIcon />
      </button>

      {dropdown}
    </div>
  )
}

function DotsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <circle cx="3"   cy="7.5" r="1.4" />
      <circle cx="7.5" cy="7.5" r="1.4" />
      <circle cx="12"  cy="7.5" r="1.4" />
    </svg>
  )
}
