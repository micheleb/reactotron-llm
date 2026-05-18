import type { ClientInfo } from '@shared/types'

export type DotState = 'green' | 'orange' | 'grey' | 'disconnected'

const ONE_MINUTE = 60_000
const ONE_HOUR = 3_600_000

export function dotState(client: ClientInfo, now: number): DotState {
  if (!client.isOpen) return 'disconnected'

  const elapsed = now - new Date(client.lastSeen).getTime()
  if (elapsed <= ONE_MINUTE) return 'green'
  if (elapsed <= ONE_HOUR) return 'orange'
  return 'grey'
}
