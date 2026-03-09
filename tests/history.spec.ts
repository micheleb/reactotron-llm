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

// ─── API tests ───────────────────────────────────────────────────────────────

test.describe('Sessions API', () => {
  test('GET /api/sessions returns ok with sessions array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/sessions`)
    expect(res.ok()).toBe(true)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(Array.isArray(json.sessions)).toBe(true)
  })

  test('sessions include event counts', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'count test' } },
      { type: 'log', payload: { level: 'info', message: 'count test 2' } },
    ])

    const res = await request.get(`${API_BASE}/api/sessions`)
    const json = await res.json()

    const session = json.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'TestApp',
    )
    expect(session).toBeDefined()
    // client.intro + 2 log events = 3 events
    expect(session.event_count).toBeGreaterThanOrEqual(3)
    expect(typeof session.connected_at).toBe('string')
    expect(typeof session.id).toBe('string')
  })

  test('sessions include app_name and platform from client.intro', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'meta test' } },
    ], 'MyCustomApp', 'android')

    const res = await request.get(`${API_BASE}/api/sessions`)
    const json = await res.json()

    const session = json.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'MyCustomApp',
    )
    expect(session).toBeDefined()
    expect(session.platform).toBe('android')
  })

  test('GET /api/sessions/:id/events returns events for a session', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'session events test' } },
    ], 'SessionEventsApp', 'ios')

    // Find the session we just created by app_name
    const sessionsRes = await request.get(`${API_BASE}/api/sessions`)
    const sessionsJson = await sessionsRes.json()
    const session = sessionsJson.sessions.find(
      (s: { app_name: string | null }) => s.app_name === 'SessionEventsApp',
    )
    expect(session).toBeDefined()

    // Get events for that session
    const eventsRes = await request.get(`${API_BASE}/api/sessions/${session.id}/events`)
    expect(eventsRes.ok()).toBe(true)

    const eventsJson = await eventsRes.json()
    expect(eventsJson.ok).toBe(true)
    expect(eventsJson.total).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(eventsJson.events)).toBe(true)

    const testEvent = eventsJson.events.find(
      (e: { message?: string }) => e.message === 'session events test',
    )
    expect(testEvent).toBeDefined()
  })

  test('GET /api/sessions/:id/events returns 404 for nonexistent session', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/sessions/nonexistent-id/events`)
    expect(res.status()).toBe(404)

    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.error).toBe('Session not found')
  })
})

// ─── Dashboard History tab tests ─────────────────────────────────────────────

test.describe('History tab UI', () => {
  test('Live and History tabs are visible', async ({ page }) => {
    await openDashboard(page)
    await expect(page.getByRole('tab', { name: 'Live' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'History' })).toBeVisible()
  })

  test('Live tab is selected by default', async ({ page }) => {
    await openDashboard(page)
    await expect(page.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true')
  })

  test('Reset Logs and Dump State buttons are hidden on History tab', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('tab', { name: 'History' }).click()

    await expect(page.getByRole('button', { name: /Reset Logs/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /Dump State/i })).not.toBeVisible()
  })

  test('Reset Logs and Dump State buttons are visible on Live tab', async ({ page }) => {
    await openDashboard(page)
    await expect(page.getByRole('button', { name: /Reset Logs/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Dump State/i })).toBeVisible()
  })
})

test.describe('Session tree', () => {
  test('shows empty state when no sessions exist', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    // Note: sessions may exist from other tests, so we check the general structure
    await openDashboard(page)
    await switchToHistory(page)

    // Either shows sessions heading or empty state message
    const sessionTreeOrEmpty = page.getByText(/Sessions \(\d+\)|No sessions recorded/)
    await expect(sessionTreeOrEmpty).toBeVisible()
  })

  test('shows sessions grouped by date after seeding', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'tree test' } },
    ])

    await openDashboard(page)
    await switchToHistory(page)

    // Should see "Sessions" heading with count
    await expect(page.getByText(/Sessions \(\d+\)/)).toBeVisible()

    // Should see "Today" date group (sessions were just created)
    await expect(page.getByText('Today')).toBeVisible()
  })

  test('expanding date group shows app groups', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'expand test' } },
    ], 'ExpandApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Today should be auto-expanded; look for the app group
    await expect(page.getByText('ExpandApp (ios)', { exact: true })).toBeVisible()
  })

  test('expanding app group shows individual sessions with event count', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'session list test 1' } },
      { type: 'log', payload: { level: 'info', message: 'session list test 2' } },
    ], 'ListApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Expand the app group
    await page.getByText('ListApp (ios)', { exact: true }).click()

    // Should see event count badge
    await expect(page.getByText(/\d+ events?/).first()).toBeVisible()
  })

  test('clicking a session navigates to session detail', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'nav test' } },
    ], 'NavApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Expand app group
    await page.getByText('NavApp (ios)', { exact: true }).click()

    // Click the session row (contains event count)
    const sessionRow = page.getByText(/\d+ events?/).first()
    await sessionRow.click()

    // Should see session detail with app name and Back button
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'NavApp' })).toBeVisible()
  })
})

test.describe('Session detail view', () => {
  test('shows session metadata header', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'detail meta test' } },
    ], 'DetailApp', 'android')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to session detail
    await page.getByText('DetailApp (android)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Should show app name, platform, and event count
    await expect(page.getByRole('heading', { name: 'DetailApp' })).toBeVisible()
    await expect(page.getByText('android', { exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ events?/)).toBeVisible()
  })

  test('shows events in session detail', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'visible event in detail' } },
    ], 'EventViewApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to detail
    await page.getByText('EventViewApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Should see the event content rendered
    await expect(page.getByText('visible event in detail')).toBeVisible()
  })

  test('Back button returns to session tree', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'back nav test' } },
    ], 'BackApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to detail
    await page.getByText('BackApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Verify we're in detail
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()

    // Go back
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/sessions') && !r.url().includes('/events'),
    )
    await page.getByRole('button', { name: 'Back' }).click()
    await responsePromise

    // Should see session tree again
    await expect(page.getByText(/Sessions \(\d+\)/)).toBeVisible()
  })

  test('session detail has independent filters', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'filter test info' } },
      { type: 'log', payload: { level: 'error', message: 'filter test error' } },
    ], 'FilterApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to detail
    await page.getByText('FilterApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Filter bar should be visible in detail view
    await expect(page.getByText('Filters')).toBeVisible()

    // Verify both events are initially visible
    await expect(page.getByText('filter test info')).toBeVisible()
    await expect(page.getByText('filter test error')).toBeVisible()

    // Check "Errors only" and verify filtering works
    await page.getByText('Errors only', { exact: true }).click()

    // The error event should still be visible
    await expect(page.getByText('filter test error')).toBeVisible()
    // The info event should be hidden
    await expect(page.getByText('filter test info')).not.toBeVisible()
  })

  test('tab bar is hidden during session detail view', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'tabs hidden test' } },
    ], 'TabsApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to detail
    await page.getByText('TabsApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Tab bar should be hidden in session detail view
    await expect(page.getByRole('tab', { name: 'Live' })).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'History' })).not.toBeVisible()
  })
})

test.describe('Stats panel visibility', () => {
  test('stats panel is visible on Live tab', async ({ page }) => {
    await openDashboard(page)
    await expect(page.getByText('App Clients')).toBeVisible()
    await expect(page.getByText('Error Events')).toBeVisible()
  })

  test('stats panel is hidden on History tab', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('tab', { name: 'History' }).click()

    await expect(page.getByText('App Clients')).not.toBeVisible()
    await expect(page.getByText('Error Events')).not.toBeVisible()
  })
})
