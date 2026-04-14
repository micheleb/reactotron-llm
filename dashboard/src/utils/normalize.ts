export function normalizePlaceholders(value: unknown): unknown {
  if (typeof value === 'string') {
    switch (value.trim()) {
      case '~~~ false ~~~':
        return false
      case '~~~ true ~~~':
        return true
      case '~~~ null ~~~':
        return null
      case '~~~ zero ~~~':
        return 0
      case '~~~ empty string ~~~':
        return ''
      case '~~~ undefined ~~~':
        return null
      default:
        return value
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizePlaceholders(item))
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const normalized: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(obj)) {
      normalized[key] = normalizePlaceholders(item)
    }
    return normalized
  }

  return value
}

export function formatJson(value: unknown): string {
  return JSON.stringify(normalizePlaceholders(value), null, 2)
}

export function formatTime(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts

  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}
