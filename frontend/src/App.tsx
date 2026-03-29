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
import Email from './modes/Email/Email'
import MSTasks from './modes/Tasks/MSTasks'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

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
    <ToastProvider>
      <div className="flex h-full bg-bg-base overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <main className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Routes>
              <Route path="/"             element={<ErrorBoundary><Home /></ErrorBoundary>} />
              <Route path="/focus"        element={<ErrorBoundary><Focus /></ErrorBoundary>} />
              <Route path="/projects"     element={<ErrorBoundary><Projects /></ErrorBoundary>} />
              <Route path="/projects/:id" element={<ErrorBoundary><Projects /></ErrorBoundary>} />
              <Route path="/ideas"        element={<ErrorBoundary><Ideas /></ErrorBoundary>} />
              <Route path="/plan"         element={<ErrorBoundary><Plan /></ErrorBoundary>} />
              {/* Legacy redirects */}
              <Route path="/planning"     element={<Navigate to="/plan" replace />} />
              <Route path="/organize"     element={<Navigate to="/plan" replace />} />
              <Route path="/delegate"     element={<Navigate to="/plan" replace />} />
              <Route path="/chat"         element={<ErrorBoundary><Chat /></ErrorBoundary>} />
              <Route path="/email"        element={<ErrorBoundary><Email /></ErrorBoundary>} />
              <Route path="/ms-tasks"     element={<ErrorBoundary><MSTasks /></ErrorBoundary>} />
              <Route path="/settings"     element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Routes>
          </main>
        </div>
        <MobileNav />
      </div>
    </ToastProvider>
  )
}
