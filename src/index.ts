import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createBunWebSocket } from 'hono/bun'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const PORT = Number(Bun.env.PORT ?? 9090)
const DASHBOARD_WS_PORT = Number(Bun.env.DASHBOARD_WS_PORT ?? 9092)
const OUTPUT_DIR = path.resolve(process.cwd(), '.reactotron-llm')
const APP_LOG_PATH = path.join(OUTPUT_DIR, 'app-log.jsonl')
const STATE_PATH = path.join(OUTPUT_DIR, 'state.json')

type JsonObject = Record<string, unknown>

type AppWsData = {
  clientId: string
}

type DashboardWsData = {
  clientId: string
}

type CuratedEvent = {
  ts: string
  type: string
  level?: string
  message?: string
  stack?: string
  action?: {
    type?: string
    name?: string
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

const appClients = new Set<ServerWebSocket<AppWsData>>()
const dashboardClients = new Set<ServerWebSocket<DashboardWsData>>()
let latestState: unknown = null
let latestStateAt: string | null = null

function asObject(value: unknown): JsonObject | undefined {
  if (value && typeof value === 'object') return value as JsonObject
  return undefined
}

function getByPath(obj: unknown, pathExpr: string): unknown {
  let cursor: unknown = obj
  for (const key of pathExpr.split('.')) {
    const current = asObject(cursor)
    if (!current) return undefined
    cursor = current[key]
  }
  return cursor
}

function firstString(obj: unknown, paths: string[]): string | undefined {
  for (const p of paths) {
    const value = getByPath(obj, p)
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function firstNumber(obj: unknown, paths: string[]): number | undefined {
  for (const p of paths) {
    const value = getByPath(obj, p)
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function firstValue(obj: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const value = getByPath(obj, p)
    if (value !== undefined) return value
  }
  return undefined
}

function maybeParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function deepFindByKeys(
  root: unknown,
  keys: string[],
  maxDepth = 6,
  maxNodes = 3000,
): unknown {
  const wanted = new Set(keys.map((k) => k.toLowerCase()))
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const seen = new Set<object>()
  let visited = 0

  while (queue.length > 0 && visited < maxNodes) {
    const current = queue.shift()
    if (!current) break
    const { value, depth } = current
    visited += 1

    if (value === null || value === undefined || depth > maxDepth) continue

    if (Array.isArray(value)) {
      for (const item of value) queue.push({ value: item, depth: depth + 1 })
      continue
    }

    if (typeof value !== 'object') continue
    if (seen.has(value)) continue
    seen.add(value)

    const obj = value as JsonObject
    for (const [key, nested] of Object.entries(obj)) {
      if (wanted.has(key.toLowerCase())) {
        return nested
      }
      queue.push({ value: nested, depth: depth + 1 })
    }
  }

  return undefined
}

function getMessageType(payload: unknown): string {
  return firstString(payload, ['type', 'event', 'payload.type', 'data.type']) ?? 'unknown'
}

function getMessageLevel(payload: unknown): string | undefined {
  return firstString(payload, ['level', 'payload.level', 'data.level'])
}

function inferState(payload: unknown): unknown {
  const type = getMessageType(payload).toLowerCase()
  const looksStateLike =
    type.includes('state') || type.includes('redux') || type.includes('subscription')

  const candidate = firstValue(payload, [
    'state',
    'values',
    'payload.state',
    'payload.values',
    'payload.snapshot',
    'data.state',
  ])

  if (!looksStateLike && getByPath(payload, 'state') === undefined) {
    return null
  }

  return candidate ?? null
}

function extractNetwork(payload: unknown): CuratedEvent['network'] | undefined {
  const method = firstString(payload, [
    'method',
    'verb',
    'config.method',
    'request.method',
    'request.config.method',
    'request.options.method',
    'payload.method',
    'payload.verb',
    'payload.config.method',
    'payload.request.method',
    'payload.request.config.method',
    'data.method',
    'data.verb',
    'data.config.method',
    'data.request.method',
    'data.request.config.method',
  ])

  const url = firstString(payload, [
    'url',
    'uri',
    'path',
    'endpoint',
    'config.url',
    'request.url',
    'request.path',
    'request.config.url',
    'payload.url',
    'payload.uri',
    'payload.config.url',
    'payload.path',
    'payload.request.url',
    'payload.request.path',
    'payload.request.config.url',
    'data.url',
    'data.uri',
    'data.config.url',
    'data.request.url',
    'data.request.path',
    'data.request.config.url',
  ])

  const status = firstNumber(payload, [
    'status',
    'response.statusCode',
    'response.status',
    'payload.status',
    'payload.response.statusCode',
    'payload.response.status',
    'data.status',
    'data.response.statusCode',
    'data.response.status',
  ])

  const durationMs = firstNumber(payload, [
    'duration',
    'durationMs',
    'responseTime',
    'elapsedTime',
    'payload.duration',
    'payload.durationMs',
    'payload.responseTime',
    'payload.elapsedTime',
    'data.duration',
    'data.durationMs',
    'data.responseTime',
    'data.elapsedTime',
  ])

  const requestContainer = firstValue(payload, ['request', 'payload.request', 'data.request'])
  const responseContainer = firstValue(payload, ['response', 'payload.response', 'data.response'])
  const configContainer = firstValue(payload, ['config', 'payload.config', 'data.config'])

  const requestBodyDirect = firstValue(payload, [
    'config.data',
    'request.data',
    'request._bodyInit',
    'request.query',
    'request.variables',
    'query',
    'variables',
    'request.body',
    'request.bodyString',
    'request.config.data',
    'payload.config.data',
    'payload.request.data',
    'payload.request._bodyInit',
    'payload.request.query',
    'payload.request.variables',
    'payload.query',
    'payload.variables',
    'payload.request.body',
    'payload.request.bodyString',
    'payload.request.config.data',
    'data.config.data',
    'data.request.data',
    'data.request._bodyInit',
    'data.request.query',
    'data.request.variables',
    'data.query',
    'data.variables',
    'data.request.body',
    'data.request.bodyString',
    'data.request.config.data',
      'payload.requestBody',
      'data.requestBody',
      'requestBody',
      'payload.body',
      'payload.bodyString',
    ])

  const responseBodyDirect = firstValue(payload, [
      'response.data',
      'response.body',
      'response.bodyString',
      'payload.response.data',
      'payload.response.body',
      'payload.response.bodyString',
      'data.response.data',
      'data.response.body',
      'data.response.bodyString',
      'payload.responseBody',
      'data.responseBody',
      'responseBody',
      'payload.response',
      'data',
      'payload.data',
    ])

  const requestHeadersDirect = firstValue(payload, [
    'config.headers',
    'request.headers',
    'request.config.headers',
    'payload.config.headers',
    'payload.request.headers',
    'payload.request.config.headers',
    'payload.requestHeaders',
    'data.config.headers',
    'data.request.headers',
    'data.request.config.headers',
    'data.requestHeaders',
    'requestHeaders',
  ])

  const responseHeadersDirect = firstValue(payload, [
    'headers',
    'response.headers',
    'payload.headers',
    'payload.response.headers',
    'payload.responseHeaders',
    'data.headers',
    'data.response.headers',
    'data.responseHeaders',
    'responseHeaders',
  ])

  const error = firstString(payload, [
    'error.message',
    'payload.error.message',
    'data.error.message',
    'response.error',
    'payload.response.error',
    'data.response.error',
    'error',
    'payload.error',
  ])

  // Axios/ApiSauce responses often carry request metadata in `config`.
  // If explicit request headers/body weren't found, infer them from config.
  const deepRequestHeaders =
    deepFindByKeys(requestContainer, ['headers']) ??
    deepFindByKeys(configContainer, ['headers']) ??
    deepFindByKeys(payload, ['requestheaders', 'request_headers'])
  const deepResponseHeaders =
    deepFindByKeys(responseContainer, ['headers']) ??
    deepFindByKeys(payload, ['responseheaders', 'response_headers'])

  const deepRequestBody =
    deepFindByKeys(requestContainer, ['data', 'body', 'bodystring']) ??
    deepFindByKeys(configContainer, ['data', 'body', 'bodystring']) ??
    deepFindByKeys(payload, ['query', 'variables'])
  const deepResponseBody =
    deepFindByKeys(responseContainer, ['data', 'body', 'bodystring', 'result']) ??
    deepFindByKeys(payload, ['responsebody', 'response_body'])

  const finalRequestHeaders = requestHeadersDirect ?? deepRequestHeaders
  const finalResponseHeaders = responseHeadersDirect ?? deepResponseHeaders
  const finalRequestBody = maybeParseJsonString(requestBodyDirect ?? deepRequestBody)
  const finalResponseBody = maybeParseJsonString(responseBodyDirect ?? deepResponseBody)

  if (
    method === undefined &&
    url === undefined &&
    status === undefined &&
    durationMs === undefined &&
    finalRequestHeaders === undefined &&
    finalResponseHeaders === undefined &&
    finalRequestBody === undefined &&
    finalResponseBody === undefined &&
    error === undefined
  ) {
    return undefined
  }

  return {
    method,
    url,
    status,
    durationMs,
    requestHeaders: finalRequestHeaders,
    responseHeaders: finalResponseHeaders,
    requestBody: finalRequestBody,
    responseBody: finalResponseBody,
    error,
  }
}

function extractDetails(payload: unknown): JsonObject | undefined {
  const root = asObject(payload)
  if (!root) return undefined

  const details: JsonObject = {}
  for (const [key, value] of Object.entries(root)) {
    if (
      key === 'payload' ||
      key === 'data' ||
      key === 'state' ||
      key === 'values' ||
      key === 'request' ||
      key === 'response'
    ) {
      continue
    }

    const t = typeof value
    if (value == null || t === 'string' || t === 'number' || t === 'boolean') {
      details[key] = value
    }
  }

  return Object.keys(details).length > 0 ? details : undefined
}

function shouldDrop(type: string): boolean {
  const t = type.toLowerCase()
  return (
    t.includes('ping') ||
    t.includes('pong') ||
    t.includes('heartbeat') ||
    t.includes('connected') ||
    t.includes('client.intro')
  )
}

function curateEvent(payload: unknown): CuratedEvent | null {
  const ts = new Date().toISOString()
  const type = getMessageType(payload)
  if (shouldDrop(type)) return null

  const level = getMessageLevel(payload)
  const msgType = type.toLowerCase()

  const event: CuratedEvent = { ts, type }
  if (level) event.level = level

  const message = firstString(payload, ['message', 'payload.message', 'data.message'])
  const stack = firstString(payload, [
    'stack',
    'payload.stack',
    'data.stack',
    'error.stack',
    'payload.error.stack',
  ])

  if (message) event.message = message
  if (stack) event.stack = stack

  if (msgType.includes('action')) {
    event.action = {
      type: firstString(payload, ['action.type', 'payload.action.type', 'data.action.type', 'name']),
      name: firstString(payload, ['action.name', 'payload.action.name', 'data.action.name']),
    }

    const changed = firstValue(payload, ['changed', 'payload.changed', 'data.changed'])
    if (Array.isArray(changed)) {
      event.changed = changed.filter((v): v is string => typeof v === 'string')
    }
  }

  const network = extractNetwork(payload)
  if (network) event.network = network

  if (msgType.includes('benchmark')) {
    event.benchmark = {
      title: firstString(payload, ['title', 'payload.title', 'data.title']),
      steps: firstValue(payload, ['steps', 'payload.steps', 'data.steps']),
    }
  }

  event.details = extractDetails(payload)

  const hasUsefulFields =
    event.message !== undefined ||
    event.stack !== undefined ||
    event.network !== undefined ||
    event.action !== undefined ||
    event.benchmark !== undefined ||
    (event.details !== undefined && Object.keys(event.details).length > 0)

  return hasUsefulFields ? event : null
}

function broadcastDashboard(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  for (const client of dashboardClients) {
    if (client.readyState === client.OPEN) {
      client.send(serialized)
    }
  }
}

async function appendEvent(payload: unknown): Promise<void> {
  const curated = curateEvent(payload)
  if (!curated) return

  await appendFile(APP_LOG_PATH, `${JSON.stringify(curated)}\n`, 'utf8')
  broadcastDashboard({ kind: 'event', event: curated })

  const maybeState = inferState(payload)
  if (maybeState !== null) {
    latestState = maybeState
    latestStateAt = curated.ts
  }
}

async function loadRecentEvents(limit: number): Promise<CuratedEvent[]> {
  if (!existsSync(APP_LOG_PATH)) return []

  const content = await readFile(APP_LOG_PATH, 'utf8')
  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  const selected = lines.slice(Math.max(0, lines.length - limit))

  const parsed: CuratedEvent[] = []
  for (const line of selected) {
    try {
      parsed.push(JSON.parse(line) as CuratedEvent)
    } catch {
      // Skip malformed lines.
    }
  }

  return parsed
}

function wsBehavior() {
  return {
    onOpen(_event: Event, ws: ServerWebSocket<AppWsData>) {
      ws.data = { clientId: crypto.randomUUID() }
      appClients.add(ws)
      console.log(`[ws] client connected id=${ws.data.clientId} total=${appClients.size}`)

      if (ws.readyState === ws.OPEN) {
        ws.send('{"type":"connected"}')
      }
    },
    onMessage(event: MessageEvent) {
      const raw = typeof event.data === 'string' ? event.data : event.data.toString()

      let parsed: unknown = raw
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = { message: raw, type: 'raw.text' }
      }

      appendEvent(parsed).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Failed to append event:', msg)
      })

      const state = inferState(parsed)
      if (state !== null) {
        latestState = state
        latestStateAt = new Date().toISOString()
        writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8').catch(() => {})
      }
    },
    onClose(_event: CloseEvent, ws: ServerWebSocket<AppWsData>) {
      appClients.delete(ws)
      console.log(`[ws] client disconnected id=${ws.data.clientId} total=${appClients.size}`)
    },
    onError(event: Event) {
      console.error('WebSocket error:', event)
    },
  }
}

async function requestStateFromClients(): Promise<void> {
  const messages = [
    { type: 'state.values.request' },
    { type: 'api.state.values.request' },
    { type: 'state.request' },
  ]

  for (const ws of appClients) {
    if (ws.readyState !== ws.OPEN) continue
    for (const message of messages) {
      ws.send(JSON.stringify(message))
    }
  }
}

async function setupStorage(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })
}

