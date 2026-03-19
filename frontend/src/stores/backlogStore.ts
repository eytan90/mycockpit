import { create } from 'zustand'
import { api } from '../api/client'

export interface Task {
  id: string
  title: string
  status: string
  area?: string
  project_ref?: string
  notes?: string
  priority?: string
  due?: string
}

interface BacklogStore {
  tasks: Task[]
  isLoading: boolean
  lastFetched: number | null
  fetch: () => Promise<void>
  invalidate: () => void
}

export const useBacklogStore = create<BacklogStore>((set, get) => ({
  tasks: [],
  isLoading: false,
  lastFetched: null,

  fetch: async () => {
    if (get().isLoading) return
    set({ isLoading: true })
    try {
      const data = await api.get<Task[]>('/backlog')
      set({ tasks: data, lastFetched: Date.now() })
    } catch (e) {
      console.error('backlogStore fetch error', e)
    } finally {
      set({ isLoading: false })
    }
  },

  invalidate: () => set({ lastFetched: null }),
}))
