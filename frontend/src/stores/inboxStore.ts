import { create } from 'zustand'
import { api } from '../api/client'

interface InboxStore {
  items: string[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null
  fetch: () => Promise<void>
  invalidate: () => void
}

export const useInboxStore = create<InboxStore>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetch: async () => {
    if (get().isLoading) return
    set({ isLoading: true, error: null })
    try {
      const items = await api.get<string[]>('/inbox')
      set({ items, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  invalidate: () => set({ lastFetched: null }),
}))
