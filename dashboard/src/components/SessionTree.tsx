import { useEffect, useState } from 'react'
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

type Session = {
  id: string
  connected_at: string
  disconnected_at: string | null
  app_name: string | null
  platform: string | null
  event_count: number
}

type DateGroup = {
  label: string
  sortKey: string
  apps: AppGroup[]
}

type AppGroup = {
  label: string
  sessions: Session[]
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

function toLocalDateKey(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTimeRange(session: Session): string {
  const start = new Date(session.connected_at)
  const fmt = (d: Date) => {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  if (!session.disconnected_at) return `${fmt(start)} - now`
  const end = new Date(session.disconnected_at)
  return `${fmt(start)} - ${fmt(end)}`
}

function groupSessions(sessions: Session[]): DateGroup[] {
  const dateMap = new Map<string, Map<string, Session[]>>()

  for (const session of sessions) {
    const dateKey = toLocalDateKey(session.connected_at)
    if (!dateMap.has(dateKey)) dateMap.set(dateKey, new Map())

    const appKey = `${session.app_name ?? 'Unknown App'}|${session.platform ?? ''}`
    const appMap = dateMap.get(dateKey)!
    if (!appMap.has(appKey)) appMap.set(appKey, [])
    appMap.get(appKey)!.push(session)
  }

  const groups: DateGroup[] = []
  for (const [dateKey, appMap] of dateMap) {
    const apps: AppGroup[] = []
    for (const [appKey, sessions] of appMap) {
      const [name, platform] = appKey.split('|')
      const label = platform ? `${name} (${platform})` : name
      apps.push({ label, sessions })
    }
    apps.sort((a, b) => a.label.localeCompare(b.label))

    groups.push({
      label: formatDateLabel(dateKey),
      sortKey: dateKey,
      apps,
    })
  }

  groups.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  return groups
}

type Props = {
  apiBase: string
  onSelectSession: (sessionId: string) => void
}

export default function SessionTree({ apiBase, onSelectSession }: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set())

  async function loadSessions() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/api/sessions`)
      const json = await res.json()
      if (!json.ok) {
        setError('Failed to load sessions')
        return
      }
      setSessions(json.sessions)

      // Expand today's group by default
      const todayKey = toLocalDateKey(new Date().toISOString())
      setExpandedDates(new Set([todayKey]))
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions().catch(() => undefined)
  }, [apiBase])

  const groups = groupSessions(sessions)

  const toggleDate = (sortKey: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      if (next.has(sortKey)) next.delete(sortKey)
      else next.add(sortKey)
      return next
    })
  }

  const toggleApp = (key: string) => {
    setExpandedApps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="lg" color="cyan.400" />
        <Text mt={3} color="gray.400">Loading sessions...</Text>
      </Box>
    )
  }

  if (error) {
    return (
      <Box p={8} textAlign="center">
        <Text color="red.400" mb={3}>{error}</Text>
        <Button size="sm" onClick={() => loadSessions().catch(() => undefined)}>Retry</Button>
      </Box>
    )
  }

  if (sessions.length === 0) {
    return (
      <Box p={8} textAlign="center">
        <Text color="gray.400">No sessions recorded yet.</Text>
        <Text color="gray.500" fontSize="sm" mt={1}>Connect an app client to start recording sessions.</Text>
      </Box>
    )
  }

  return (
    <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="70vh" overflowY="auto">
      <HStack justify="space-between" mb={4}>
        <Heading size="sm">Sessions ({sessions.length})</Heading>
        <Button size="xs" variant="outline" onClick={() => loadSessions().catch(() => undefined)}>
          Refresh
        </Button>
      </HStack>
      <VStack align="stretch" spacing={2}>
        {groups.map((dateGroup) => {
          const dateExpanded = expandedDates.has(dateGroup.sortKey)
          const totalSessions = dateGroup.apps.reduce((sum, app) => sum + app.sessions.length, 0)
          return (
            <Box key={dateGroup.sortKey}>
              <HStack
                px={3}
                py={2}
                cursor="pointer"
                borderRadius="md"
                _hover={{ bg: 'gray.800' }}
                onClick={() => toggleDate(dateGroup.sortKey)}
              >
                <Text fontSize="sm" color="gray.400">{dateExpanded ? '\u25BC' : '\u25B6'}</Text>
                <Text fontWeight="600" color="gray.200">{dateGroup.label}</Text>
                <Text fontSize="sm" color="gray.500">({totalSessions} session{totalSessions !== 1 ? 's' : ''})</Text>
              </HStack>
              {dateExpanded ? (
                <VStack align="stretch" spacing={1} pl={4}>
                  {dateGroup.apps.map((appGroup) => {
                    const appKey = `${dateGroup.sortKey}|${appGroup.label}`
                    const appExpanded = expandedApps.has(appKey)
                    return (
                      <Box key={appKey}>
                        <HStack
                          px={3}
                          py={1}
                          cursor="pointer"
                          borderRadius="md"
                          _hover={{ bg: 'gray.800' }}
                          onClick={() => toggleApp(appKey)}
                        >
                          <Text fontSize="sm" color="gray.400">{appExpanded ? '\u25BC' : '\u25B6'}</Text>
                          <Text fontSize="sm" fontWeight="500" color="gray.300">{appGroup.label}</Text>
                          {appGroup.sessions.length > 1 ? (
                            <Text fontSize="xs" color="gray.500">({appGroup.sessions.length})</Text>
                          ) : null}
                        </HStack>
                        {appExpanded ? (
                          <VStack align="stretch" spacing={1} pl={6}>
                            {appGroup.sessions.map((session) => (
                              <HStack
                                key={session.id}
                                px={3}
                                py={2}
                                cursor="pointer"
                                borderRadius="md"
                                borderWidth="1px"
                                borderColor="gray.700"
                                bg="gray.950"
                                _hover={{ bg: 'gray.800', borderColor: 'cyan.600' }}
                                onClick={() => onSelectSession(session.id)}
                              >
                                <Box
                                  w={2}
                                  h={2}
                                  borderRadius="full"
                                  bg={session.disconnected_at ? 'gray.500' : 'green.400'}
                                  flexShrink={0}
                                />
                                <Text fontSize="sm" fontFamily="mono" color="gray.200">
                                  {formatTimeRange(session)}
                                </Text>
                                <Badge fontSize="xs" colorScheme="gray" variant="subtle">
                                  {session.event_count} event{session.event_count !== 1 ? 's' : ''}
                                </Badge>
                                {!session.disconnected_at ? (
                                  <Badge fontSize="xs" colorScheme="green" variant="subtle">Active</Badge>
                                ) : null}
                              </HStack>
                            ))}
                          </VStack>
                        ) : null}
                      </Box>
                    )
                  })}
                </VStack>
              ) : null}
            </Box>
          )
        })}
      </VStack>
    </Box>
  )
}
