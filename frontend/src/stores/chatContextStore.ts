import { create } from 'zustand'

interface ChatContext {
  type: 'project' | 'task' | 'idea'
  label: string      // short display name shown as badge
  message: string    // the full message auto-sent to Claude
}

interface ChatContextStore {
  pending: ChatContext | null
  set: (ctx: ChatContext) => void
  clear: () => void
}

export const useChatContextStore = create<ChatContextStore>(set => ({
  pending: null,
  set:   ctx  => set({ pending: ctx }),
  clear: ()   => set({ pending: null }),
}))
