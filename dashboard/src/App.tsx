import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react'

import type { CuratedEvent } from '@shared/types'
import { formatJson } from './utils/normalize'
import LiveClientView from './components/LiveClientView'
import LivePlaceholderView from './components/LivePlaceholderView'
import SessionCompare from './components/SessionCompare'
import SessionDetail from './components/SessionDetail'
import SessionTree from './components/SessionTree'
import TabBar from './components/TabBar'
import { useClientRegistry } from './hooks/useClientRegistry'
import { useNowTick } from './hooks/useNowTick'

type HealthResponse = {
  ok: boolean
  clients: number
  port: number
  dashboardWsPort: number
  latestStateAt: string | null
}

type HistoryView =
  | { view: 'list' }
  | { view: 'session'; sessionId: string }
  | { view: 'compare'; sessionA: string; sessionB: string }

const DEFAULT_API_BASE = 'http://localhost:9090'
const DEFAULT_WS_URL = 'ws://localhost:9092'

function byNewest(a: CuratedEvent, b: CuratedEvent): number {
  return new Date(b.ts).getTime() - new Date(a.ts).getTime()
}

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE)
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL)
  const [selectedTabId, setSelectedTabId] = useState<string>('live')
  const [closedClientIds, setClosedClientIds] = useState<Set<string>>(new Set())
  const [eventsByClient, setEventsByClient] = useState<Map<string, CuratedEvent[]>>(new Map())
  const [stateText, setStateText] = useState('No state loaded yet')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [historyView, setHistoryView] = useState<HistoryView>({ view: 'list' })
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())
  const { isOpen: isResetConfirmOpen, onOpen: onResetConfirmOpen, onClose: onResetConfirmClose } = useDisclosure()
  const resetCancelRef = useRef<HTMLButtonElement>(null)

  const closedIdsRef = useRef(closedClientIds)
  closedIdsRef.current = closedClientIds

  const handleEvent = useCallback((clientId: string, event: CuratedEvent) => {
    if (closedIdsRef.current.has(clientId)) return
    setEventsByClient((prev) => {
      const next = new Map(prev)
      const existing = next.get(clientId) ?? []
      next.set(clientId, [event, ...existing].sort(byNewest))
      return next
    })
  }, [])

  const handleEventsReset = useCallback(() => {
    setEventsByClient(new Map())
    setStateText('No state loaded yet')
  }, [])

  const apiBaseRef = useRef(apiBase)
  apiBaseRef.current = apiBase

  const handleStateUpdated = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseRef.current}/api/state`)
      const json = await res.json()
      if (json.ok) setStateText(formatJson(json.state))
    } catch { /* ignore */ }
  }, [])

  const { orderedClients, wsStatus } = useClientRegistry({
    wsUrl,
    onEvent: handleEvent,
    onEventsReset: handleEventsReset,
    onStateUpdated: handleStateUpdated,
  })

  const now = useNowTick(10_000)

  const visibleClients = useMemo(
    () => orderedClients.filter((c) => !closedClientIds.has(c.clientId)),
    [orderedClients, closedClientIds],
  )

  // Auto-select first client when transitioning from Live placeholder
  useEffect(() => {
    if (selectedTabId === 'live' && visibleClients.length > 0) {
      setSelectedTabId(visibleClients[0].clientId)
    }
  }, [selectedTabId, visibleClients])

  // Backfill events for newly-seen clients via REST
  const backfilledRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const client of orderedClients) {
      if (backfilledRef.current.has(client.clientId)) continue
      backfilledRef.current.add(client.clientId)
      fetch(`${apiBase}/api/sessions/${client.clientId}/events`)
        .then((r) => r.json())
        .then((json) => {
          if (!json.ok || !Array.isArray(json.events)) return
          setEventsByClient((prev) => {
            const existing = prev.get(client.clientId) ?? []
            if (existing.length > 0) return prev
            return new Map(prev).set(client.clientId, [...json.events].sort(byNewest))
          })
        })
        .catch(() => {})
    }
  }, [orderedClients, apiBase])

  useEffect(() => {
    fetch(`${apiBase}/health`).then((r) => r.json()).then(setHealth).catch(() => undefined)
  }, [apiBase])

  useEffect(() => {
    fetch(`${apiBase}/api/state`).then((r) => r.json()).then((json) => {
      if (json.ok) setStateText(formatJson(json.state))
      else setStateText(json.error ?? 'No state yet')
    }).catch(() => undefined)
  }, [apiBase])

  function closeClientTab(clientId: string) {
    const idx = visibleClients.findIndex((c) => c.clientId === clientId)
    setClosedClientIds((prev) => new Set(prev).add(clientId))
    setEventsByClient((prev) => { const n = new Map(prev); n.delete(clientId); return n })
    if (selectedTabId === clientId) {
      const remaining = visibleClients.filter((c) => c.clientId !== clientId)
      if (remaining.length > 0) {
        setSelectedTabId(remaining[Math.max(0, idx - 1)].clientId)
      } else {
        setSelectedTabId('live')
      }
    }
  }

  function handleTabSelect(id: string) {
    setSelectedTabId(id)
    if (id === 'browse') {
      setHistoryView({ view: 'list' })
      setCompareMode(false)
      setSelectedForCompare(new Set())
    }
  }

  async function resetEvents() {
    await fetch(`${apiBase}/api/events/reset`, { method: 'POST' })
    setEventsByClient(new Map())
    setStateText('No state loaded yet')
  }

  async function requestDumpState() {
    await fetch(`${apiBase}/dump-state`)
  }

  const activeClient = visibleClients.find((c) => c.clientId === selectedTabId) ?? null
  const activeEvents = activeClient ? (eventsByClient.get(activeClient.clientId) ?? []) : []
  const isBrowseTab = selectedTabId === 'browse'
  const isSessionDetail = isBrowseTab && historyView.view === 'session'
  const isCompareView = isBrowseTab && historyView.view === 'compare'

  const errorCount = useMemo(() => activeEvents.filter((e) => e.level === 'error').length, [activeEvents])
  const networkCount = useMemo(() => activeEvents.filter((e) => e.network !== undefined).length, [activeEvents])

  function toggleCompareSelect(sessionId: string) {
    setSelectedForCompare((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else if (next.size < 2) next.add(sessionId)
      return next
    })
  }

  function startCompare() {
    const ids = Array.from(selectedForCompare)
    if (ids.length === 2) {
      setHistoryView({ view: 'compare', sessionA: ids[0], sessionB: ids[1] })
      setCompareMode(false)
      setSelectedForCompare(new Set())
    }
  }

  return (
    <Box minH="100vh" maxW="100vw" overflowX="auto" bg="#151515" p={6}>
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
          {activeClient ? (
            <GridItem minW={0}>
              <Grid templateColumns="repeat(2, 1fr)" gap={3}>
                <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                  <Stat><StatLabel>App Clients</StatLabel><StatNumber>{health?.clients ?? 0}</StatNumber></Stat>
                </Box>
                <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                  <Stat><StatLabel>Error Events</StatLabel><StatNumber>{errorCount}</StatNumber></Stat>
                </Box>
                <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                  <Stat><StatLabel>Network Events</StatLabel><StatNumber>{networkCount}</StatNumber></Stat>
                </Box>
                <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
                  <Stat><StatLabel>Proxy Port</StatLabel><StatNumber>{health?.port ?? 9090}</StatNumber></Stat>
                </Box>
              </Grid>
            </GridItem>
          ) : null}
        </Grid>

        {!isSessionDetail && !isCompareView ? (
          <TabBar
            selectedTabId={selectedTabId}
            clients={visibleClients}
            now={now}
            onSelect={handleTabSelect}
            onClose={closeClientTab}
          />
        ) : null}

        {activeClient ? (
          <LiveClientView
            key={activeClient.clientId}
            apiBase={apiBase}
            client={activeClient}
            events={activeEvents}
            stateText={stateText}
            onDumpState={() => requestDumpState().catch(() => undefined)}
            onRefresh={() => {
              fetch(`${apiBase}/api/sessions/${activeClient.clientId}/events`)
                .then((r) => r.json())
                .then((json) => {
                  if (json.ok) {
                    setEventsByClient((prev) =>
                      new Map(prev).set(activeClient.clientId, [...json.events].sort(byNewest)),
                    )
                  }
                })
                .catch(() => {})
            }}
          />
        ) : selectedTabId === 'live' ? (
          <LivePlaceholderView apiBase={apiBase} />
        ) : isBrowseTab && historyView.view === 'list' ? (
          <VStack align="stretch" spacing={3}>
            <HStack spacing={3}>
              <Button
                size="sm"
                variant="outline"
                colorScheme="red"
                onClick={onResetConfirmOpen}
                data-testid="reset-logs-btn"
              >
                Reset Logs
              </Button>
              <Button
                size="sm"
                variant={compareMode ? 'solid' : 'outline'}
                colorScheme="reactotron"
                onClick={() => {
                  setCompareMode(!compareMode)
                  setSelectedForCompare(new Set())
                }}
              >
                {compareMode ? 'Cancel Compare' : 'Compare Sessions'}
              </Button>
              {compareMode && selectedForCompare.size === 2 ? (
                <Button size="sm" colorScheme="reactotron" onClick={startCompare}>
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
                setHistoryView({ view: 'session', sessionId })
              }
              compareMode={compareMode}
              selectedForCompare={selectedForCompare}
              onToggleCompareSelect={toggleCompareSelect}
            />
          </VStack>
        ) : isCompareView ? (
          <SessionCompare
            apiBase={apiBase}
            sessionA={historyView.sessionA}
            sessionB={historyView.sessionB}
            onBack={() => setHistoryView({ view: 'list' })}
          />
        ) : historyView.view === 'session' ? (
          <SessionDetail
            apiBase={apiBase}
            sessionId={historyView.sessionId}
            onBack={() => setHistoryView({ view: 'list' })}
            onCompareWith={() => {
              setCompareMode(true)
              setSelectedForCompare(new Set([historyView.sessionId]))
              setHistoryView({ view: 'list' })
            }}
          />
        ) : null}
      </VStack>
      <AlertDialog
        isOpen={isResetConfirmOpen}
        onClose={onResetConfirmClose}
        leastDestructiveRef={resetCancelRef}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent bg="gray.900" borderColor="gray.700" borderWidth="1px">
            <AlertDialogHeader color="gray.100">Reset all logs?</AlertDialogHeader>
            <AlertDialogBody color="gray.300">
              This permanently deletes <Text as="span" fontWeight="bold" color="red.300">every event from every session</Text> on the server and clears the view for all connected dashboards. This cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={resetCancelRef} onClick={onResetConfirmClose}>Cancel</Button>
              <Button
                colorScheme="red"
                ml={3}
                onClick={() => {
                  onResetConfirmClose()
                  resetEvents().catch(() => undefined)
                }}
                data-testid="reset-logs-confirm"
              >
                Reset Logs
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
