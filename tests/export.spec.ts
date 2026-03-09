import { test, expect, type Page } from '@playwright/test'

const API_BASE = 'http://localhost:19090'

/** Connect to the app WS, send client.intro + the given events, then disconnect. */
async function seedEvents(page: Page, events: object[]): Promise<void> {
  await page.evaluate((evts) => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:19090/ws')
      const timeout = setTimeout(() => { ws.close(); reject(new Error('WS seed timeout')) }, 5000)
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'connected') {
          ws.send(JSON.stringify({
            type: 'client.intro',
            payload: { name: 'TestApp', platform: 'ios' },
          }))
          for (const evt of evts) ws.send(JSON.stringify(evt))
          setTimeout(() => { clearTimeout(timeout); ws.close(); resolve() }, 300)
        }
      }
      ws.onerror = () => { clearTimeout(timeout); ws.close(); reject(new Error('WS error')) }
    })
  }, events)
}

function parseJsonl(text: string): Record<string, unknown>[] {
  return text.trim().split('\n').map((line) => JSON.parse(line))
}

/** Navigate to the dashboard and point it at the test API server. */
async function openDashboard(page: Page): Promise<void> {
  await page.goto('/')
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('19090') && r.url().includes('/api/events'),
  )
  await page.locator('input').first().fill('http://localhost:19090')
  await responsePromise
}

// ─── API tests ───────────────────────────────────────────────────────────────

test.describe('Export API', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
  })

  test('returns 404 for nonexistent session', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/export?session=nonexistent-id`)
    expect(res.status()).toBe(404)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toBe('Session not found')
  })

  test('exports JSONL with session header and all events (no filters)', async ({ page, request }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'info log' } },
      { type: 'log', payload: { level: 'error', message: 'error log' } },
      { type: 'api.response', payload: { status: 200, url: 'https://example.com/api', method: 'GET', duration: 120 } },
    ])

    const res = await request.get(`${API_BASE}/api/export`)
    expect(res.ok()).toBe(true)
    expect(res.headers()['content-type']).toContain('application/x-ndjson')
    expect(res.headers()['content-disposition']).toMatch(/attachment.*\.jsonl/)

    const lines = parseJsonl(await res.text())
    const header = lines[0]
    expect(header._type).toBe('session')
    expect(header.app_name).toBe('TestApp')
    expect(header.platform).toBe('ios')

    // client.intro + 3 seeded events = 4 events + 1 header line
    const events = lines.slice(1)
    expect(events.length).toBeGreaterThanOrEqual(4)
  })

  test('type filter returns only matching types', async ({ page, request }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'a log' } },
      { type: 'api.response', payload: { status: 200, url: '/test', method: 'GET', duration: 50 } },
      { type: 'log', payload: { level: 'error', message: 'another log' } },
    ])

    const res = await request.get(`${API_BASE}/api/export?type=log`)
    const lines = parseJsonl(await res.text())
    const events = lines.slice(1)
    expect(events.length).toBeGreaterThanOrEqual(2)
    for (const evt of events) expect(evt.type).toBe('log')
  })

  test('level filter returns only matching levels', async ({ page, request }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'info' } },
      { type: 'log', payload: { level: 'error', message: 'error' } },
      { type: 'log', payload: { level: 'warn', message: 'warn' } },
    ])

    const res = await request.get(`${API_BASE}/api/export?level=error`)
    const lines = parseJsonl(await res.text())
    const events = lines.slice(1)
    expect(events.length).toBeGreaterThanOrEqual(1)
    for (const evt of events) expect(evt.level).toBe('error')
  })

  test('limit caps exported events and sets has_more', async ({ page, request }) => {
    await seedEvents(page, Array.from({ length: 10 }, (_, i) => ({
      type: 'log',
      payload: { level: 'info', message: `event-${i}` },
    })))

    const res = await request.get(`${API_BASE}/api/export?limit=5`)
    const lines = parseJsonl(await res.text())
    const header = lines[0]
    expect(header._type).toBe('session')
    expect(header.has_more).toBe(true)
    expect(header.exported_events).toBe(5)
    expect(lines.slice(1)).toHaveLength(5)
  })

  test('JSONL first line has _type session with correct metadata', async ({ page, request }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'debug', message: 'metadata check' } },
    ])

    const lines = parseJsonl(await (await request.get(`${API_BASE}/api/export`)).text())
    const header = lines[0]

    expect(header._type).toBe('session')
    expect(typeof header.session_id).toBe('string')
    expect(typeof header.connected_at).toBe('string')
    expect(typeof header.exported_at).toBe('string')
    expect(typeof header.total_events).toBe('number')
    expect(typeof header.exported_events).toBe('number')
    expect(typeof header.has_more).toBe('boolean')
    expect(header.filters_applied).toBeDefined()
    expect(header.pagination).toMatchObject({
      limit: expect.any(Number),
      offset: expect.any(Number),
    })
  })
})

// ─── Dashboard tests ─────────────────────────────────────────────────────────

test.describe('Export button in dashboard', () => {
  test('Export button is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Export/i })).toBeVisible()
  })

  test('Export button is disabled when no events', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await openDashboard(page)
    await expect(page.getByRole('button', { name: /Export/i })).toBeDisabled()
  })

  test('Export button is enabled when events exist', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'enable test' } },
    ])
    await openDashboard(page)
    await expect(page.getByRole('button', { name: /Export/i })).toBeEnabled()
  })

  test('Export passes type filter to URL', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'filter url test' } },
      { type: 'api.response', payload: { status: 200, url: '/x', method: 'GET', duration: 10 } },
    ])
    await openDashboard(page)

    // Wait for the type dropdown to have options beyond "All"
    const typeSelect = page.locator('select').first()
    await expect(typeSelect.locator('option')).not.toHaveCount(1)
    await typeSelect.selectOption('log')

    // Intercept window.open to capture the URL
    await page.evaluate(() => {
      ;(window as any).__capturedExportUrl = ''
      window.open = ((url?: string | URL) => {
        ;(window as any).__capturedExportUrl = String(url ?? '')
        return null
      }) as typeof window.open
    })

    await page.getByRole('button', { name: /Export/i }).click()
    const url = await page.evaluate(() => (window as any).__capturedExportUrl)

    expect(url).toContain('/api/export')
    expect(url).toContain('type=log')
  })

  test('Errors only checkbox sets level=error in export URL', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'error', message: 'errors only test' } },
    ])
    await openDashboard(page)

    await page.getByText('Errors only', { exact: true }).click()

    await page.evaluate(() => {
      ;(window as any).__capturedExportUrl = ''
      window.open = ((url?: string | URL) => {
        ;(window as any).__capturedExportUrl = String(url ?? '')
        return null
      }) as typeof window.open
    })

    await page.getByRole('button', { name: /Export/i }).click()
    const url = await page.evaluate(() => (window as any).__capturedExportUrl)

    expect(url).toContain('/api/export')
    expect(url).toContain('level=error')
  })
})