await setupStorage()

const app = new Hono()
const { upgradeWebSocket, websocket } = createBunWebSocket<AppWsData>()
const wsRoute = upgradeWebSocket(() => wsBehavior())

app.use('/api/*', cors())

app.get('/health', (c) => {
  return c.json({
    ok: true,
    port: PORT,
    clients: appClients.size,
    dashboardWsPort: DASHBOARD_WS_PORT,
    outputDir: OUTPUT_DIR,
    latestStateAt,
  })
})

app.get('/dump-state', async (c) => {
  await requestStateFromClients()
  await Bun.sleep(250)

  if (latestState === null) {
    return c.json({ ok: false, error: 'No state captured yet' }, 404)
  }

  await writeFile(STATE_PATH, JSON.stringify(latestState, null, 2), 'utf8')
  broadcastDashboard({ kind: 'state-updated', capturedAt: latestStateAt })

  return c.json({
    ok: true,
    clients: appClients.size,
    stateFile: STATE_PATH,
    capturedAt: latestStateAt,
  })
})

app.get('/api/events', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? 200)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 200
  const events = await loadRecentEvents(limit)
  return c.json({ ok: true, count: events.length, events })
})

app.get('/api/state', async (c) => {
  if (!existsSync(STATE_PATH)) {
    return c.json({ ok: false, error: 'state.json not found' }, 404)
  }

  try {
    const content = await readFile(STATE_PATH, 'utf8')
    return c.json({ ok: true, state: JSON.parse(content) })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return c.json({ ok: false, error: msg }, 500)
  }
})

