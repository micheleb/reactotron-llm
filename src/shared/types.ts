export type JsonObject = Record<string, unknown>

export const STATS_VERSION = 1

export type SessionStats = {
  version: typeof STATS_VERSION
  total_events: number
  event_counts: Record<string, number>
  error_count: number
  warning_count: number
  failed_network_count: number
  network_count: number
  slowest_request: {
    url: string
    method: string
    durationMs: number
  } | null
  longest_benchmark: {
    title: string
    totalMs: number
  } | null
  latency: {
    p50: number
    p90: number
    p95: number
    p99: number
  } | null
}

export type CuratedEvent = {
  ts: string
  type: string
  level?: string
  message?: string
  stack?: string
  action?: {
    type?: string
    name?: string
    path?: string
    displayName?: string
    payload?: unknown
  }
  changed?: string[]
  network?: {
    method?: string
    url?: string
    status?: number
    durationMs?: number
    requestHeaders?: unknown
    responseHeaders?: unknown
    requestBody?: unknown
    responseBody?: unknown
    error?: string
  }
  benchmark?: {
    title?: string
    steps?: unknown
  }
  details?: JsonObject
}
