export type JsonObject = Record<string, unknown>

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
