import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react'
import { Virtuoso } from 'react-virtuoso'

import type { CuratedEvent } from '@shared/types'
import EventCard from './EventCard'
import FilterBar from './FilterBar'

type SessionEventsResponse = {
  ok: boolean
  total: number
  events: CuratedEvent[]
}

type SessionMeta = {
  id: string
  app_name: string | null
  platform: string | null
  connected_at: string
  disconnected_at: string | null
  event_count: number
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

type Props = {
  apiBase: string
  sessionId: string
  onBack: () => void
}

export default function SessionDetail({ apiBase, sessionId, onBack }: Props) {
  const [events, setEvents] = useState<CuratedEvent[]>([])
  const [meta, setMeta] = useState<SessionMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)

  async function loadSession() {
    setLoading(true)
    setError(null)
    try {
      const [eventsRes, sessionsRes] = await Promise.all([
        fetch(`${apiBase}/api/sessions/${sessionId}/events`),
        fetch(`${apiBase}/api/sessions`),
      ])

      const eventsJson = (await eventsRes.json()) as SessionEventsResponse
      if (!eventsJson.ok) {
        setError('Session not found')
        return
      }
      setEvents(eventsJson.events)

      const sessionsJson = await sessionsRes.json()
      if (sessionsJson.ok) {
        const session = sessionsJson.sessions.find((s: SessionMeta) => s.id === sessionId)
        if (session) setMeta(session)
      }
    } catch {
      setError('Failed to load session events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSession().catch(() => undefined)
  }, [sessionId, apiBase])

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.type))).sort((a, b) => a.localeCompare(b)),
    [events],
  )

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (errorsOnly && event.level !== 'error') return false
      if (typeFilter && event.type !== typeFilter) return false
      if (levelFilter && (event.level ?? '') !== levelFilter) return false
      if (urlFilter) {
        const url = (event.network?.url ?? '').toLowerCase()
        if (!url.includes(urlFilter.toLowerCase())) return false
      }
      return true
    })
  }, [errorsOnly, events, levelFilter, typeFilter, urlFilter])

  if (loading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="lg" color="cyan.400" />
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
          <Button size="sm" variant="outline" onClick={onBack}>Back to sessions</Button>
        </HStack>
      </VStack>
    )
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
        <HStack justify="space-between" align="start" wrap="wrap" gap={3}>
          <HStack spacing={3} align="center">
            <Button size="sm" variant="outline" onClick={onBack}>
              Back
            </Button>
            <Box>
              <HStack spacing={2} align="baseline">
                <Heading size="md" color="gray.100">
                  {meta?.app_name ?? 'Unknown App'}
                </Heading>
                {meta?.platform ? (
                  <Badge colorScheme="purple" fontSize="sm">{meta.platform}</Badge>
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
        </HStack>
      </Box>

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