app.get('/ws', wsRoute)
app.get('/', (c) => {
  const upgrade = c.req.header('upgrade')
  if (upgrade && upgrade.toLowerCase() === 'websocket') {
    return wsRoute(c)
  }

  return c.json({
    service: 'reactotron-llm-proxy',
    ok: true,
    endpoints: ['/health', '/dump-state', '/api/events', '/api/state', '/ws'],
  })
})

Bun.serve({
  port: PORT,
  fetch: app.fetch,
  websocket,
})

Bun.serve<DashboardWsData>({
  port: DASHBOARD_WS_PORT,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return undefined
    }

    return new Response(
      JSON.stringify({
        ok: true,
        service: 'reactotron-llm-dashboard-ws',
        endpoint: `ws://localhost:${DASHBOARD_WS_PORT}`,
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  },
  websocket: {
    open(ws) {
      ws.data = { clientId: crypto.randomUUID() }
      dashboardClients.add(ws)
      ws.send(
        JSON.stringify({
          kind: 'hello',
          clientId: ws.data.clientId,
          connectedAt: new Date().toISOString(),
        }),
      )
    },
    close(ws) {
      dashboardClients.delete(ws)
    },
  },
})

console.log(`reactotron-llm-proxy listening on http://localhost:${PORT}`)
console.log(`dashboard live ws listening on ws://localhost:${DASHBOARD_WS_PORT}`)
