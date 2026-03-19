import { useEffect } from 'react'
import { createWebSocket } from '../api/client'
import { useProjectStore } from '../stores/projectStore'
import { useInboxStore } from '../stores/inboxStore'
import { useAttentionStore } from '../stores/attentionStore'
import { useIdeaStore } from '../stores/ideaStore'
import { useBacklogStore } from '../stores/backlogStore'
import { useGoalStore } from '../stores/goalStore'

/**
 * Opens a WebSocket connection and invalidates stores when vault files change.
 * Mount once at the App level.
 */
export function useVaultSync() {
  useEffect(() => {
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      try {
        ws = createWebSocket((data: unknown) => {
          const msg = data as { type: string; path?: string }
          if (msg.type === 'file_changed') {
            // Invalidate all stores — they'll refetch on next render
            useProjectStore.getState().invalidate()
            useInboxStore.getState().invalidate()
            useAttentionStore.getState().invalidate()
            useIdeaStore.getState().invalidate()
            useBacklogStore.getState().invalidate()
            useGoalStore.getState().invalidate()
          }
        })
        ws.onclose = () => {
          retryTimer = setTimeout(connect, 3000)
        }
      } catch {
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      ws?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])
}
