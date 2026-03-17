import { test, expect, type Page } from '@playwright/test'

const API_BASE = 'http://localhost:19090'

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

async function openDashboard(page: Page): Promise<void> {
  await page.goto('/')
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('19090') && r.url().includes('/api/events'),
  )
  await page.locator('input').first().fill('http://localhost:19090')
  await responsePromise
}

async function switchToHistory(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/sessions') && !r.url().includes('/events'),
  )
  await page.getByRole('tab', { name: 'History' }).click()
  await responsePromise
}

// ─── Per-event copy button ──────────────────────────────────────────────────

test.describe('Per-event copy button', () => {
  test('copy button is visible on each event card', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'copy button test' } },
    ])

    await openDashboard(page)

    // Wait for the event to render
    await expect(page.getByText('copy button test')).toBeVisible()

    // Copy button should be visible (aria-label "Copy as markdown")
    const copyBtn = page.getByRole('button', { name: 'Copy as markdown' }).first()
    await expect(copyBtn).toBeVisible()
  })

  test('clicking copy button writes full-detail markdown to clipboard', async ({ page, request }) => {
    // Set up clipboard interceptor before navigating
    await page.addInitScript(() => {
      (window as unknown as Record<string, string>).__clipboardText = ''
      const originalClipboard = navigator.clipboard
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          ...originalClipboard,
          writeText: (text: string) => {
            (window as unknown as Record<string, string>).__clipboardText = text
            return Promise.resolve()
          },
          readText: () => Promise.resolve((window as unknown as Record<string, string>).__clipboardText),
        },
        configurable: true,
      })
    })

    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'clipboard write test' } },
    ])

    await openDashboard(page)
    await expect(page.getByText('clipboard write test')).toBeVisible()

    // Click the copy button on the event card that contains our log message
    const eventCard = page.getByTestId('event-card').filter({ hasText: 'clipboard write test' })
    await eventCard.getByRole('button', { name: 'Copy as markdown' }).click()

    // Read intercepted clipboard text
    const clipboardText = await page.evaluate(() => (window as unknown as Record<string, string>).__clipboardText)
    expect(clipboardText).toContain('### log')
    expect(clipboardText).toContain('clipboard write test')
  })
})

// ─── Text mode toggle ──────────────────────────────────────────────────────

test.describe('Text mode toggle', () => {
  test('text mode toggle button is visible in live view', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await openDashboard(page)

    const toggle = page.getByTestId('text-mode-toggle')
    await expect(toggle).toBeVisible()
  })

  test('clicking text mode toggle shows pre block with markdown', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'text mode event' } },
    ])

    await openDashboard(page)
    await expect(page.getByText('text mode event')).toBeVisible()

    // Toggle text mode
    await page.getByTestId('text-mode-toggle').click()

    // The text mode view should appear
    const textView = page.getByTestId('text-mode-view')
    await expect(textView).toBeVisible()

    // It should contain the event as markdown text
    const content = await textView.textContent()
    expect(content).toContain('### log')
    expect(content).toContain('text mode event')
  })

  test('toggling text mode off restores card view', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'toggle off test' } },
    ])

    await openDashboard(page)
    await expect(page.getByText('toggle off test')).toBeVisible()

    // Toggle on
    await page.getByTestId('text-mode-toggle').click()
    await expect(page.getByTestId('text-mode-view')).toBeVisible()

    // Toggle off
    await page.getByTestId('text-mode-toggle').click()
    await expect(page.getByTestId('text-mode-view')).not.toBeVisible()

    // Events should render as cards again
    await expect(page.getByText('toggle off test')).toBeVisible()
  })
})

// ─── Copy All Visible ───────────────────────────────────────────────────────

