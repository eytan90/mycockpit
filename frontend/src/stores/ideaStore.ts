import { create } from 'zustand'
import { api } from '../api/client'

export interface Idea {
  index: number
  title: string
  raw_line: string
  section: string
  area?: string
  effort?: string
  from_?: string
  stage?: string
  added?: string
  done: boolean
  graduated: boolean
  maturity: number
  mat_label: string
  mat_color: string
}

interface IdeaStore {
  ideas: Idea[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null
  fetch: () => Promise<void>
  invalidate: () => void
}

export const useIdeaStore = create<IdeaStore>((set, get) => ({
  ideas: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetch: async () => {
    if (get().isLoading) return
    set({ isLoading: true, error: null })
    try {
      const ideas = await api.get<Idea[]>('/ideas')
      set({ ideas, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  invalidate: () => set({ lastFetched: null }),
}))
