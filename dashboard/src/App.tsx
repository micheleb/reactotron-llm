import { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Code,
  Checkbox,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Select,
  Stat,
  StatLabel,
  StatNumber,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react'

import type { CuratedEvent } from '@shared/types'

type EventsResponse = {
  ok: boolean
  count: number
  events: CuratedEvent[]
}

type HealthResponse = {
  ok: boolean
  clients: number
  port: number
  dashboardWsPort: number
  latestStateAt: string | null
}

const DEFAULT_API_BASE = 'http://localhost:9090'
const DEFAULT_WS_URL = 'ws://localhost:9092'

function normalizePlaceholders(value: unknown): unknown {
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

function formatJson(value: unknown): string {
  return JSON.stringify(normalizePlaceholders(value), null, 2)
}

function byNewest(a: CuratedEvent, b: CuratedEvent): number {
  return new Date(b.ts).getTime() - new Date(a.ts).getTime()
}

function formatTime(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts

  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE)
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL)
  const [events, setEvents] = useState<CuratedEvent[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [stateText, setStateText] = useState('No state loaded yet')
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [typeFilter, setTypeFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)

  async function loadHealth() {
    const res = await fetch(`${apiBase}/health`)
    const json = (await res.json()) as HealthResponse
    setHealth(json)
  }

  async function loadEvents() {
    const res = await fetch(`${apiBase}/api/events?limit=300`)
    const json = (await res.json()) as EventsResponse
    if (!json.ok) return
    setEvents([...json.events].sort(byNewest))
  }

  async function loadState() {
    const res = await fetch(`${apiBase}/api/state`)
    const json = await res.json()
    if (!json.ok) {
      setStateText(json.error ?? 'No state yet')
      return
    }
    setStateText(formatJson(json.state))
  }

  async function requestDumpState() {
    await fetch(`${apiBase}/dump-state`)
    await loadState()
  }

  async function resetEvents() {
    await fetch(`${apiBase}/api/events/reset`, { method: 'POST' })
    setEvents([])
  }

  useEffect(() => {
    loadHealth().catch(() => undefined)
    loadEvents().catch(() => undefined)
    loadState().catch(() => undefined)
  }, [apiBase])

  useEffect(() => {
    setWsStatus('connecting')
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setWsStatus('open')
    ws.onclose = () => setWsStatus('closed')

    ws.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data)
        if (parsed.kind === 'event' && parsed.event) {
          setEvents((current) => [parsed.event, ...current].sort(byNewest).slice(0, 500))
        }
        if (parsed.kind === 'events-reset') {
          setEvents([])
        }
        if (parsed.kind === 'state-updated') {
          loadState().catch(() => undefined)
        }
      } catch {
        // Ignore malformed dashboard events.
      }
    }

    return () => ws.close()
  }, [wsUrl])

  const errorCount = useMemo(() => events.filter((event) => event.level === 'error').length, [events])
  const networkCount = useMemo(() => events.filter((event) => event.network !== undefined).length, [events])
  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((event) => event.type))).sort((a, b) => a.localeCompare(b)),
    [events],
  )
  const filteredEvents = useMemo(() => {
    return [...events]
      .filter((event) => {
      if (errorsOnly && event.level !== 'error') return false
      if (typeFilter && event.type !== typeFilter) return false
      if (levelFilter && (event.level ?? '') !== levelFilter) return false
      if (urlFilter) {
        const url = (event.network?.url ?? '').toLowerCase()
        if (!url.includes(urlFilter.toLowerCase())) return false
      }
      return true
      })
      .sort(byNewest)
  }, [errorsOnly, events, levelFilter, typeFilter, urlFilter])

  return (
    <Box minH="100vh" maxW="100vw" overflowX="auto" bgGradient="linear(to-br, gray.950, black, gray.900)" p={6}>
      <VStack align="stretch" spacing={4}>
        <Flex justify="space-between" align="end" wrap="wrap" gap={3}>
          <Box>
            <Heading size="lg" color="gray.100">Reactotron LLM Dashboard</Heading>
            <Text color="gray.300">Live curated events + state snapshots</Text>
          </Box>
          <HStack>
            <Badge colorScheme={wsStatus === 'open' ? 'green' : wsStatus === 'connecting' ? 'yellow' : 'red'}>
              WS {wsStatus}
            </Badge>
            <Button size="sm" onClick={() => loadEvents().catch(() => undefined)}>
              Refresh Events
            </Button>
            <Button size="sm" variant="outline" colorScheme="red" onClick={() => resetEvents().catch(() => undefined)}>
              Reset Logs
            </Button>
            <Button size="sm" colorScheme="blue" onClick={() => requestDumpState().catch(() => undefined)}>
              Dump State
            </Button>
          </HStack>
        </Flex>

        <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={4} minW={0}>
          <GridItem minW={0}>
            <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
              <Heading size="sm" mb={3}>Connection Settings</Heading>
              <HStack align="start" spacing={3}>
                <Box flex="1">
                  <Text fontSize="sm" mb={1}>API Base</Text>
                  <Input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" mb={1}>Live WS URL</Text>
                  <Input value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} />
                </Box>
              </HStack>
            </Box>
          </GridItem>
          <GridItem minW={0}>
            <Grid templateColumns="repeat(2, 1fr)" gap={3}>
              <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                <Stat>
                  <StatLabel>App Clients</StatLabel>
                  <StatNumber>{health?.clients ?? 0}</StatNumber>
                </Stat>
              </Box>
              <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                <Stat>
                  <StatLabel>Error Events</StatLabel>
                  <StatNumber>{errorCount}</StatNumber>
                </Stat>
              </Box>
              <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                <Stat>
                  <StatLabel>Network Events</StatLabel>
                  <StatNumber>{networkCount}</StatNumber>
                </Stat>
              </Box>
              <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                <Stat>
                  <StatLabel>Proxy Port</StatLabel>
                  <StatNumber>{health?.port ?? 9090}</StatNumber>
                </Stat>
              </Box>
            </Grid>
          </GridItem>
        </Grid>
        <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
          <Heading size="sm" mb={3}>Filters</Heading>
          <HStack align="end" spacing={3} wrap="wrap" minW={0}>
            <Box minW="220px">
              <Text fontSize="sm" mb={1}>Type</Text>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All</option>
                {eventTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </Box>
            <Box minW="180px">
              <Text fontSize="sm" mb={1}>Level</Text>
              <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                <option value="">All</option>
                <option value="error">error</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
                <option value="debug">debug</option>
              </Select>
            </Box>
            <Box minW="260px" flex="1">
              <Text fontSize="sm" mb={1}>URL contains</Text>
              <Input value={urlFilter} onChange={(e) => setUrlFilter(e.target.value)} placeholder="/graphql" />
            </Box>
            <Checkbox isChecked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} pb={1}>
              Errors only
            </Checkbox>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTypeFilter('')
                setLevelFilter('')
                setUrlFilter('')
                setErrorsOnly(false)
              }}
            >
              Reset
            </Button>
          </HStack>
        </Box>

        <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={4} minW={0}>
          <GridItem minW={0}>
            <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="65vh" overflowY="auto" overflowX="auto" minW={0}>
              <Heading size="sm" mb={3}>Curated Events ({filteredEvents.length}/{events.length})</Heading>
              <VStack align="stretch" spacing={3}>
                {filteredEvents.map((event, index) => (
                  (() => {
                    const actionDisplay = event.action?.displayName
                    const actionLabel = event.action?.name ?? event.action?.type
                    const showActionAsPrimary =
                      event.type === 'state.action.complete' &&
                      actionLabel !== undefined &&
                      actionLabel !== null
                    const primaryLabel = showActionAsPrimary ? (actionDisplay ?? `action.${actionLabel}`) : event.type
                    const primaryType = showActionAsPrimary ? 'ACTION' : event.type
                    const hasActionPayload =
                      !!event.action && Object.prototype.hasOwnProperty.call(event.action, 'payload')
                    return (
                  <Box
                    key={`${event.ts}-${index}`}
                    p={3}
                    borderWidth="1px"
                    borderColor="gray.700"
                    borderRadius="md"
                    bg="gray.950"
                    borderLeftWidth="4px"
                    borderLeftColor={event.level === 'error' ? 'red.400' : event.network ? 'cyan.400' : 'blue.400'}
                    minW={0}
                  >
                    <HStack justify="space-between" mb={2} align="center" minW={0}>
                      <HStack spacing={2} minW={0}>
                        <Code fontSize="sm" px={2} py={1}>{primaryType}</Code>
                        <Text fontSize="sm" color="gray.200" fontFamily="mono">{primaryLabel}</Text>
                        {showActionAsPrimary ? (
                          <Text fontSize="xs" color="gray.400">({event.type})</Text>
                        ) : null}
                      </HStack>
                      <Box
                        as="span"
                        fontSize="sm"
                        px={2}
                        py={1}
                        borderRadius="md"
                        bg="cyan.700"
                        color="white"
                        fontFamily="mono"
                        fontWeight="700"
                        lineHeight="1"
                        title={event.ts}
                      >
                        {formatTime(event.ts)}
                      </Box>
                    </HStack>
                    {event.message ? <Text mb={2}>{event.message}</Text> : null}
                    {event.action ? (
                      <Box mb={2}>
                        <Text fontSize="sm" color="orange.300">
                          Action {event.action.name ?? event.action.type ?? 'unknown'}
                        </Text>
                        {hasActionPayload ? (
                          <Accordion allowToggle mt={2}>
                            <AccordionItem borderColor="gray.700" borderRadius="md">
                              <AccordionButton px={3} py={2}>
                                <Box flex="1" textAlign="left" fontSize="sm" color="gray.300">
                                  Action Payload
                                </Box>
                                <AccordionIcon />
                              </AccordionButton>
                              <AccordionPanel pt={2}>
                                <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={2} maxW="100%" overflowX="auto">
                                  {formatJson(event.action.payload)}
                                </Code>
                              </AccordionPanel>
                            </AccordionItem>
                          </Accordion>
                        ) : null}
                      </Box>
                    ) : null}
                    {event.network ? (
                      <Accordion allowToggle mb={2}>
                        <AccordionItem borderColor="gray.700" borderRadius="md">
                          <AccordionButton px={3} py={2}>
                            <Box flex="1" textAlign="left">
                              <Text fontSize="sm" color="cyan.300" wordBreak="break-word" overflowWrap="anywhere">
                                {event.network.method ?? 'REQ'} {event.network.url ?? '-'} {event.network.status ?? ''}
                              </Text>
                              <Text fontSize="xs" color="gray.400">{event.network.durationMs ?? '-'} ms</Text>
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                          <AccordionPanel pt={2}>
                            <Tabs size="sm" variant="enclosed" isLazy>
                              <TabList overflowX="auto" whiteSpace="nowrap">
                                <Tab>Summary</Tab>
                                <Tab>Request</Tab>
                                <Tab>Response</Tab>
                                <Tab>Headers</Tab>
                              </TabList>
                              <TabPanels>
                                <TabPanel px={1} py={3}>
                                  <Code whiteSpace="pre-wrap" display="block" p={2}>
                                    {formatJson({
                                      method: event.network.method,
                                      url: event.network.url,
                                      status: event.network.status,
                                      durationMs: event.network.durationMs,
                                      error: event.network.error,
                                    })}
                                  </Code>
                                </TabPanel>
                                <TabPanel px={1} py={3}>
                                  <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={2} maxW="100%" overflowX="auto">
                                    {formatJson(event.network.requestBody ?? 'No request body')}
                                  </Code>
                                </TabPanel>
                                <TabPanel px={1} py={3}>
                                  <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={2} maxW="100%" overflowX="auto">
                                    {formatJson(event.network.responseBody ?? 'No response body')}
                                  </Code>
                                </TabPanel>
                                <TabPanel px={1} py={3}>
                                  <Text fontSize="xs" color="gray.400" mb={1}>Request Headers</Text>
                                  <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={2} mb={3} maxW="100%" overflowX="auto">
                                    {formatJson(event.network.requestHeaders ?? 'No request headers')}
                                  </Code>
                                  <Text fontSize="xs" color="gray.400" mb={1}>Response Headers</Text>
                                  <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={2} maxW="100%" overflowX="auto">
                                    {formatJson(event.network.responseHeaders ?? 'No response headers')}
                                  </Code>
                                </TabPanel>
                              </TabPanels>
                            </Tabs>
                          </AccordionPanel>
                        </AccordionItem>
                      </Accordion>
                    ) : null}
                    {event.stack ? <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={2} maxW="100%" overflowX="auto">{event.stack}</Code> : null}
                  </Box>
                    )
                  })()
                ))}
              </VStack>
            </Box>
          </GridItem>

          <GridItem minW={0}>
            <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="65vh" overflowY="auto" overflowX="auto" minW={0}>
              <Heading size="sm" mb={3}>State Snapshot</Heading>
              <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={3} maxW="100%" overflowX="auto">{stateText}</Code>
            </Box>
          </GridItem>
        </Grid>
      </VStack>
    </Box>
  )
}
