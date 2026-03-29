import { useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskList {
  id: string
  name: string
  isOwner: boolean
}

interface Task {
  id: string
  title: string
  status: string
  completed: boolean
  dueDate: string | null
  importance: string
  createdAt: string
}

// ── API helpers ───────────────────────────────────────────────────────────────

const token = () => localStorage.getItem('dd_token') || ''
const headers = () => ({ 'X-Session-Token': token(), 'Content-Type': 'application/json' })

async function fetchLists(): Promise<TaskList[]> {
  const r = await fetch('/api/ms-tasks/lists', { headers: headers() })
  if (!r.ok) throw new Error(await r.text())
  const d = await r.json()
  return d.lists
}

async function fetchTasks(listId: string): Promise<Task[]> {
  const r = await fetch(`/api/ms-tasks/lists/${listId}/tasks`, { headers: headers() })
  if (!r.ok) throw new Error(await r.text())
  const d = await r.json()
  return d.tasks
}

async function createTask(listId: string, title: string, dueDate?: string): Promise<Task> {
  const r = await fetch(`/api/ms-tasks/lists/${listId}/tasks`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ title, dueDate: dueDate || null }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

async function updateTask(listId: string, taskId: string, patch: Partial<{ title: string; completed: boolean; dueDate: string; importance: string }>) {
  const r = await fetch(`/api/ms-tasks/lists/${listId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(await r.text())
}

async function deleteTask(listId: string, taskId: string) {
  const r = await fetch(`/api/ms-tasks/lists/${listId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!r.ok) throw new Error(await r.text())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function importanceDot(importance: string) {
  if (importance === 'high') return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="High importance" />
  if (importance === 'low') return <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" title="Low importance" />
  return null
}

function formatDue(date: string | null): string {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return 'Overdue'
  if (diff === 0) return 'Today'
  if (diff === 86400000) return 'Tomorrow'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function dueColor(date: string | null): string {
  if (!date) return 'text-white/30'
  const d = new Date(date + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return 'text-red-400'
  if (diff === 0) return 'text-amber-400'
  return 'text-white/35'
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  listId,
  onUpdate,
  onDelete,
}: {
  task: Task
  listId: string
  onUpdate: (updated: Task) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function handleToggle() {
    const next = !task.completed
    onUpdate({ ...task, completed: next, status: next ? 'completed' : 'notStarted' })
    await updateTask(listId, task.id, { completed: next })
  }

  async function handleTitleSave() {
    if (!title.trim()) { setTitle(task.title); setEditing(false); return }
    if (title === task.title) { setEditing(false); return }
    setSaving(true)
    onUpdate({ ...task, title })
    await updateTask(listId, task.id, { title })
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    onDelete(task.id)
    await deleteTask(listId, task.id)
  }

  return (
    <div className={`group flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/3 transition-colors ${task.completed ? 'opacity-45' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          task.completed ? 'bg-blue-500 border-blue-500' : 'border-white/25 hover:border-blue-400'
        }`}
      >
        {task.completed && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setTitle(task.title); setEditing(false) } }}
            className="w-full bg-transparent text-white/90 text-[14px] outline-none border-b border-blue-400/60 pb-0.5"
            disabled={saving}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className={`text-[14px] cursor-text leading-snug ${task.completed ? 'line-through text-white/35' : 'text-white/80'}`}
          >
            {task.title}
          </span>
        )}
        {task.dueDate && !editing && (
          <p className={`text-[11px] mt-0.5 ${dueColor(task.dueDate)}`}>{formatDue(task.dueDate)}</p>
        )}
      </div>

      {/* Importance dot */}
      {importanceDot(task.importance)}

      {/* Delete (hover) */}
      <button
        onClick={handleDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400 transition-all"
        title="Delete task"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}

// ── Add task row ──────────────────────────────────────────────────────────────

function AddTaskRow({ listId, onAdd }: { listId: string; onAdd: (task: Task) => void }) {
  const [active, setActive] = useState(false)
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  async function handleAdd() {
    if (!title.trim()) { setActive(false); setTitle(''); return }
    setAdding(true)
    try {
      const task = await createTask(listId, title.trim())
      onAdd(task)
      setTitle('')
      inputRef.current?.focus()
    } finally {
      setAdding(false)
    }
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="w-full flex items-center gap-3 px-4 py-3 text-white/30 hover:text-white/55 hover:bg-white/3 transition-colors text-[14px]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add task
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/3">
      <div className="shrink-0 w-5 h-5 rounded-full border-2 border-white/15" />
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setActive(false); setTitle('') } }}
        onBlur={() => { if (!title.trim()) setActive(false) }}
        placeholder="Task title…"
        disabled={adding}
        className="flex-1 bg-transparent text-white/90 text-[14px] outline-none placeholder-white/25"
      />
      <button
        onClick={handleAdd}
        disabled={adding || !title.trim()}
        className="shrink-0 text-blue-400 hover:text-blue-300 disabled:opacity-30 transition-colors text-[13px] font-medium"
      >
        {adding ? '…' : 'Add'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MSTasks() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [lists, setLists] = useState<TaskList[]>([])
  const [selectedList, setSelectedList] = useState<string>('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [error, setError] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const r = await fetch('/api/oauth/status', { headers: headers() })
      const d = await r.json()
      setConnected(d.connected)
      if (d.connected) loadLists()
    } catch {
      setConnected(false)
    }
  }

  async function loadLists() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchLists()
      setLists(data)
      if (data.length > 0) {
        const defaultList = data.find(l => l.name === 'Tasks') || data[0]
        setSelectedList(defaultList.id)
        loadTasksFor(defaultList.id)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load task lists')
    } finally {
      setLoading(false)
    }
  }

  async function loadTasksFor(listId: string) {
    setLoadingTasks(true)
    setError('')
    try {
      const data = await fetchTasks(listId)
      setTasks(data)
    } catch (e: any) {
      setError(e.message || 'Failed to load tasks')
    } finally {
      setLoadingTasks(false)
    }
  }

  function handleListChange(listId: string) {
    setSelectedList(listId)
    setTasks([])
    loadTasksFor(listId)
  }

  function handleUpdateTask(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  function handleDeleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  function handleAddTask(task: Task) {
    setTasks(prev => [task, ...prev])
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
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-2">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <p className="text-white font-semibold text-[17px]">Connect Microsoft Account</p>
        <p className="text-white/40 text-[14px] max-w-xs">Sign in to access your Microsoft To Do task lists.</p>
        <a
          href="/api/oauth/login"
          className="mt-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-medium text-[15px] transition-colors"
        >
          Sign in with Microsoft
        </a>
      </div>
    )
  }

  const activeTasks = tasks.filter(t => !t.completed)
  const completedTasks = tasks.filter(t => t.completed)
  const currentListName = lists.find(l => l.id === selectedList)?.name || 'Tasks'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0 border-b border-white/6">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-semibold text-[17px]">{currentListName}</h1>
          <button
            onClick={() => loadTasksFor(selectedList)}
            disabled={loadingTasks}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingTasks ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>

        {/* List selector */}
        {lists.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {lists.map(lst => (
              <button
                key={lst.id}
                onClick={() => handleListChange(lst.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                  lst.id === selectedList
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-white/5 text-white/40 hover:text-white/65 border border-transparent'
                }`}
              >
                {lst.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="px-5 py-2 text-red-400 text-[12px] shrink-0">{error}</p>}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {loadingTasks && tasks.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 rounded-full border-2 border-white/15 border-t-blue-400 animate-spin" />
          </div>
        )}

        {/* Active tasks */}
        {selectedList && (
          <AddTaskRow listId={selectedList} onAdd={handleAddTask} />
        )}

        {activeTasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            listId={selectedList}
            onUpdate={handleUpdateTask}
            onDelete={handleDeleteTask}
          />
        ))}

        {!loadingTasks && activeTasks.length === 0 && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-white/20 text-[13px]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            No tasks — add one above
          </div>
        )}

        {/* Completed section */}
        {completedTasks.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-white/30 hover:text-white/50 text-[12px] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Completed ({completedTasks.length})
            </button>
            {showCompleted && completedTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                listId={selectedList}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {!loadingTasks && tasks.length > 0 && (
        <div className="px-5 py-2.5 border-t border-white/5 shrink-0">
          <p className="text-white/20 text-[11px]">
            {activeTasks.length} remaining{completedTasks.length > 0 ? ` · ${completedTasks.length} completed` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
