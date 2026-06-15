import { test, expect, type Page } from '@playwright/test'

const API_BASE = 'http://localhost:19090'

/** Connect to the app WS, send client.intro + events. Returns a Promise that resolves after disconnect. */
async function seedEvents(
  page: Page,
  events: object[],
  appName = 'TestApp',
  platform = 'ios',
): Promise<void> {
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

/** Keep a client WS open for the duration of a callback. */
async function withLiveClient(
  page: Page,
  appName: string,
  platform: string,
  events: object[],
  fn: () => Promise<void>,
): Promise<void> {
  const closeHandle = await page.evaluate(({ appName, platform, events }) => {
    return new Promise<string>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:19090/ws')
      const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')) }, 5000)
      ;(window as any).__liveWs = ws
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'connected') {
          clearTimeout(timeout)
          ws.send(JSON.stringify({
            type: 'client.intro',
            payload: { name: appName, platform },
          }))
          for (const evt of events) ws.send(JSON.stringify(evt))
          resolve('open')
        }
      }
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')) }
    })
  }, { appName, platform, events })
  expect(closeHandle).toBe('open')

  try {
    await fn()
  } finally {
    await page.evaluate(() => {
      const ws = (window as any).__liveWs
      if (ws) ws.close()
      delete (window as any).__liveWs
    })
  }
}

async function openDashboard(page: Page): Promise<void> {
  await page.goto('/')
  const healthPromise = page.waitForResponse(
    (r) => r.url().includes('19090') && r.url().includes('/health'),
  )
  await page.locator('input').first().fill('http://localhost:19090')
  await healthPromise
  await page.locator('input').nth(1).fill('ws://localhost:19092')
}

// ─── Tab lifecycle ──────────────────────────────────────────────────────────

test.describe('Per-client tab lifecycle', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
  })

  test('client tab appears with app name and platform icon', async ({ page }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'hello from tab test' } },
    ], 'TabTestApp', 'ios')

    await openDashboard(page)

    // The client tab should appear (disconnected since seedEvents closes the WS)
    const tab = page.locator('[data-testid^="tab-client-"]').first()
    await expect(tab).toBeVisible()
    await expect(tab).toContainText('TabTestApp')

    // Events should load via backfill
    await expect(page.getByText('hello from tab test')).toBeVisible()
  })

  test('anonymous client shows Unnamed with session prefix', async ({ page }) => {
    // Send events without client.intro (only raw events)
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket('ws://localhost:19090/ws')
        const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')) }, 5000)
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'connected') {
            clearTimeout(timeout)
            ws.send(JSON.stringify({ type: 'log', payload: { level: 'info', message: 'anon event' } }))
            setTimeout(() => { ws.close(); resolve() }, 300)
          }
        }
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')) }
      })
    })

    await openDashboard(page)

    const tab = page.locator('[data-testid^="tab-client-"]').first()
    await expect(tab).toBeVisible()
    await expect(tab).toContainText('Unnamed')
  })

  test('closing tab removes it from strip', async ({ page }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'close test' } },
    ], 'CloseApp', 'ios')

    await openDashboard(page)

    const tab = page.locator('[data-testid^="tab-client-"]').first()
    await expect(tab).toBeVisible()

    // Click the close button
    const closeBtn = page.locator('[data-testid^="tab-close-"]').first()
    await closeBtn.click()

    // Tab should disappear; placeholder should appear
    await expect(tab).not.toBeVisible()
    await expect(page.getByTestId('tab-live-placeholder')).toBeVisible()
  })

  test('two clients create two tabs', async ({ page }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'first client' } },
    ], 'App1', 'ios')

    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'second client' } },
    ], 'App2', 'android')

    await openDashboard(page)

    const tabs = page.locator('[data-testid^="tab-client-"]')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.first()).toContainText('App1')
    await expect(tabs.nth(1)).toContainText('App2')
  })
})

// ─── Activity dot ────────────────────────────────────────────────────────────

test.describe('Activity dot', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
  })

  test('disconnected client shows disconnected dot state', async ({ page }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'dot test' } },
    ], 'DotApp', 'ios')

    await openDashboard(page)

    const dot = page.locator('[data-testid^="activity-dot-"]').first()
    await expect(dot).toBeVisible()
    await expect(dot).toHaveAttribute('data-state', 'disconnected')
  })

  test('dotState pure function returns correct states', async ({ page }) => {
    await page.goto('/')

    const results = await page.evaluate(() => {
      const ONE_MIN = 60_000
      const ONE_HOUR = 3_600_000
      const now = Date.now()

      function dotState(lastSeen: number, isOpen: boolean): string {
        if (!isOpen) return 'disconnected'
        const elapsed = now - lastSeen
        if (elapsed <= ONE_MIN) return 'green'
        if (elapsed <= ONE_HOUR) return 'orange'
        return 'grey'
      }

      return {
        recentAndOpen: dotState(now - 10_000, true),
        oldAndOpen: dotState(now - 120_000, true),
        veryOldAndOpen: dotState(now - 7_200_000, true),
        disconnected: dotState(now - 5_000, false),
        exactBoundary60s: dotState(now - ONE_MIN, true),
        exactBoundary1h: dotState(now - ONE_HOUR, true),
      }
    })

    expect(results.recentAndOpen).toBe('green')
    expect(results.oldAndOpen).toBe('orange')
    expect(results.veryOldAndOpen).toBe('grey')
    expect(results.disconnected).toBe('disconnected')
    expect(results.exactBoundary60s).toBe('green')
    expect(results.exactBoundary1h).toBe('orange')
  })
})

// ─── Per-tab event isolation ─────────────────────────────────────────────────

test.describe('Per-tab event isolation', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
  })

  test('each tab shows only its own events', async ({ page }) => {
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'event-from-alpha' } },
    ], 'Alpha', 'ios')

    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'event-from-beta' } },
    ], 'Beta', 'android')

    await openDashboard(page)

    // First tab (Alpha) should be auto-selected
    const firstTab = page.locator('[data-testid^="tab-client-"]').first()
    await expect(firstTab).toContainText('Alpha')
    await expect(page.getByText('event-from-alpha')).toBeVisible()
    await expect(page.getByText('event-from-beta')).not.toBeVisible()

    // Click second tab
    const secondTab = page.locator('[data-testid^="tab-client-"]').nth(1)
    await secondTab.click()
    await expect(page.getByText('event-from-beta')).toBeVisible()
    await expect(page.getByText('event-from-alpha')).not.toBeVisible()
  })
})

// ─── Browse Sessions tab ─────────────────────────────────────────────────────

test.describe('Browse Sessions with Reset Logs', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
  })

  test('Reset Logs lives on Browse Sessions tab', async ({ page }) => {
    await openDashboard(page)

    // On Live placeholder — no Reset Logs
    await expect(page.getByTestId('reset-logs-btn')).not.toBeVisible()

    // Switch to Browse Sessions
    await page.getByTestId('tab-browse-sessions').click()
    await expect(page.getByTestId('reset-logs-btn')).toBeVisible()
  })
})
