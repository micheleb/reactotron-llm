import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  IconButton,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  VStack,
} from '@chakra-ui/react'
import { StarIcon } from '@chakra-ui/icons'
import { Virtuoso } from 'react-virtuoso'

import type { CuratedEvent } from '@shared/types'
import type { SessionStats } from '@shared/types'
import EventCard from './EventCard'
import FilterBar from './FilterBar'
import { useEventFilter } from '../hooks/useEventFilter'

type SessionEventsResponse = {
  ok: boolean
  total: number
  events: CuratedEvent[]
}

type SessionResponse = {
  ok: boolean
  session: {
    id: string
    app_name: string | null
    platform: string | null
    connected_at: string
    disconnected_at: string | null
    event_count: number
    is_important: boolean
    stats: SessionStats | null
  }
}

function formatTimeRange(connectedAt: string, disconnectedAt: string | null): string {
  const start = new Date(connectedAt)
  const fmt = (d: Date) => {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }
  if (!disconnectedAt) return `${fmt(start)} - now`
  const end = new Date(disconnectedAt)
  return `${fmt(start)} - ${fmt(end)}`
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

type Props = {
  apiBase: string
  sessionId: string
  onBack: () => void
  onCompareWith?: () => void
}

export default function SessionDetail({ apiBase, sessionId, onBack, onCompareWith }: Props) {
  const [events, setEvents] = useState<CuratedEvent[]>([])
  const [meta, setMeta] = useState<SessionResponse['session'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const {
    typeFilter,
    levelFilter,
    urlFilter,
    errorsOnly,
    sortOrder,
    eventTypes,
    filteredEvents,
    setTypeFilter,
    setLevelFilter,
    setUrlFilter,
    setErrorsOnly,
    toggleSortOrder,
    resetFilters,
  } = useEventFilter(events)

  async function loadSession() {
    setLoading(true)
    setError(null)
    try {
      const [eventsRes, sessionRes] = await Promise.all([
        fetch(`${apiBase}/api/sessions/${sessionId}/events`),
        fetch(`${apiBase}/api/sessions/${sessionId}`),
      ])

      const eventsJson = (await eventsRes.json()) as SessionEventsResponse
      if (!eventsJson.ok) {
        setError('Session not found')
        return
      }
      setEvents(eventsJson.events)

      const sessionJson = (await sessionRes.json()) as SessionResponse
      if (sessionJson.ok) {
        setMeta(sessionJson.session)
      }
    } catch {
      setError('Failed to load session events')
    } finally {
      setLoading(false)
    }
  }

  async function toggleBookmark() {
    if (!meta) return
    const newValue = !meta.is_important
    setMeta({ ...meta, is_important: newValue })
    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_important: newValue }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setMeta({ ...meta, is_important: !newValue })
    }
  }

  useEffect(() => {
    loadSession().catch(() => undefined)
  }, [sessionId, apiBase])


  if (loading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="lg" color="reactotron.400" />
        <Text mt={3} color="gray.400">Loading session events...</Text>
      </Box>
    )
  }

  if (error) {
    return (
      <VStack p={8} spacing={3}>
        <Text color="red.400">{error}</Text>
        <HStack>
          <Button size="sm" onClick={() => loadSession().catch(() => undefined)}>Retry</Button>
          <Button size="sm" variant="subtle" onClick={onBack}>Back to sessions</Button>
        </HStack>
      </VStack>
    )
  }

  const stats = meta?.stats

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
        <HStack justify="space-between" align="start" wrap="wrap" gap={3}>
          <HStack spacing={3} align="center">
            <Button size="sm" variant="subtle" onClick={onBack}>
              Back
            </Button>
            <Box>
              <HStack spacing={2} align="baseline">
                <Heading size="md" color="gray.100">
                  {meta?.app_name ?? 'Unknown App'}
                </Heading>
                {meta?.platform ? (
                  <Badge colorScheme="twilightPurple" fontSize="sm">{meta.platform}</Badge>
                ) : null}
                {meta && !meta.disconnected_at ? (
                  <Badge colorScheme="green" fontSize="sm">Active</Badge>
                ) : null}
              </HStack>
              <HStack spacing={3} mt={1}>
                {meta ? (
                  <>
                    <Text fontSize="sm" color="gray.400">
                      {formatDate(meta.connected_at)}
                    </Text>
                    <Text fontSize="sm" color="gray.400" fontFamily="mono">
                      {formatTimeRange(meta.connected_at, meta.disconnected_at)}
                    </Text>
                  </>
                ) : null}
                <Text fontSize="sm" color="gray.400">
                  {events.length} event{events.length !== 1 ? 's' : ''}
                </Text>
              </HStack>
            </Box>
          </HStack>
          <HStack spacing={2}>
            {onCompareWith ? (
              <Button size="sm" variant="outline" colorScheme="reactotron" onClick={onCompareWith}>
                Compare with...
              </Button>
            ) : null}
            <IconButton
              aria-label={meta?.is_important ? 'Remove bookmark' : 'Bookmark session'}
              icon={<StarIcon />}
              size="sm"
              variant="ghost"
              color={meta?.is_important ? 'yellow.400' : 'gray.600'}
              _hover={{ color: meta?.is_important ? 'yellow.300' : 'yellow.400' }}
              onClick={() => toggleBookmark().catch(() => undefined)}
            />
          </HStack>
        </HStack>
      </Box>

      {stats ? (
        <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }} gap={3}>
          <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
            <Stat>
              <StatLabel>Total Events</StatLabel>
              <StatNumber>{stats.total_events}</StatNumber>
            </Stat>
          </Box>
          <Box p={3} borderWidth="1px" borderColor={stats.error_count > 0 ? 'red.700' : 'gray.700'} borderRadius="lg" bg="gray.900">
            <Stat>
              <StatLabel>Errors</StatLabel>
              <StatNumber color={stats.error_count > 0 ? 'red.400' : undefined}>{stats.error_count}</StatNumber>
            </Stat>
          </Box>
          <Box p={3} borderWidth="1px" borderColor={stats.warning_count > 0 ? 'yellow.700' : 'gray.700'} borderRadius="lg" bg="gray.900">
            <Stat>
              <StatLabel>Warnings</StatLabel>
              <StatNumber color={stats.warning_count > 0 ? 'yellow.400' : undefined}>{stats.warning_count}</StatNumber>
            </Stat>
          </Box>
          <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
            <Stat>
              <StatLabel>Network Reqs</StatLabel>
              <StatNumber>{stats.network_count}</StatNumber>
            </Stat>
          </Box>
          <Box p={3} borderWidth="1px" borderColor={stats.failed_network_count > 0 ? 'orange.700' : 'gray.700'} borderRadius="lg" bg="gray.900">
            <Stat>
              <StatLabel>Failed Reqs</StatLabel>
              <StatNumber color={stats.failed_network_count > 0 ? 'orange.400' : undefined}>{stats.failed_network_count}</StatNumber>
            </Stat>
          </Box>
          {stats.slowest_request ? (
            <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" gridColumn={{ md: 'span 2' }}>
              <Text fontSize="xs" color="gray.500" mb={1}>Slowest Request</Text>
              <Text fontSize="sm" color="gray.200" fontFamily="mono">
                {stats.slowest_request.method} {stats.slowest_request.url}
              </Text>
              <Text fontSize="sm" color="orange.300">{formatMs(stats.slowest_request.durationMs)}</Text>
            </Box>
          ) : null}
          {stats.longest_benchmark ? (
            <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" gridColumn={{ md: 'span 2' }}>
              <Text fontSize="xs" color="gray.500" mb={1}>Longest Benchmark</Text>
              <Text fontSize="sm" color="gray.200">{stats.longest_benchmark.title}</Text>
              <Text fontSize="sm" color="orange.300">{formatMs(stats.longest_benchmark.totalMs)}</Text>
            </Box>
          ) : null}
          {stats.latency ? (
            <Box p={3} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" gridColumn={{ md: stats.slowest_request || stats.longest_benchmark ? 'span 1' : 'span 2' }}>
              <Text fontSize="xs" color="gray.500" mb={1}>Latency Percentiles</Text>
              <HStack spacing={3} wrap="wrap">
                <Text fontSize="xs" color="gray.300">p50: <Text as="span" color="reactotron.300">{formatMs(stats.latency.p50)}</Text></Text>
                <Text fontSize="xs" color="gray.300">p90: <Text as="span" color="reactotron.300">{formatMs(stats.latency.p90)}</Text></Text>
                <Text fontSize="xs" color="gray.300">p95: <Text as="span" color="yellow.300">{formatMs(stats.latency.p95)}</Text></Text>
                <Text fontSize="xs" color="gray.300">p99: <Text as="span" color="orange.300">{formatMs(stats.latency.p99)}</Text></Text>
              </HStack>
            </Box>
          ) : null}
        </Grid>
      ) : null}

      <FilterBar
        typeFilter={typeFilter}
        levelFilter={levelFilter}
        urlFilter={urlFilter}
        errorsOnly={errorsOnly}
        sortOrder={sortOrder}
        eventTypes={eventTypes}
        onTypeFilterChange={setTypeFilter}
        onLevelFilterChange={setLevelFilter}
        onUrlFilterChange={setUrlFilter}
        onErrorsOnlyChange={setErrorsOnly}
        onSortOrderToggle={toggleSortOrder}
        onReset={resetFilters}
      />

      {filteredEvents.length === 0 ? (
        <Box p={8} textAlign="center" borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
          <Text color="gray.400">
            {events.length === 0
              ? 'This session has no events.'
              : 'No events match the current filters.'}
          </Text>
        </Box>
      ) : (
        <Box borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" overflow="hidden">
          <Box px={4} pt={4} pb={2}>
            <Heading size="sm">
              Events ({filteredEvents.length}{filteredEvents.length !== events.length ? `/${events.length}` : ''})
            </Heading>
          </Box>
          <Box px={4} pb={4}>
            <Virtuoso
              data={filteredEvents}
              style={{ height: '60vh' }}
              itemContent={(_index, event) => (
                <Box pb={3}>
                  <EventCard event={event} />
                </Box>
              )}
            />
          </Box>
        </Box>
      )}
    </VStack>
  )
}
