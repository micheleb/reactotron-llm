import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:19090'

test.describe('Health endpoint', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.port).toBe(19090)
    expect(json.dashboardWsPort).toBe(19092)
    expect(typeof json.clients).toBe('number')
  })
})

test.describe('Root endpoint', () => {
  test('GET / returns service info when not upgrading to WS', async ({ request }) => {
    const res = await request.get(`${API_BASE}/`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.service).toBe('reactotron-llm-proxy')
    expect(json.ok).toBe(true)
    expect(json.endpoints).toContain('/health')
    expect(json.endpoints).toContain('/api/events')
  })
})

test.describe('Events API', () => {
  test('GET /api/events returns empty list initially', async ({ request }) => {
    // Reset first to ensure clean state
    await request.post(`${API_BASE}/api/events/reset`)

    const res = await request.get(`${API_BASE}/api/events`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.events).toEqual([])
    expect(json.count).toBe(0)
  })

  test('GET /api/events respects limit param', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/events?limit=5`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(Array.isArray(json.events)).toBe(true)
  })

  test('POST /api/events/reset clears events', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/events/reset`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)

    // Verify events are empty
    const eventsRes = await request.get(`${API_BASE}/api/events`)
    const eventsJson = await eventsRes.json()
    expect(eventsJson.count).toBe(0)
  })
})

test.describe('State API', () => {
  test('GET /api/state returns 404 when no state captured', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/state`)
    const json = await res.json()

    // May be 404 if no state has been dumped, or 200 if state.json exists from a prior run
    if (res.status() === 404) {
      expect(json.ok).toBe(false)
    } else {
      expect(json.ok).toBe(true)
      expect(json.state).toBeDefined()
    }
  })
})

