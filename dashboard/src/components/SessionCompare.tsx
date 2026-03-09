import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  VStack,
} from '@chakra-ui/react'
import type { CuratedEvent } from '@shared/types'
import type { SessionStats } from '@shared/types'
import EventCard from './EventCard'

type SessionInfo = {
  id: string
  app_name: string | null
  platform: string | null
  connected_at: string
  disconnected_at: string | null
  event_count: number
  is_important: boolean
  stats: SessionStats
}

type ByTypeEntry = {
  a_count: number
  b_count: number
  a_events: CuratedEvent[]
  b_events: CuratedEvent[]
}

type CompareResponse = {
  ok: boolean
  error?: string
  sessions: {
    a: SessionInfo
    b: SessionInfo
  }
  by_type: Record<string, ByTypeEntry>
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function DeltaBadge({ a, b, label, higherIsWorse = true }: { a: number; b: number; label: string; higherIsWorse?: boolean }) {
  const diff = b - a
  if (diff === 0) return <Text fontSize="xs" color="gray.500">{label}: same</Text>
  const isWorse = higherIsWorse ? diff > 0 : diff < 0
  const color = isWorse ? 'red.300' : 'green.300'
  const sign = diff > 0 ? '+' : ''
  return (
    <Text fontSize="xs" color={color}>
      {label}: {sign}{diff}
    </Text>
  )
}

type Props = {
  apiBase: string
  sessionA: string
  sessionB: string
  onBack: () => void
}

export default function SessionCompare({ apiBase, sessionA, sessionB, onBack }: Props) {
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

  async function loadComparison() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/api/sessions/compare?a=${sessionA}&b=${sessionB}`)
      const json = (await res.json()) as CompareResponse
      if (!json.ok) {
        setError(json.error ?? 'Failed to load comparison')
        return
      }
      setData(json)
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComparison().catch(() => undefined)
  }, [sessionA, sessionB, apiBase])

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  if (loading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="lg" color="cyan.400" />
        <Text mt={3} color="gray.400">Loading comparison...</Text>
      </Box>
    )
  }

  if (error || !data) {
    return (
      <VStack p={8} spacing={3}>
        <Text color="red.400">{error ?? 'Unknown error'}</Text>
        <HStack>
          <Button size="sm" onClick={() => loadComparison().catch(() => undefined)}>Retry</Button>
          <Button size="sm" variant="outline" color="gray.300" _hover={{ color: 'white', bg: 'gray.700' }} onClick={onBack}>Back</Button>
        </HStack>
      </VStack>
    )
  }

  const { sessions, by_type } = data
  const a = sessions.a
  const b = sessions.b
  const sortedTypes = Object.keys(by_type).sort((x, y) => {
    const totalX = by_type[x].a_count + by_type[x].b_count
    const totalY = by_type[y].a_count + by_type[y].b_count
    return totalY - totalX
  })

  return (
    <VStack align="stretch" spacing={4}>
      <HStack>
        <Button size="sm" variant="outline" color="gray.300" _hover={{ color: 'white', bg: 'gray.700' }} onClick={onBack}>Back</Button>
        <Heading size="md" color="gray.100">Session Comparison</Heading>
      </HStack>

      {/* Session headers side by side */}
      <Grid templateColumns="1fr 1fr" gap={4}>
        {[a, b].map((session, idx) => (
          <Box key={session.id} p={4} borderWidth="1px" borderColor={idx === 0 ? 'cyan.700' : 'purple.700'} borderRadius="lg" bg="gray.900">
            <HStack spacing={2} mb={2}>
              <Badge colorScheme={idx === 0 ? 'cyan' : 'purple'} fontSize="xs">Session {idx === 0 ? 'A' : 'B'}</Badge>
              <Text fontWeight="600" color="gray.100">{session.app_name ?? 'Unknown'}</Text>
              {session.platform ? <Badge colorScheme="gray" fontSize="xs">{session.platform}</Badge> : null}
            </HStack>
            <Text fontSize="sm" color="gray.400" fontFamily="mono">
              {formatTime(session.connected_at)} - {session.disconnected_at ? formatTime(session.disconnected_at) : 'now'}
            </Text>
            <Text fontSize="sm" color="gray.400">{session.event_count} events</Text>
          </Box>
        ))}
      </Grid>

      {/* Stats comparison */}
      <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
        <Heading size="sm" mb={3}>Stats Comparison</Heading>
        <Grid templateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap={3}>
          <Box>
            <Text fontSize="xs" color="gray.500">Total Events</Text>
            <HStack spacing={2}>
              <Text fontSize="sm" color="cyan.300">{a.stats.total_events}</Text>
              <Text fontSize="sm" color="gray.500">vs</Text>
              <Text fontSize="sm" color="purple.300">{b.stats.total_events}</Text>
            </HStack>
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.500">Errors</Text>
            <HStack spacing={2}>
              <Text fontSize="sm" color="cyan.300">{a.stats.error_count}</Text>
              <Text fontSize="sm" color="gray.500">vs</Text>
              <Text fontSize="sm" color="purple.300">{b.stats.error_count}</Text>
            </HStack>
            <DeltaBadge a={a.stats.error_count} b={b.stats.error_count} label="B" />
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.500">Warnings</Text>
            <HStack spacing={2}>
              <Text fontSize="sm" color="cyan.300">{a.stats.warning_count}</Text>
              <Text fontSize="sm" color="gray.500">vs</Text>
              <Text fontSize="sm" color="purple.300">{b.stats.warning_count}</Text>
            </HStack>
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.500">Failed Network</Text>
            <HStack spacing={2}>
              <Text fontSize="sm" color="cyan.300">{a.stats.failed_network_count}</Text>
              <Text fontSize="sm" color="gray.500">vs</Text>
              <Text fontSize="sm" color="purple.300">{b.stats.failed_network_count}</Text>
            </HStack>
            <DeltaBadge a={a.stats.failed_network_count} b={b.stats.failed_network_count} label="B" />
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.500">Network Reqs</Text>
            <HStack spacing={2}>
              <Text fontSize="sm" color="cyan.300">{a.stats.network_count}</Text>
              <Text fontSize="sm" color="gray.500">vs</Text>
              <Text fontSize="sm" color="purple.300">{b.stats.network_count}</Text>
            </HStack>
          </Box>
          {(a.stats.latency || b.stats.latency) ? (
            <Box>
              <Text fontSize="xs" color="gray.500">p50 Latency</Text>
              <HStack spacing={2}>
                <Text fontSize="sm" color="cyan.300">{a.stats.latency ? formatMs(a.stats.latency.p50) : '—'}</Text>
                <Text fontSize="sm" color="gray.500">vs</Text>
                <Text fontSize="sm" color="purple.300">{b.stats.latency ? formatMs(b.stats.latency.p50) : '—'}</Text>
              </HStack>
            </Box>
          ) : null}
        </Grid>
      </Box>

      {/* Event type groups */}
      <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
        <Heading size="sm" mb={3}>Events by Type</Heading>
        <VStack align="stretch" spacing={2}>
          {sortedTypes.map((type) => {
            const entry = by_type[type]
            const isExpanded = expandedTypes.has(type)
            return (
              <Box key={type}>
                <HStack
                  px={3}
                  py={2}
                  cursor="pointer"
                  borderRadius="md"
                  _hover={{ bg: 'gray.800' }}
                  onClick={() => toggleType(type)}
                >
                  <Text fontSize="sm" color="gray.400">{isExpanded ? '\u25BC' : '\u25B6'}</Text>
                  <Text fontSize="sm" fontWeight="500" color="gray.200" fontFamily="mono">{type}</Text>
                  <Box flex={1} />
                  <Badge colorScheme="cyan" variant="subtle" fontSize="xs">{entry.a_count}</Badge>
                  <Text fontSize="xs" color="gray.500">vs</Text>
                  <Badge colorScheme="purple" variant="subtle" fontSize="xs">{entry.b_count}</Badge>
                  {entry.a_count !== entry.b_count ? (
                    <Text fontSize="xs" color={entry.b_count > entry.a_count ? 'orange.300' : 'green.300'}>
                      {entry.b_count > entry.a_count ? '+' : ''}{entry.b_count - entry.a_count}
                    </Text>
                  ) : null}
                </HStack>
                {isExpanded ? (
                  <Grid templateColumns="1fr 1fr" gap={2} px={3} py={2}>
                    <Box minW={0} overflow="hidden">
                      <Text fontSize="xs" color="cyan.400" mb={2}>Session A ({entry.a_count})</Text>
                      {entry.a_events.length === 0 ? (
                        <Text fontSize="xs" color="gray.500">No events</Text>
                      ) : (
                        <VStack align="stretch" spacing={2} maxH="300px" overflowY="auto">
                          {entry.a_events.map((event, idx) => (
                            <EventCard key={`a-${type}-${idx}`} event={event} />
                          ))}
                        </VStack>
                      )}
                    </Box>
                    <Box minW={0} overflow="hidden">
                      <Text fontSize="xs" color="purple.400" mb={2}>Session B ({entry.b_count})</Text>
                      {entry.b_events.length === 0 ? (
                        <Text fontSize="xs" color="gray.500">No events</Text>
                      ) : (
                        <VStack align="stretch" spacing={2} maxH="300px" overflowY="auto">
                          {entry.b_events.map((event, idx) => (
                            <EventCard key={`b-${type}-${idx}`} event={event} />
                          ))}
                        </VStack>
                      )}
                    </Box>
                  </Grid>
                ) : null}
              </Box>
            )
          })}
        </VStack>
      </Box>
    </VStack>
  )
}
