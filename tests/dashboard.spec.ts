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

test.describe('Dashboard controls', () => {
  test('has Refresh Events button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Refresh Events/i })).toBeVisible()
  })

  test('has Reset Logs button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Reset Logs/i })).toBeVisible()
  })

  test('has Dump State button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Dump State/i })).toBeVisible()
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

test.describe('Stats display', () => {
  test('shows App Clients stat', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('App Clients')).toBeVisible()
  })

  test('shows Error Events stat', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Error Events')).toBeVisible()
  })

  test('shows Network Events stat', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Network Events')).toBeVisible()
  })

  test('shows Proxy Port stat', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Proxy Port')).toBeVisible()
  })
})

test.describe('Filters section', () => {
  test('has Type dropdown', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Type').first()).toBeVisible()
  })

  test('has Level dropdown', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Level').first()).toBeVisible()
  })

  test('has URL filter input', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder('/graphql')).toBeVisible()
  })

  test('has Errors only checkbox', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Errors only')).toBeVisible()
  })

  test('has Reset filter button', async ({ page }) => {
    await page.goto('/')
    // There are two "Reset" buttons — Reset Logs and the filter Reset
    const resetButtons = page.getByRole('button', { name: 'Reset' })
    await expect(resetButtons.first()).toBeVisible()
  })
})

test.describe('Events and State panels', () => {
  test('shows Curated Events section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/Curated Events/)).toBeVisible()
  })

  test('shows State Snapshot section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'State Snapshot' })).toBeVisible()
  })

  test('shows default state text when no state loaded', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('No state loaded yet')).toBeVisible()
  })
})
