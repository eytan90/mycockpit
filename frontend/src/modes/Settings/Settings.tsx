import { useEffect, useState } from 'react'
import { useThemeStore, type Theme } from '../../stores/themeStore'
import { api } from '../../api/client'

const THEMES: { id: Theme; label: string; desc: string; accent: string; grad: string; bg: string }[] = [
  {
    id:     'dark',
    label:  'Dark',
    desc:   'Deep black with blue accents — the default.',
    accent: '#0A84FF',
    grad:   'linear-gradient(135deg, rgba(10,132,255,0.2) 0%, rgba(191,90,242,0.12) 100%)',
    bg:     '#09090B',
  },
  {
    id:     'vibrant',
    label:  'Vibrant',
    desc:   'Warm dark with orange accents — energetic.',
    accent: '#FF6B35',
    grad:   'linear-gradient(135deg, rgba(255,107,53,0.22) 0%, rgba(255,45,85,0.1) 100%)',
    bg:     '#09090B',
  },
  {
    id:     'zen-dark',
    label:  'Zen Dark',
    desc:   'Warm charcoal with sage green — calm focus.',
    accent: '#7AAE7A',
    grad:   'linear-gradient(135deg, rgba(122,174,122,0.18) 0%, rgba(180,160,120,0.10) 100%)',
    bg:     '#1A1916',
  },
  {
    id:     'zen-bright',
    label:  'Zen Bright',
    desc:   'Parchment white with deep sage — daylight clarity.',
    accent: '#4A7C59',
    grad:   'linear-gradient(135deg, rgba(74,124,89,0.15) 0%, rgba(180,160,120,0.12) 100%)',
    bg:     '#F0EDE6',
  },
  {
    id:     'zen-task',
    label:  'ZEN_TASK',
    desc:   'Editorial black & white. Sharp geometry, electric blue.',
    accent: '#1f41ff',
    grad:   'linear-gradient(135deg, rgba(31,65,255,0.12) 0%, rgba(0,0,0,0.05) 100%)',
    bg:     '#f9f9f9',
  },
]

export default function Settings() {
  const { theme, setTheme } = useThemeStore()
  const [version, setVersion] = useState<string>('…')

  useEffect(() => {
    api.get<{ version: string }>('/health').then(d => setVersion(d.version)).catch(() => {})
  }, [])

  return (
    <div className="ios-page">
      <div className="px-4 pt-7 pb-5 md:px-6">
        <h1 className="text-[34px] font-bold text-white tracking-tight leading-none">Settings</h1>
        <p className="text-[15px] text-text-secondary mt-1.5">Appearance & preferences</p>
      </div>

      {/* ── Theme ── */}
      <div className="mb-8">
        <p className="ios-section-label">Theme</p>
        <div className="mx-4 md:mx-6 flex flex-col gap-3">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="w-full text-left rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                background: t.bg,
                border: theme === t.id ? `1.5px solid ${t.accent}` : '1.5px solid rgba(128,128,128,0.15)',
                boxShadow: theme === t.id ? `0 0 20px ${t.accent}33` : 'none',
              }}
            >
              {/* Preview strip */}
              <div className="h-16 w-full" style={{ background: t.grad }}>
                <div className="flex items-center h-full px-4 gap-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-6 rounded-full" style={{
                      width: i === 1 ? 64 : i === 2 ? 48 : 80,
                      background: i === 1 ? t.accent : 'rgba(255,255,255,0.12)',
                      opacity: i === 1 ? 1 : 0.6,
                    }} />
                  ))}
                </div>
              </div>

              {/* Label row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: t.id === 'zen-bright' || t.id === 'zen-task' ? '#1A1816' : '#FAFAFA' }}>{t.label}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: t.id === 'zen-bright' || t.id === 'zen-task' ? '#6B6560' : '#A1A1AA' }}>{t.desc}</p>
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: theme === t.id ? t.accent : 'rgba(255,255,255,0.08)',
                  }}
                >
                  {theme === t.id && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Account ── */}
      <div className="mb-8">
        <p className="ios-section-label">Account</p>
        <div className="mx-4 md:mx-6 ios-grouped">
          <div className="ios-row">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-15)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ color: 'var(--accent)' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <p className="text-[15px] text-white font-medium">Eytan Perez</p>
              <p className="text-[12px] text-text-secondary">eytan.perez@dustphotonics.com</p>
            </div>
          </div>
          <div className="ios-row ios-row-press" onClick={() => {
            localStorage.removeItem('dd_token')
            window.location.href = '/login'
          }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/15">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="1.75"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </div>
            <p className="text-[15px] text-red-400 font-medium">Sign out</p>
          </div>
        </div>
      </div>

      {/* ── About ── */}
      <div className="mb-8">
        <p className="ios-section-label">About</p>
        <div className="mx-4 md:mx-6 ios-grouped">
          <div className="ios-row">
            <p className="text-[15px] text-text-secondary flex-1">Version</p>
            <p className="text-[15px] text-white font-mono">{version}</p>
          </div>
          <div className="ios-row">
            <p className="text-[15px] text-text-secondary flex-1">Vault</p>
            <p className="text-[13px] text-text-muted font-mono truncate max-w-[180px]">Dustphotonics/</p>
          </div>
        </div>
      </div>

    </div>
  )
}
