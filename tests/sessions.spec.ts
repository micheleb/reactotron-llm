import { test, expect, type Page } from '@playwright/test'

const API_BASE = 'http://localhost:19090'

/** Connect to the app WS, send client.intro + the given events, then disconnect. */
async function seedEvents(page: Page, events: object[], appName = 'TestApp', platform = 'ios'): Promise<void> {
  await page.evaluate(({ evts, appName, platform }) => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:19090/ws')
      const timeout = setTimeout(() => { ws.close(); reject(new Error('WS seed timeout')) }, 5000)
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'connected') {
          ws.send(JSON.stringify({
            type: 'client.intro',
            payload: { name: appName, platform },
          }))
          for (const evt of evts) ws.send(JSON.stringify(evt))
          setTimeout(() => { clearTimeout(timeout); ws.close(); resolve() }, 300)
        }
      }
      ws.onerror = () => { clearTimeout(timeout); ws.close(); reject(new Error('WS error')) }
    })
  }, { evts: events, appName, platform })
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

/** Switch to the History tab and wait for sessions to load. */
async function switchToHistory(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/sessions') && !r.url().includes('/events'),
  )
  await page.getByRole('tab', { name: 'History' }).click()
  await responsePromise
}

// ─── Session stats API tests ────────────────────────────────────────────────

