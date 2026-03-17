import type { CuratedEvent } from '@shared/types'
import { formatTime, normalizePlaceholders } from './normalize'

function jsonBlock(value: unknown, label?: string): string {
  const normalized = normalizePlaceholders(value)
  const json = JSON.stringify(normalized, null, 2)
  const fence = json.includes('```') ? '````' : '```'
  const parts: string[] = []
  if (label) parts.push(`**${label}**`)
  parts.push(`${fence}json`)
  parts.push(json)
  parts.push(fence)
  return parts.join('\n')
}

function codeBlock(value: string): string {
  const fence = value.includes('```') ? '````' : '```'
  return `${fence}\n${value}\n${fence}`
}

function summaryForNetwork(event: CuratedEvent): string {
  const n = event.network!
  const parts: string[] = []
  if (n.method) parts.push(n.method)
  if (n.url) parts.push(n.url)
  if (n.status != null) parts.push(`→ ${n.status}`)
  if (n.durationMs != null) parts.push(`(${n.durationMs}ms)`)
  return parts.join(' ') || '(no details)'
}

function summaryForAction(event: CuratedEvent): string {
  const actionName = event.action?.name ?? event.action?.type
  const parts: string[] = []
  if (actionName) parts.push(`\`${actionName}\``)
  if (event.changed && event.changed.length > 0) {
    parts.push(`(changed: ${event.changed.join(', ')})`)
  }
  return parts.join(' ') || '(no action name)'
}

export function formatEventMarkdown(
  event: CuratedEvent,
  detail: 'summary' | 'full',
): string {
  if (detail === 'summary') return formatEventSummary(event)
  return formatEventFull(event)
}

function formatEventSummary(event: CuratedEvent): string {
  const time = formatTime(event.ts)
  const type = event.type

  if (event.network) {
    return `\`${time}\` **${type}** — ${summaryForNetwork(event)}`
  }

  if (type === 'state.action.complete' && event.action) {
    return `\`${time}\` **${type}** — ${summaryForAction(event)}`
  }

  if (event.benchmark) {
    const title = event.benchmark.title ? `"${event.benchmark.title}"` : '(untitled)'
    return `\`${time}\` **${type}** — ${title}`
  }

  if (type === 'client.intro' && event.details) {
    const appName = event.details.name ?? event.details.appName
    const platform = event.details.platform
    const parts = [appName, platform].filter(Boolean)
    return `\`${time}\` **${type}** — ${parts.join(' ') || '(no details)'}`
  }

  const msg = event.message ?? '(no message)'
  return `\`${time}\` **${type}** — ${msg}`
}

function formatEventFull(event: CuratedEvent): string {
  const time = formatTime(event.ts)
  const sections: string[] = []

  sections.push(`### ${event.type} — ${time}`)

  if (event.message) {
    sections.push(event.message)
  }

  if (event.network) {
    const n = event.network
    const headline: string[] = []
    if (n.method) headline.push(`**${n.method}**`)
    if (n.url) headline.push(`\`${n.url}\``)
    if (n.status != null) headline.push(`→ **${n.status}**`)
    if (n.durationMs != null) headline.push(`(${n.durationMs}ms)`)
    if (headline.length > 0) sections.push(headline.join(' '))
    if (n.error) sections.push(`**Error:** ${n.error}`)
    if (n.requestBody != null) sections.push(jsonBlock(n.requestBody, 'Request Body'))
    if (n.responseBody != null) sections.push(jsonBlock(n.responseBody, 'Response Body'))
    if (n.requestHeaders != null) sections.push(jsonBlock(n.requestHeaders, 'Request Headers'))
    if (n.responseHeaders != null) sections.push(jsonBlock(n.responseHeaders, 'Response Headers'))
  }

  if (event.action) {
    const actionName = event.action.name ?? event.action.type ?? 'unknown'
    sections.push(`Action: \`${actionName}\``)
    if (event.changed && event.changed.length > 0) {
      sections.push(`Changed: ${event.changed.map((c) => `\`${c}\``).join(', ')}`)
    }
    if (event.action.payload !== undefined) {
      sections.push(jsonBlock(event.action.payload, 'Payload'))
    }
  }

  if (event.benchmark) {
    if (event.benchmark.title) sections.push(`**${event.benchmark.title}**`)
    if (event.benchmark.steps != null) {
      sections.push(jsonBlock(event.benchmark.steps, 'Steps'))
    }
  }

  if (event.stack) {
    sections.push(codeBlock(event.stack))
  }

  if (event.details && Object.keys(event.details).length > 0) {
    sections.push(jsonBlock(event.details, 'Details'))
  }

  return sections.join('\n')
}

export type SessionMetadata = {
  appName?: string
  platform?: string
  timeRange?: { start: string; end: string }
  eventCount: number
}

export function formatSessionHeader(meta: SessionMetadata): string {
  const titleParts = ['## Reactotron Events']
  if (meta.appName || meta.platform) {
    const label = [meta.appName, meta.platform ? `(${meta.platform})` : null]
      .filter(Boolean)
      .join(' ')
    titleParts.push(`— ${label}`)
  }

  const infoParts: string[] = []
  if (meta.timeRange) {
    infoParts.push(`**Time range:** ${formatTime(meta.timeRange.start)} – ${formatTime(meta.timeRange.end)}`)
  }
  infoParts.push(`**Events:** ${meta.eventCount}`)

  return `${titleParts.join(' ')}\n${infoParts.join(' | ')}\n`
}

export function formatEventsMarkdown(
  events: CuratedEvent[],
  metadata?: SessionMetadata,
): string {
  const parts: string[] = []

  if (metadata) {
    parts.push(formatSessionHeader(metadata))
  }

  parts.push(events.map((e) => formatEventSummary(e)).join('\n'))

  return parts.join('\n')
}

export function extractLiveMetadata(allEvents: CuratedEvent[], filteredEvents: CuratedEvent[]): SessionMetadata {
  const introEvent = allEvents.find((e) => e.type === 'client.intro' && e.details)
  const appName = introEvent?.details?.name as string | undefined
    ?? introEvent?.details?.appName as string | undefined
  const platform = introEvent?.details?.platform as string | undefined

  let timeRange: { start: string; end: string } | undefined
  if (filteredEvents.length > 0) {
    const timestamps = filteredEvents.map((e) => e.ts).sort()
    timeRange = { start: timestamps[0], end: timestamps[timestamps.length - 1] }
  }

  return { appName, platform, timeRange, eventCount: filteredEvents.length }
}