test.describe('Copy All Visible', () => {
  test('copy all button is visible in live view', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await openDashboard(page)

    const copyAllBtn = page.getByTestId('copy-all-btn')
    await expect(copyAllBtn).toBeVisible()
  })

  test('copy all writes summary markdown with header to clipboard', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'bulk copy event 1' } },
      { type: 'log', payload: { level: 'info', message: 'bulk copy event 2' } },
    ], 'BulkApp', 'android')

    await openDashboard(page)
    await expect(page.getByText('bulk copy event 1')).toBeVisible()

    // Intercept clipboard API
    await page.evaluate(() => {
      (window as unknown as Record<string, string>).__clipboardText = ''
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            (window as unknown as Record<string, string>).__clipboardText = text
            return Promise.resolve()
          },
          readText: () => Promise.resolve((window as unknown as Record<string, string>).__clipboardText),
        },
        writable: true,
      })
    })

    // Click copy all
    await page.getByTestId('copy-all-btn').click()

    // Read intercepted clipboard text
    const clipboardText = await page.evaluate(() => (window as unknown as Record<string, string>).__clipboardText)

    // Should contain the session header
    expect(clipboardText).toContain('## Reactotron Events')
    expect(clipboardText).toContain('BulkApp')

    // Should contain summary lines for the events
    expect(clipboardText).toContain('bulk copy event 1')
    expect(clipboardText).toContain('bulk copy event 2')

    // Should contain event count
    expect(clipboardText).toContain('**Events:**')
  })

  test('copy all shows toast notification on success', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'toast test' } },
    ])

    await openDashboard(page)
    await expect(page.getByText('toast test')).toBeVisible()

    // Intercept clipboard to prevent errors
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.resolve(),
          readText: () => Promise.resolve(''),
        },
        writable: true,
      })
    })

    await page.getByTestId('copy-all-btn').click()

    // Toast should appear
    await expect(page.getByText(/Copied \d+ events? to clipboard/)).toBeVisible()
  })
})

// ─── Session Detail copy/paste ──────────────────────────────────────────────

test.describe('Session detail copy/paste', () => {
  test('text mode toggle works in session detail view', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'session text mode' } },
    ], 'TextModeApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to session detail
    await page.getByText('TextModeApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    // Wait for events
    await expect(page.getByText('session text mode')).toBeVisible()

    // Toggle text mode
    await page.getByTestId('text-mode-toggle').click()

    const textView = page.getByTestId('text-mode-view')
    await expect(textView).toBeVisible()

    const content = await textView.textContent()
    expect(content).toContain('session text mode')
  })

  test('copy all works in session detail view', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'session copy all' } },
    ], 'CopyAllApp', 'ios')

    await openDashboard(page)
    await switchToHistory(page)

    // Navigate to session detail
    await page.getByText('CopyAllApp (ios)', { exact: true }).click()
    await page.getByText(/\d+ events?/).first().click()

    await expect(page.getByText('session copy all')).toBeVisible()

    // Intercept clipboard API
    await page.evaluate(() => {
      (window as unknown as Record<string, string>).__clipboardText = ''
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            (window as unknown as Record<string, string>).__clipboardText = text
            return Promise.resolve()
          },
          readText: () => Promise.resolve((window as unknown as Record<string, string>).__clipboardText),
        },
        writable: true,
      })
    })

    // Click copy all
    await page.getByTestId('copy-all-btn').click()

    const clipboardText = await page.evaluate(() => (window as unknown as Record<string, string>).__clipboardText)
    expect(clipboardText).toContain('## Reactotron Events')
    expect(clipboardText).toContain('CopyAllApp')
    expect(clipboardText).toContain('session copy all')
  })
})

// ─── Filters + copy interaction ─────────────────────────────────────────────

test.describe('Filters and copy interaction', () => {
  test('copy all respects active filters', async ({ page, request }) => {
    await request.post(`${API_BASE}/api/events/reset`)
    await seedEvents(page, [
      { type: 'log', payload: { level: 'info', message: 'info event for filter' } },
      { type: 'log', payload: { level: 'error', message: 'error event for filter' } },
    ])

    await openDashboard(page)
    await expect(page.getByText('info event for filter')).toBeVisible()

    // Enable "Errors only" filter
    await page.getByText('Errors only', { exact: true }).click()

    // Only error should be visible
    await expect(page.getByText('error event for filter')).toBeVisible()
    await expect(page.getByText('info event for filter')).not.toBeVisible()

    // Intercept clipboard API
    await page.evaluate(() => {
      (window as unknown as Record<string, string>).__clipboardText = ''
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            (window as unknown as Record<string, string>).__clipboardText = text
            return Promise.resolve()
          },
          readText: () => Promise.resolve((window as unknown as Record<string, string>).__clipboardText),
        },
        writable: true,
      })
    })

    // Copy all
    await page.getByTestId('copy-all-btn').click()

    const clipboardText = await page.evaluate(() => (window as unknown as Record<string, string>).__clipboardText)
    // Should contain error event
    expect(clipboardText).toContain('error event for filter')
    // Should NOT contain info event
    expect(clipboardText).not.toContain('info event for filter')
  })
})