test.describe('Session stats', () => {
  test('GET /api/sessions includes stats for each session', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'error', message: 'stat error test' } },
      { type: 'log', payload: { level: 'warning', message: 'stat warn test' } },
      { type: 'log', payload: { level: 'info', message: 'stat info test' } },
    ])

    const res = await request.get(`${API_BASE}/api/sessions`)
    const json = await res.json()
    expect(json.ok).toBe(true)

    const session = json.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'TestApp',
    )
    expect(session).toBeDefined()
    expect(session.stats).toBeDefined()
    expect(session.stats.version).toBe(1)
    expect(session.stats.total_events).toBeGreaterThanOrEqual(3)
    expect(session.stats.error_count).toBeGreaterThanOrEqual(1)
    expect(session.stats.warning_count).toBeGreaterThanOrEqual(1)
    expect(typeof session.is_important).toBe('boolean')
  })

  test('GET /api/sessions/:id returns single session with stats', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'single session test' } },
    ], 'SingleApp', 'android')

    // Find the session ID
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const sessionsJson = await sessionsRes.json()
    const session = sessionsJson.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'SingleApp',
    )
    expect(session).toBeDefined()

    // Fetch single session
    const res = await request.get(`${API_BASE}/api/sessions/${session.id}`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.session.id).toBe(session.id)
    expect(json.session.app_name).toBe('SingleApp')
    expect(json.session.platform).toBe('android')
    expect(json.session.stats).toBeDefined()
    expect(json.session.stats.version).toBe(1)
    expect(typeof json.session.is_important).toBe('boolean')
  })

  test('GET /api/sessions/:id returns 404 for missing session', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/sessions/nonexistent-uuid`)
    expect(res.status()).toBe(404)
    const json = await res.json()
    expect(json.ok).toBe(false)
  })

  test('stats include network metrics when network events exist', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      {
        type: 'api.response',
        payload: {
          request: { url: '/api/users', method: 'GET' },
          response: { status: 200, body: '{}' },
          duration: 150,
        },
      },
      {
        type: 'api.response',
        payload: {
          request: { url: '/api/fail', method: 'POST' },
          response: { status: 500, body: 'error' },
          duration: 3000,
        },
      },
    ], 'NetworkApp', 'ios')

    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const sessionsJson = await sessionsRes.json()
    const session = sessionsJson.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'NetworkApp',
    )
    expect(session).toBeDefined()

    const stats = session.stats
    expect(stats.network_count).toBeGreaterThanOrEqual(2)
    expect(stats.failed_network_count).toBeGreaterThanOrEqual(1)
    expect(stats.slowest_request).toBeDefined()
    expect(stats.slowest_request.durationMs).toBeGreaterThanOrEqual(150)
  })

  test('stats for empty session have zero counts', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    // Create a session with only client.intro (no real events except the intro)
    await seedEvents(page, [], 'EmptyApp', 'ios')

    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const sessionsJson = await sessionsRes.json()
    const session = sessionsJson.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'EmptyApp',
    )
    expect(session).toBeDefined()

    const stats = session.stats
    expect(stats.error_count).toBe(0)
    expect(stats.warning_count).toBe(0)
    expect(stats.failed_network_count).toBe(0)
    expect(stats.network_count).toBe(0)
    expect(stats.slowest_request).toBeNull()
    expect(stats.longest_benchmark).toBeNull()
    expect(stats.latency).toBeNull()
  })

  test('event reset clears all sessions and events', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'error', message: 'before reset' } },
    ])

    // Session should exist with stats
    let sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    let json = await sessionsRes.json()
    expect(json.sessions.length).toBeGreaterThanOrEqual(1)

    // Reset everything
    await request.post(`${API_BASE}/api/events/reset`)

    // Sessions list should now be empty
    sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    json = await sessionsRes.json()
    expect(json.sessions).toHaveLength(0)
  })
})

// ─── Bookmark API tests ────────────────────────────────────────────────────

test.describe('Bookmarking', () => {
  test('PATCH /api/sessions/:id toggles is_important', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'bookmark test' } },
    ], 'BookmarkApp', 'ios')

    // Find session
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const session = (await sessionsRes.json()).sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'BookmarkApp',
    )
    expect(session).toBeDefined()
    expect(session.is_important).toBe(false)

    // Set bookmark
    const patchRes = await request.patch(`${API_BASE}/api/sessions/${session.id}`, {
      data: { is_important: true },
    })
    expect(patchRes.ok()).toBe(true)

    // Verify
    const singleRes = await request.get(`${API_BASE}/api/sessions/${session.id}`)
    const singleJson = await singleRes.json()
    expect(singleJson.session.is_important).toBe(true)

    // Unset bookmark
    await request.patch(`${API_BASE}/api/sessions/${session.id}`, {
      data: { is_important: false },
    })

    const verifyRes = await request.get(`${API_BASE}/api/sessions/${session.id}`)
    expect((await verifyRes.json()).session.is_important).toBe(false)
  })

  test('PATCH returns 404 for missing session', async ({ request }) => {
    const res = await request.patch(`${API_BASE}/api/sessions/nonexistent`, {
      data: { is_important: true },
    })
    expect(res.status()).toBe(404)
  })

  test('PATCH returns 400 for invalid body', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'bad patch test' } },
    ], 'BadPatchApp', 'ios')

    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const session = (await sessionsRes.json()).sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'BadPatchApp',
    )

    // Non-boolean value
    const res = await request.patch(`${API_BASE}/api/sessions/${session.id}`, {
      data: { is_important: 'maybe' },
    })
    expect(res.status()).toBe(400)
  })

  test('GET /api/sessions?is_important=true filters to bookmarked only', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'important session' } },
    ], 'ImportantApp', 'ios')
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'unimportant session' } },
    ], 'RegularApp', 'ios')

    // Find and bookmark ImportantApp session
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const importantSession = (await sessionsRes.json()).sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'ImportantApp',
    )
    await request.patch(`${API_BASE}/api/sessions/${importantSession.id}`, {
      data: { is_important: true },
    })

    // Filter
    const filteredRes = await request.get(`${API_BASE}/api/sessions?is_important=true`)
    const filteredJson = await filteredRes.json()
    expect(filteredJson.ok).toBe(true)
    expect(filteredJson.sessions.length).toBeGreaterThanOrEqual(1)
    expect(filteredJson.sessions.every((s: { is_important: boolean }) => s.is_important)).toBe(true)
  })
})

// ─── Comparison API tests ───────────────────────────────────────────────────

test.describe('Session comparison', () => {
  test('GET /api/sessions/compare returns grouped comparison', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'error', message: 'compare a error' } },
      { type: 'log', payload: { level: 'info', message: 'compare a info' } },
    ], 'CompareAppA', 'ios')
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'compare b info' } },
    ], 'CompareAppB', 'android')

    // Get session IDs
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const sessions = (await sessionsRes.json()).sessions
    const sessionA = sessions.find((s: { app_name: string | null }) => s.app_name === 'CompareAppA')
    const sessionB = sessions.find((s: { app_name: string | null }) => s.app_name === 'CompareAppB')
    expect(sessionA).toBeDefined()
    expect(sessionB).toBeDefined()

    const res = await request.get(`${API_BASE}/api/sessions/compare?a=${sessionA.id}&b=${sessionB.id}`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.sessions.a.id).toBe(sessionA.id)
    expect(json.sessions.b.id).toBe(sessionB.id)
    expect(json.sessions.a.stats).toBeDefined()
    expect(json.sessions.b.stats).toBeDefined()
    expect(json.by_type).toBeDefined()
    expect(typeof json.by_type).toBe('object')

    // Check that log type exists with correct counts
    const logType = json.by_type.log
    expect(logType).toBeDefined()
    expect(logType.a_count).toBeGreaterThanOrEqual(1)
    expect(logType.b_count).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(logType.a_events)).toBe(true)
    expect(Array.isArray(logType.b_events)).toBe(true)
  })

  test('compare returns 404 for invalid session ID', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/sessions/compare?a=invalid-id&b=also-invalid`)
    expect(res.status()).toBe(404)
  })

  test('compare returns 400 when missing params', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/sessions/compare`)
    expect(res.status()).toBe(400)
  })
})

// ─── Export with stats ──────────────────────────────────────────────────────

test.describe('Export with stats', () => {
  test('export JSONL header includes stats field', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'export stats test' } },
    ], 'ExportStatsApp', 'ios')

    const res = await request.get(`${API_BASE}/api/export`)
    const text = await res.text()
    const firstLine = text.split('\n')[0]
    const header = JSON.parse(firstLine)

    expect(header._type).toBe('session')
    expect(header.stats).toBeDefined()
    expect(header.stats.version).toBe(1)
    expect(typeof header.stats.total_events).toBe('number')
  })
})

// ─── Dashboard UI tests ────────────────────────────────────────────────────

test.describe('Dashboard session stats UI', () => {
  test('session detail shows stats panel', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'error', message: 'stats ui error' } },
      { type: 'log', payload: { level: 'info', message: 'stats ui info' } },
    ], 'StatsUIApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to session
    await page.getByText('StatsUIApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Stats panel should be visible
    await expect(page.getByText('Total Events')).toBeVisible()
    await expect(page.getByText('Errors', { exact: true })).toBeVisible()
    await expect(page.getByText('Warnings', { exact: true })).toBeVisible()
  })

  test('bookmark toggle works in session tree', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'bookmark ui test' } },
    ], 'BookmarkUIApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Expand app group
    await page.getByText('BookmarkUIApp (ios)', { exact: true }).click()

    // Star button should be visible
    const starButton = page.getByRole('button', { name: /bookmark/i }).first()
    await expect(starButton).toBeVisible()

    // Click to bookmark
    await starButton.click()
    // Should stay visible (optimistic update)
    await expect(starButton).toBeVisible()
  })

  test('bookmarked-only filter toggle is visible', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'filter toggle test' } },
    ])

    await openDashboard(page)
    await switchToHistory(page)

    await expect(page.getByText('Bookmarked only')).toBeVisible()
  })

  test('Compare Sessions button is visible on history tab', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'compare button test' } },
    ])

    await openDashboard(page)
    await switchToHistory(page)

    await expect(page.getByRole('button', { name: 'Compare Sessions' })).toBeVisible()
  })
})
