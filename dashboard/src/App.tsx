import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Stat,
  StatLabel,
  StatNumber,
  Tab,
  TabList,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react'

import type { CuratedEvent } from '@shared/types'
import EventCard from './components/EventCard'
import FilterBar from './components/FilterBar'
import SessionCompare from './components/SessionCompare'
import SessionDetail from './components/SessionDetail'
import SessionTree from './components/SessionTree'

type EventsResponse = {
  ok: boolean
  count: number
  events: CuratedEvent[]
  hasMore: boolean
}

type HealthResponse = {
  ok: boolean
  clients: number
  port: number
  dashboardWsPort: number
  latestStateAt: string | null
}

type ViewState =
  | { tab: 'live' }
  | { tab: 'history'; view: 'list' }
  | { tab: 'history'; view: 'session'; sessionId: string }
  | { tab: 'history'; view: 'compare'; sessionA: string; sessionB: string }

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

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE)
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL)
  const [events, setEvents] = useState<CuratedEvent[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [stateText, setStateText] = useState('No state loaded yet')
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [serverLoadedCount, setServerLoadedCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [viewState, setViewState] = useState<ViewState>({ tab: 'live' })
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())

  const tabIndex = viewState.tab === 'live' ? 0 : 1

  async function loadHealth() {
    const res = await fetch(`${apiBase}/health`)
    const json = (await res.json()) as HealthResponse
    setHealth(json)
  }

  async function loadEvents() {
    const res = await fetch(`${apiBase}/api/events?limit=1000`)
    const json = (await res.json()) as EventsResponse
    if (!json.ok) return
    setEvents([...json.events].sort(byNewest))
    setHasMore(json.hasMore)
    setServerLoadedCount(json.count)
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const res = await fetch(`${apiBase}/api/events?limit=500&offset=${serverLoadedCount}`)
      const json = (await res.json()) as EventsResponse
      if (!json.ok) return
      setEvents((current) => {
        const existingKeys = new Set(current.map((e) => `${e.ts}|${e.type}`))
        const newEvents = json.events.filter((e) => !existingKeys.has(`${e.ts}|${e.type}`))
        return [...current, ...newEvents].sort(byNewest)
      })
      setHasMore(json.hasMore)
      setServerLoadedCount((prev) => prev + json.count)
    } finally {
      setLoadingMore(false)
    }
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
          setEvents((current) => [parsed.event, ...current].sort(byNewest))
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

  const isSessionDetail = viewState.tab === 'history' && viewState.view === 'session'
  const isCompareView = viewState.tab === 'history' && viewState.view === 'compare'

  function toggleCompareSelect(sessionId: string) {
    setSelectedForCompare((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else if (next.size < 2) {
        next.add(sessionId)
      }
      return next
    })
  }

  function startCompare() {
    const ids = Array.from(selectedForCompare)
    if (ids.length === 2) {
      setViewState({ tab: 'history', view: 'compare', sessionA: ids[0], sessionB: ids[1] })
      setCompareMode(false)
      setSelectedForCompare(new Set())
    }
  }

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
            {viewState.tab === 'live' ? (
              <>
                <Button size="sm" onClick={() => loadEvents().catch(() => undefined)}>
                  Refresh Events
                </Button>
                <Button size="sm" variant="outline" colorScheme="red" onClick={() => resetEvents().catch(() => undefined)}>
                  Reset Logs
                </Button>
                <Button size="sm" colorScheme="blue" onClick={() => requestDumpState().catch(() => undefined)}>
                  Dump State
                </Button>
                <Button
                  size="sm"
                  colorScheme="teal"
                  isDisabled={events.length === 0}
                  onClick={() => {
                    const params = new URLSearchParams()
                    if (typeFilter) params.set('type', typeFilter)
                    if (levelFilter) params.set('level', levelFilter)
                    else if (errorsOnly) params.set('level', 'error')
                    const qs = params.toString()
                    window.open(`${apiBase}/api/export${qs ? `?${qs}` : ''}`)
                  }}
                >
                  Export
                </Button>
              </>
            ) : null}
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
          {viewState.tab === 'live' ? (
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
          ) : null}
        </Grid>

        {!isSessionDetail && !isCompareView ? (
          <Tabs
            index={tabIndex}
            onChange={(index) => {
              if (index === 0) {
                setViewState({ tab: 'live' })
                setCompareMode(false)
                setSelectedForCompare(new Set())
              } else {
                setViewState({ tab: 'history', view: 'list' })
              }
            }}
            variant="enclosed"
            colorScheme="cyan"
          >
            <TabList>
              <Tab>Live</Tab>
              <Tab>History</Tab>
            </TabList>
          </Tabs>
        ) : null}

        {viewState.tab === 'live' ? (
          <>
            <FilterBar
              typeFilter={typeFilter}
              levelFilter={levelFilter}
              urlFilter={urlFilter}
              errorsOnly={errorsOnly}
              eventTypes={eventTypes}
              onTypeFilterChange={setTypeFilter}
              onLevelFilterChange={setLevelFilter}
              onUrlFilterChange={setUrlFilter}
              onErrorsOnlyChange={setErrorsOnly}
              onReset={() => {
                setTypeFilter('')
                setLevelFilter('')
                setUrlFilter('')
                setErrorsOnly(false)
              }}
            />

            <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={4} minW={0}>
              <GridItem minW={0}>
                <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="65vh" overflowY="auto" overflowX="auto" minW={0}>
                  <Heading size="sm" mb={3}>Curated Events ({filteredEvents.length}/{events.length})</Heading>
                  <VStack align="stretch" spacing={3}>
                    {filteredEvents.map((event, index) => (
                      <EventCard key={`${event.ts}-${index}`} event={event} />
                    ))}
                  </VStack>
                  {hasMore ? (
                    <Button
                      mt={4}
                      w="100%"
                      size="sm"
                      variant="outline"
                      isLoading={loadingMore}
                      onClick={() => loadMore().catch(() => undefined)}
                    >
                      Load more
                    </Button>
                  ) : null}
                </Box>
              </GridItem>

              <GridItem minW={0}>
                <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="65vh" overflowY="auto" overflowX="auto" minW={0}>
                  <Heading size="sm" mb={3}>State Snapshot</Heading>
                  <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={3} maxW="100%" overflowX="auto">{stateText}</Code>
                </Box>
              </GridItem>
            </Grid>
          </>
        ) : viewState.view === 'list' ? (
          <VStack align="stretch" spacing={3}>
            <HStack spacing={3}>
              <Button
                size="sm"
                variant={compareMode ? 'solid' : 'outline'}
                colorScheme="cyan"
                onClick={() => {
                  setCompareMode(!compareMode)
                  setSelectedForCompare(new Set())
                }}
              >
                {compareMode ? 'Cancel Compare' : 'Compare Sessions'}
              </Button>
              {compareMode && selectedForCompare.size === 2 ? (
                <Button size="sm" colorScheme="cyan" onClick={startCompare}>
                  Compare Selected ({selectedForCompare.size}/2)
                </Button>
              ) : compareMode ? (
                <Text fontSize="sm" color="gray.400">
                  Select 2 sessions to compare ({selectedForCompare.size}/2)
                </Text>
              ) : null}
            </HStack>
            <SessionTree
              apiBase={apiBase}
              onSelectSession={(sessionId) =>
                setViewState({ tab: 'history', view: 'session', sessionId })
              }
              compareMode={compareMode}
              selectedForCompare={selectedForCompare}
              onToggleCompareSelect={toggleCompareSelect}
            />
          </VStack>
        ) : viewState.view === 'compare' ? (
          <SessionCompare
            apiBase={apiBase}
            sessionA={viewState.sessionA}
            sessionB={viewState.sessionB}
            onBack={() => setViewState({ tab: 'history', view: 'list' })}
          />
        ) : (
          <SessionDetail
            apiBase={apiBase}
            sessionId={viewState.sessionId}
            onBack={() => setViewState({ tab: 'history', view: 'list' })}
            onCompareWith={() => {
              setCompareMode(true)
              setSelectedForCompare(new Set([viewState.sessionId]))
              setViewState({ tab: 'history', view: 'list' })
            }}
          />
        )}
      </VStack>
    </Box>
  )
}
