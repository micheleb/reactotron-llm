import type { CuratedEvent } from '@shared/types'

const TYPE_FILTER_LABELS: Record<string, string> = {
  'state.action.complete': 'store actions',
}

function isAction(event: CuratedEvent): boolean {
  return (
    event.type === 'state.action.complete' &&
    (event.action?.name != null || event.action?.type != null)
  )
}

function getUrlHostname(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function getEventPrimaryType(event: CuratedEvent): string {
  if (isAction(event)) return 'ACTION'
  return event.type
}

export function getEventSecondaryLabel(event: CuratedEvent): string {
  if (isAction(event)) {
    const actionLabel = event.action!.name ?? event.action!.type
    return event.action!.displayName ?? `action.${actionLabel}`
  }
  if (event.type === 'api.response') {
    return getUrlHostname(event.network?.url) || event.network?.url || ''
  }
  if (event.type === 'log') {
    return event.level ?? ''
  }
  if (event.type === 'client.intro') {
    const appName =
      (event.details?.name as string | undefined) ??
      (event.details?.appName as string | undefined)
    return appName ? `New ${appName} session` : 'New session'
  }
  return event.message ?? ''
}

export function getTypeFilterLabel(type: string): string {
  return TYPE_FILTER_LABELS[type] ?? type
}
