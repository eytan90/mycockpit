import { create } from 'zustand'
import { api } from '../api/client'

export interface AttentionItem {
  type: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  action?: string
  project_id?: string
  project_name?: string
}

export interface AttentionSummary {
  active_projects: number
  inbox_count: number
  ideas_needs_refinement: number
  ideas_ready_to_promote: number
}

interface AttentionStore {
  items: AttentionItem[]
  summary: AttentionSummary | null
  isLoading: boolean
  error: string | null
  lastFetched: number | null
  fetch: () => Promise<void>
  invalidate: () => void
}

export const useAttentionStore = create<AttentionStore>((set, get) => ({
  items: [],
  summary: null,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetch: async () => {
    if (get().isLoading) return
    set({ isLoading: true, error: null })
    try {
      const [items, summary] = await Promise.all([
        api.get<AttentionItem[]>('/attention'),
        api.get<AttentionSummary>('/attention/summary'),
      ])
      set({ items, summary, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  invalidate: () => set({ lastFetched: null }),
}))
