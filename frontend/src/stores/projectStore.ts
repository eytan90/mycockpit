import { create } from 'zustand'
import { api } from '../api/client'

export interface Milestone {
  index: number
  title: string
  done: boolean
  owner?: string
  start?: string
  due?: string
  status?: string
}

export interface Project {
  id: string
  name: string
  status: string
  progress: number
  owner?: string
  team: string[]
  start_date?: string
  target_date?: string
  priority: string
  category?: string
  description?: string
  goals: string[]
  risks?: string
  next_action?: string
  blockers?: string
  confidence?: string
  milestones: Milestone[]
  milestones_total: number
  milestones_done: number
  milestones_wip: number
  calculated_progress?: number
}

interface ProjectStore {
  projects: Project[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null
  fetch: () => Promise<void>
  invalidate: () => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetch: async () => {
    if (get().isLoading) return
    set({ isLoading: true, error: null })
    try {
      const projects = await api.get<Project[]>('/projects')
      set({ projects, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  invalidate: () => set({ lastFetched: null }),
}))
