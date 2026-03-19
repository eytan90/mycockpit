import { create } from 'zustand'
import { api } from '../api/client'

export interface Goal {
  id: string
  title: string
  status: string
  horizon?: string
  area?: string
  linked_projects: string[]
}

interface GoalStore {
  goals: Goal[]
  isLoading: boolean
  lastFetched: number | null
  fetch: () => Promise<void>
  invalidate: () => void
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: [],
  isLoading: false,
  lastFetched: null,

  fetch: async () => {
    if (get().isLoading) return
    set({ isLoading: true })
    try {
      const data = await api.get<Goal[]>('/goals')
      set({ goals: data, lastFetched: Date.now() })
    } catch (e) {
      console.error('goalStore fetch error', e)
    } finally {
      set({ isLoading: false })
    }
  },

  invalidate: () => set({ lastFetched: null }),
}))
