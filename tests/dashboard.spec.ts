import { test, expect } from '@playwright/test'

test.describe('Dashboard page load', () => {
  test('renders the main heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Reactotron LLM Dashboard/i })).toBeVisible()
  })

  test('renders the subtitle', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Live curated events + state snapshots')).toBeVisible()
  })

  test('shows WebSocket connection status badge', async ({ page }) => {
    await page.goto('/')
    const badge = page.getByText(/WS (open|connecting|closed)/i)
    await expect(badge).toBeVisible()
  })
})

test.describe('Tab bar', () => {
  test('shows Browse Sessions and Live tabs when no clients', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('tab-browse-sessions')).toBeVisible()
    await expect(page.getByTestId('tab-live-placeholder')).toBeVisible()
  })

  test('Live placeholder tab is selected by default', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('tab-live-placeholder')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Waiting for a client to connect/i })).toBeVisible()
  })
})

test.describe('Live placeholder', () => {
  test('shows connection troubleshooting tips', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Waiting for a client to connect/i })).toBeVisible()
    await expect(page.getByText('Connection Tips')).toBeVisible()
    await expect(page.getByText('Android physical device')).toBeVisible()
    await expect(page.getByText('Android emulator')).toBeVisible()
    await expect(page.getByText('iOS simulator')).toBeVisible()
  })

  test('shows adb reverse command', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/adb reverse/)).toBeVisible()
  })
})

test.describe('Browse Sessions tab', () => {
  test('Reset Logs button is on Browse Sessions tab', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('tab-browse-sessions').click()
    await expect(page.getByTestId('reset-logs-btn')).toBeVisible()
  })

  test('Reset Logs is not visible on Live placeholder tab', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('tab-live-placeholder')).toBeVisible()
    await expect(page.getByTestId('reset-logs-btn')).not.toBeVisible()
  })
})

test.describe('Connection settings', () => {
  test('displays API Base input with default value', async ({ page }) => {
    await page.goto('/')
    const input = page.locator('input').first()
    await expect(input).toHaveValue('http://localhost:9090')
  })

  test('displays Live WS URL input with default value', async ({ page }) => {
    await page.goto('/')
    const input = page.locator('input').nth(1)
    await expect(input).toHaveValue('ws://localhost:9092')
  })
})
