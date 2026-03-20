import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CaptureModal from './CaptureModal'

const LEFT_TABS  = [
  { path: '/',       label: 'Home',  icon: HomeIcon  },
  { path: '/focus',  label: 'Focus', icon: FocusIcon },
]
const RIGHT_TABS = [
  { path: '/projects', label: 'Projects', icon: ProjectsIcon },
  { path: '/chat',     label: 'Claude',   icon: ChatIcon     },
]

export default function MobileNav() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const [capture, setCapture] = useState(false)

  function isActive(path: string) {
    return path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
        aria-label="Main navigation"
      >
        <div className="nav-pill flex items-center px-2 py-2 pointer-events-auto w-[calc(100%-32px)] max-w-[500px]">

          {LEFT_TABS.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`nav-tab ${isActive(path) ? 'active' : ''}`}
              aria-label={`Navigate to ${label}`}
            >
              <span className="nav-tab-icon"><Icon /></span>
              <span className="nav-tab-label">{label}</span>
            </button>
          ))}

          {/* ── Center capture button ── */}
          <button
            className="nav-capture-btn"
            onClick={() => setCapture(true)}
            aria-label="Capture a thought"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {RIGHT_TABS.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`nav-tab ${isActive(path) ? 'active' : ''}`}
              aria-label={`Navigate to ${label}`}
            >
              <span className="nav-tab-icon"><Icon /></span>
              <span className="nav-tab-label">{label}</span>
            </button>
          ))}

        </div>
      </nav>

      {capture && <CaptureModal onClose={() => setCapture(false)} />}
    </>
  )
}

function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function FocusIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3.5"/></svg>
}
function ProjectsIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function ChatIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
}
