import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createBunWebSocket } from 'hono/bun'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { CuratedEvent } from './shared/types'
import {
  asObject,
  curateEvent,
  firstString,
  getByPath,
  getMessageType,
  inferState,
} from './shared/curate'
import {
  closeSession,
  createSession,
  deleteAllEvents,
  getRecentEvents,
  initDb,
  insertRawEvent,
  updateSessionMetadata,
} from './db'

const PORT = Number(Bun.env.PORT ?? 9090)
const DASHBOARD_WS_PORT = Number(Bun.env.DASHBOARD_WS_PORT ?? 9092)
const OUTPUT_DIR = path.resolve(process.cwd(), '.reactotron-llm')
const DB_PATH = path.join(OUTPUT_DIR, 'reactotron.db')
const STATE_PATH = path.join(OUTPUT_DIR, 'state.json')

type AppWsData = {
  clientId: string
  sessionId: string
}

type DashboardWsData = {
  clientId: string
}

const appClients = new Set<ServerWebSocket<AppWsData>>()
const dashboardClients = new Set<ServerWebSocket<DashboardWsData>>()
let latestState: unknown = null
let latestStateAt: string | null = null

function shouldDrop(type: string): boolean {
  const t = type.toLowerCase()
  return (
    t.includes('ping') ||
    t.includes('pong') ||
    t.includes('heartbeat') ||
    t.includes('connected')
  )
}

function broadcastDashboard(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  for (const client of dashboardClients) {
    if (client.readyState === 1) {
      client.send(serialized)
    }
  }
}

function wsBehavior() {
  let sessionId = ''

  return {
    onOpen(_event: Event, ws: ServerWebSocket<AppWsData>) {
      sessionId = crypto.randomUUID()
      ws.data = { clientId: sessionId, sessionId }
      appClients.add(ws)
      createSession(db, sessionId)
      console.log(`[ws] client connected session=${sessionId} total=${appClients.size}`)

      if (ws.readyState === 1) {
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

      const type = getMessageType(parsed)

      // Handle client.intro: extract metadata for the session table
      if (type === 'client.intro') {
        const payload = asObject(getByPath(parsed, 'payload'))
        updateSessionMetadata(db, sessionId, {
          appName: firstString(parsed, ['payload.name', 'payload.appName', 'name']),
          platform: firstString(parsed, ['payload.platform', 'platform']),
          raw: payload,
        })
      }

      // Drop protocol noise (but NOT client.intro)
      if (shouldDrop(type)) return

      const timestamp = new Date().toISOString()
      insertRawEvent(db, { sessionId, timestamp, type, rawJson: JSON.stringify(parsed) })

      // Curate for live dashboard broadcast
      const curated = curateEvent(parsed, timestamp)
      if (curated) {
        broadcastDashboard({ kind: 'event', event: curated })
      }

      // State inference
      const maybeState = inferState(parsed)
      if (maybeState !== null) {
        latestState = maybeState
        latestStateAt = timestamp
        writeFile(STATE_PATH, JSON.stringify(maybeState, null, 2), 'utf8').catch(() => {})
      }
    },
    onClose(_event: CloseEvent, ws: ServerWebSocket<AppWsData>) {
      appClients.delete(ws)
      closeSession(db, sessionId)
      console.log(`[ws] client disconnected session=${sessionId} total=${appClients.size}`)
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

const db = initDb(DB_PATH)

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

app.get('/api/events', (c) => {
  const rawLimit = Number(c.req.query('limit') ?? 200)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 200
  const rows = getRecentEvents(db, limit)

  const events: CuratedEvent[] = []
  for (const row of rows) {
    try {
      const curated = curateEvent(JSON.parse(row.raw_json), row.timestamp)
      if (curated) events.push(curated)
    } catch { /* skip malformed rows */ }
  }

  // getRecentEvents returns newest first; reverse to chronological order
  events.reverse()

  return c.json({ ok: true, count: events.length, events })
})

app.post('/api/events/reset', (c) => {
  deleteAllEvents(db)
  broadcastDashboard({ kind: 'events-reset', at: new Date().toISOString() })
  return c.json({ ok: true })
})

app.get('/api/state', async (c) => {
  if (!existsSync(STATE_PATH)) {
    return c.json({ ok: false, error: 'state.json not found' }, 404)
  }

  try {
    const content = await Bun.file(STATE_PATH).text()
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
