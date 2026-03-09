import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:19090'

test.describe('WebSocket connectivity', () => {
  test('app WS endpoint accepts connections and sends "connected"', async ({ page }) => {
    const connected = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const ws = new WebSocket('ws://localhost:19090/ws')
        const timeout = setTimeout(() => { ws.close(); resolve(false) }, 5000)
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'connected') {
            clearTimeout(timeout)
            ws.close()
            resolve(true)
          }
        }
        ws.onerror = () => { clearTimeout(timeout); ws.close(); resolve(false) }
      })
    })
    expect(connected).toBe(true)
  })

  test('dashboard WS endpoint sends "hello" on connect', async ({ page }) => {
    const hello = await page.evaluate(() => {
      return new Promise<{ kind: string; clientId: string } | null>((resolve) => {
        const ws = new WebSocket('ws://localhost:19092')
        const timeout = setTimeout(() => { ws.close(); resolve(null) }, 5000)
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.kind === 'hello') {
            clearTimeout(timeout)
            ws.close()
            resolve(data)
          }
        }
        ws.onerror = () => { clearTimeout(timeout); ws.close(); resolve(null) }
      })
    })
    expect(hello).not.toBeNull()
    expect(hello!.kind).toBe('hello')
    expect(hello!.clientId).toBeDefined()
  })
})

test.describe('Event ingestion via WebSocket', () => {
  test('events sent via app WS appear in GET /api/events', async ({ page, request }) => {
    // Reset events
    await request.post(`${API_BASE}/api/events/reset`)

    // Connect as an app client and send a log event via the browser
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket('ws://localhost:19090/ws')
        const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')) }, 5000)
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'connected') {
            clearTimeout(timeout)
            ws.send(JSON.stringify({
              type: 'log',
              payload: { level: 'info', message: 'playwright test event' },
            }))
            // Give the server time to process
            setTimeout(() => { ws.close(); resolve() }, 300)
          }
        }
        ws.onerror = () => { clearTimeout(timeout); ws.close(); reject(new Error('WS error')) }
      })
    })

    // Fetch events and check
    const res = await request.get(`${API_BASE}/api/events`)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.count).toBeGreaterThanOrEqual(1)

    const testEvent = json.events.find(
      (e: { message?: string }) => e.message === 'playwright test event',
    )
    expect(testEvent).toBeDefined()
    expect(testEvent.type).toBe('log')
  })
})
