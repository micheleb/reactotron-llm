import type { CuratedEvent, JsonObject } from './types'

export function asObject(value: unknown): JsonObject | undefined {
  if (value && typeof value === 'object') return value as JsonObject
  return undefined
}

export function getByPath(obj: unknown, pathExpr: string): unknown {
  let cursor: unknown = obj
  for (const key of pathExpr.split('.')) {
    const current = asObject(cursor)
    if (!current) return undefined
    cursor = current[key]
  }
  return cursor
}

export function firstString(obj: unknown, paths: string[]): string | undefined {
  for (const p of paths) {
    const value = getByPath(obj, p)
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

export function firstNumber(obj: unknown, paths: string[]): number | undefined {
  for (const p of paths) {
    const value = getByPath(obj, p)
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

export function firstValue(obj: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const value = getByPath(obj, p)
    if (value !== undefined) return value
  }
  return undefined
}

export function maybeParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function normalizeActionPayload(value: unknown): unknown {
  const parsed = maybeParseJsonString(value)
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return undefined
    if (parsed.length === 1) return normalizeActionPayload(parsed[0])
    return normalizeActionPayload(parsed[0])
  }
  return parsed
}

function formatActionDisplayName(pathValue: string | undefined, nameValue: string | undefined): string | undefined {
  if (!nameValue) return undefined
  if (!pathValue) return `${nameValue}()`

  const trimmedPath = pathValue.startsWith('/') ? pathValue.slice(1) : pathValue
  if (!trimmedPath) return `${nameValue}()`
  return `${trimmedPath}.${nameValue}()`
}

export function deepFindByKeys(
  root: unknown,
  keys: string[],
  maxDepth = 6,
  maxNodes = 3000,
): unknown {
  const wanted = new Set(keys.map((k) => k.toLowerCase()))
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const seen = new Set<object>()
  let visited = 0

  while (queue.length > 0 && visited < maxNodes) {
    const current = queue.shift()
    if (!current) break
    const { value, depth } = current
    visited += 1

    if (value === null || value === undefined || depth > maxDepth) continue

    if (Array.isArray(value)) {
      for (const item of value) queue.push({ value: item, depth: depth + 1 })
      continue
    }

    if (typeof value !== 'object') continue
    if (seen.has(value)) continue
    seen.add(value)

    const obj = value as JsonObject
    for (const [key, nested] of Object.entries(obj)) {
      if (wanted.has(key.toLowerCase())) {
        return nested
      }
      queue.push({ value: nested, depth: depth + 1 })
    }
  }

  return undefined
}

export function getMessageType(payload: unknown): string {
  return firstString(payload, ['type', 'event', 'payload.type', 'data.type']) ?? 'unknown'
}

export function getMessageLevel(payload: unknown): string | undefined {
  return firstString(payload, ['level', 'payload.level', 'data.level'])
}

export function inferState(payload: unknown): unknown {
  const type = getMessageType(payload).toLowerCase()
  const looksStateLike =
    type.includes('state') || type.includes('redux') || type.includes('subscription')

  const candidate = firstValue(payload, [
    'state',
    'values',
    'payload.state',
    'payload.values',
    'payload.snapshot',
    'data.state',
  ])

  if (!looksStateLike && getByPath(payload, 'state') === undefined) {
    return null
  }

  return candidate ?? null
}

function extractNetwork(payload: unknown): CuratedEvent['network'] | undefined {
  const method = firstString(payload, [
    'method',
    'verb',
    'config.method',
    'request.method',
    'request.config.method',
    'request.options.method',
    'payload.method',
    'payload.verb',
    'payload.config.method',
    'payload.request.method',
    'payload.request.config.method',
    'data.method',
    'data.verb',
    'data.config.method',
    'data.request.method',
    'data.request.config.method',
  ])

  const url = firstString(payload, [
    'url',
    'uri',
    'path',
    'endpoint',
    'config.url',
    'request.url',
    'request.path',
    'request.config.url',
    'payload.url',
    'payload.uri',
    'payload.config.url',
    'payload.path',
    'payload.request.url',
    'payload.request.path',
    'payload.request.config.url',
    'data.url',
    'data.uri',
    'data.config.url',
    'data.request.url',
    'data.request.path',
    'data.request.config.url',
  ])

  const status = firstNumber(payload, [
    'status',
    'response.statusCode',
    'response.status',
    'payload.status',
    'payload.response.statusCode',
    'payload.response.status',
    'data.status',
    'data.response.statusCode',
    'data.response.status',
  ])

  const durationMs = firstNumber(payload, [
    'duration',
    'durationMs',
    'responseTime',
    'elapsedTime',
    'payload.duration',
    'payload.durationMs',
    'payload.responseTime',
    'payload.elapsedTime',
    'data.duration',
    'data.durationMs',
    'data.responseTime',
    'data.elapsedTime',
  ])

  const requestContainer = firstValue(payload, ['request', 'payload.request', 'data.request'])
  const responseContainer = firstValue(payload, ['response', 'payload.response', 'data.response'])
  const configContainer = firstValue(payload, ['config', 'payload.config', 'data.config'])

  const requestBodyDirect = firstValue(payload, [
    'config.data',
    'request.data',
    'request._bodyInit',
    'request.query',
    'request.variables',
    'query',
    'variables',
    'request.body',
    'request.bodyString',
    'request.config.data',
    'payload.config.data',
    'payload.request.data',
    'payload.request._bodyInit',
    'payload.request.query',
    'payload.request.variables',
    'payload.query',
    'payload.variables',
    'payload.request.body',
    'payload.request.bodyString',
    'payload.request.config.data',
    'data.config.data',
    'data.request.data',
    'data.request._bodyInit',
    'data.request.query',
    'data.request.variables',
    'data.query',
    'data.variables',
    'data.request.body',
    'data.request.bodyString',
    'data.request.config.data',
    'payload.requestBody',
    'data.requestBody',
    'requestBody',
    'payload.body',
    'payload.bodyString',
  ])

  const responseBodyDirect = firstValue(payload, [
    'response.data',
    'response.body',
    'response.bodyString',
    'payload.response.data',
    'payload.response.body',
    'payload.response.bodyString',
    'data.response.data',
    'data.response.body',
    'data.response.bodyString',
    'payload.responseBody',
    'data.responseBody',
    'responseBody',
    'payload.response',
    'data',
    'payload.data',
  ])

  const requestHeadersDirect = firstValue(payload, [
    'config.headers',
    'request.headers',
    'request.config.headers',
    'payload.config.headers',
    'payload.request.headers',
    'payload.request.config.headers',
    'payload.requestHeaders',
    'data.config.headers',
    'data.request.headers',
    'data.request.config.headers',
    'data.requestHeaders',
    'requestHeaders',
  ])

  const responseHeadersDirect = firstValue(payload, [
    'headers',
    'response.headers',
    'payload.headers',
    'payload.response.headers',
    'payload.responseHeaders',
    'data.headers',
    'data.response.headers',
    'data.responseHeaders',
    'responseHeaders',
  ])

  const error = firstString(payload, [
    'error.message',
    'payload.error.message',
    'data.error.message',
    'response.error',
    'payload.response.error',
    'data.response.error',
    'error',
    'payload.error',
  ])

  const deepRequestHeaders =
    deepFindByKeys(requestContainer, ['headers']) ??
    deepFindByKeys(configContainer, ['headers']) ??
    deepFindByKeys(payload, ['requestheaders', 'request_headers'])
  const deepResponseHeaders =
    deepFindByKeys(responseContainer, ['headers']) ??
    deepFindByKeys(payload, ['responseheaders', 'response_headers'])

  const deepRequestBody =
    deepFindByKeys(requestContainer, ['data', 'body', 'bodystring']) ??
    deepFindByKeys(configContainer, ['data', 'body', 'bodystring']) ??
    deepFindByKeys(payload, ['query', 'variables'])
  const deepResponseBody =
    deepFindByKeys(responseContainer, ['data', 'body', 'bodystring', 'result']) ??
    deepFindByKeys(payload, ['responsebody', 'response_body'])

  const finalRequestHeaders = requestHeadersDirect ?? deepRequestHeaders
  const finalResponseHeaders = responseHeadersDirect ?? deepResponseHeaders
  const finalRequestBody = maybeParseJsonString(requestBodyDirect ?? deepRequestBody)
  const finalResponseBody = maybeParseJsonString(responseBodyDirect ?? deepResponseBody)

  if (
    method === undefined &&
    url === undefined &&
    status === undefined &&
    durationMs === undefined &&
    finalRequestHeaders === undefined &&
    finalResponseHeaders === undefined &&
    finalRequestBody === undefined &&
    finalResponseBody === undefined &&
    error === undefined
  ) {
    return undefined
  }

  return {
    method,
    url,
    status,
    durationMs,
    requestHeaders: finalRequestHeaders,
    responseHeaders: finalResponseHeaders,
    requestBody: finalRequestBody,
    responseBody: finalResponseBody,
    error,
  }
}

function extractDetails(payload: unknown): JsonObject | undefined {
  const root = asObject(payload)
  if (!root) return undefined

  const details: JsonObject = {}
  for (const [key, value] of Object.entries(root)) {
    if (
      key === 'payload' ||
      key === 'data' ||
      key === 'state' ||
      key === 'values' ||
      key === 'request' ||
      key === 'response'
    ) {
      continue
    }

    const t = typeof value
    if (value == null || t === 'string' || t === 'number' || t === 'boolean') {
      details[key] = value
    }
  }

  return Object.keys(details).length > 0 ? details : undefined
}

/**
 * Curate a raw Reactotron event payload into a structured CuratedEvent.
 * Returns null if the event has no useful fields.
 *
 * Note: shouldDrop() is NOT called here — filtering happens at ingestion time,
 * before this function is invoked.
 */
export function curateEvent(payload: unknown, timestamp: string): CuratedEvent | null {
  const type = getMessageType(payload)
  const level = getMessageLevel(payload)
  const msgType = type.toLowerCase()

  const event: CuratedEvent = { ts: timestamp, type }
  if (level) event.level = level

  const message = firstString(payload, ['message', 'payload.message', 'data.message'])
  const stack = firstString(payload, [
    'stack',
    'payload.stack',
    'data.stack',
    'error.stack',
    'payload.error.stack',
  ])

  if (message) event.message = message
  if (stack) event.stack = stack

  if (msgType.includes('action')) {
    const actionContainer = firstValue(payload, ['action', 'payload.action', 'data.action'])
    const actionName = firstString(payload, [
      'action.name',
      'payload.action.name',
      'data.action.name',
      'actionName',
      'payload.actionName',
      'data.actionName',
      'name',
    ])
    const actionPath = firstString(payload, [
      'action.path',
      'payload.action.path',
      'data.action.path',
      'path',
      'payload.path',
      'data.path',
    ])
    const actionPayload = normalizeActionPayload(
      firstValue(payload, [
        'action.payload',
        'action.payload.0',
        'action.payload.0.payload',
        'action.payload.0.args',
        'payload.action.payload',
        'payload.action.payload.0',
        'payload.action.payload.0.payload',
        'payload.action.payload.0.args',
        'data.action.payload',
        'data.action.payload.0',
        'data.action.payload.0.payload',
        'data.action.payload.0.args',
        'action.args',
        'action.args.0',
        'action.arguments',
        'action.arguments.0',
        'action.params',
        'action.params.0',
        'payload.action.args',
        'payload.action.args.0',
        'payload.action.arguments',
        'payload.action.arguments.0',
        'payload.action.params',
        'payload.action.params.0',
        'data.action.args',
        'data.action.args.0',
        'data.action.arguments',
        'data.action.arguments.0',
        'data.action.params',
        'data.action.params.0',
        'payload.payload',
        'payload.payload.0',
        'data.payload',
        'data.payload.0',
      ]) ??
        deepFindByKeys(actionContainer, ['payload', 'args', 'arguments', 'params']) ??
        deepFindByKeys(payload, ['actionpayload', 'action_payload']),
    )

    event.action = {
      type: firstString(payload, ['action.type', 'payload.action.type', 'data.action.type', 'name']),
      name: actionName,
      path: actionPath,
      displayName: formatActionDisplayName(actionPath, actionName),
      payload: actionPayload,
    }

    const changed = firstValue(payload, ['changed', 'payload.changed', 'data.changed'])
    if (Array.isArray(changed)) {
      event.changed = changed.filter((v): v is string => typeof v === 'string')
    }
  }

  const network = extractNetwork(payload)
  if (network) event.network = network

  if (msgType.includes('benchmark')) {
    event.benchmark = {
      title: firstString(payload, ['title', 'payload.title', 'data.title']),
      steps: firstValue(payload, ['steps', 'payload.steps', 'data.steps']),
    }
  }

  event.details = extractDetails(payload)

  const hasUsefulFields =
    event.message !== undefined ||
    event.stack !== undefined ||
    event.network !== undefined ||
    event.action !== undefined ||
    event.benchmark !== undefined ||
    (event.details !== undefined && Object.keys(event.details).length > 0)

  return hasUsefulFields ? event : null
}
