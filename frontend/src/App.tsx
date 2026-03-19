import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import { useVaultSync } from './hooks/useVaultSync'
import Home from './modes/Home/Home'
import Focus from './modes/Focus/Focus'
import Projects from './modes/Projects/Projects'
import Ideas from './modes/Ideas/Ideas'
import Plan from './modes/Plan/Plan'
import Settings from './modes/Settings/Settings'
import Chat from './modes/Chat/Chat'

function useAuthGuard() {
  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (isLocal) return
    const token = localStorage.getItem('dd_token')
    if (!token) {
      window.location.href = '/login'
    }
  }, [])
}

export default function App() {
  useAuthGuard()
  useVaultSync()
  return (
    <div className="flex h-full bg-bg-base overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <main className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <Routes>
            <Route path="/"             element={<Home />} />
            <Route path="/focus"        element={<Focus />} />
            <Route path="/projects"     element={<Projects />} />
            <Route path="/projects/:id" element={<Projects />} />
            <Route path="/ideas"        element={<Ideas />} />
            <Route path="/plan"         element={<Plan />} />
            {/* Legacy redirects */}
            <Route path="/planning"     element={<Navigate to="/plan" replace />} />
            <Route path="/organize"     element={<Navigate to="/plan" replace />} />
            <Route path="/delegate"     element={<Navigate to="/plan" replace />} />
            <Route path="/chat"         element={<Chat />} />
            <Route path="/settings"     element={<Settings />} />
          </Routes>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
