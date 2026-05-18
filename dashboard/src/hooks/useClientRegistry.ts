import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientInfo, CuratedEvent, DashboardMessage } from '@shared/types'

type UseClientRegistryOptions = {
  wsUrl: string
  onEvent?: (clientId: string, event: CuratedEvent) => void
  onEventsReset?: () => void
  onStateUpdated?: (clientId: string | undefined, capturedAt: string) => void
}

export function useClientRegistry({
  wsUrl,
  onEvent,
  onEventsReset,
  onStateUpdated,
}: UseClientRegistryOptions) {
  const [clients, setClients] = useState<Map<string, ClientInfo>>(new Map())
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const callbacksRef = useRef({ onEvent, onEventsReset, onStateUpdated })
  callbacksRef.current = { onEvent, onEventsReset, onStateUpdated }

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectDelay = 1000

    function connect() {
      if (cancelled) return
      setWsStatus('connecting')
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectDelay = 1000
        setWsStatus('open')
      }
      ws.onclose = () => {
        if (cancelled) return
        setWsStatus('closed')
        reconnectTimer = setTimeout(connect, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
      }

      ws.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data) as DashboardMessage

          switch (parsed.kind) {
            case 'clients-snapshot':
              setClients(new Map(parsed.clients.map((c) => [c.clientId, c])))
              break

            case 'client-connected':
              setClients((prev) => {
                const next = new Map(prev)
                next.set(parsed.client.clientId, parsed.client)
                return next
              })
              break

            case 'client-updated':
              setClients((prev) => {
                const next = new Map(prev)
                next.set(parsed.client.clientId, parsed.client)
                return next
              })
              break

            case 'client-disconnected':
              setClients((prev) => {
                const existing = prev.get(parsed.clientId)
                if (!existing) return prev
                const next = new Map(prev)
                next.set(parsed.clientId, { ...existing, isOpen: false })
                return next
              })
              break

            case 'event':
              callbacksRef.current.onEvent?.(parsed.clientId, parsed.event)
              break

            case 'events-reset':
              callbacksRef.current.onEventsReset?.()
              break

            case 'state-updated':
              callbacksRef.current.onStateUpdated?.(
                (parsed as { clientId?: string }).clientId,
                parsed.capturedAt,
              )
              break
          }
        } catch {
          // Ignore malformed dashboard events.
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) ws.close()
    }
  }, [wsUrl])

  const orderedClients = useCallback(() => {
    return Array.from(clients.values()).sort(
      (a, b) => new Date(a.connectedAt).getTime() - new Date(b.connectedAt).getTime(),
    )
  }, [clients])

  return {
    clients,
    orderedClients: orderedClients(),
    wsStatus,
  }
}
