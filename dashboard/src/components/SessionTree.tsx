import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Heading,
  HStack,
  IconButton,
  Spinner,
  Switch,
  Text,
  VStack,
} from '@chakra-ui/react'
import { StarIcon } from '@chakra-ui/icons'

import type { SessionStats } from '@shared/types'

type Session = {
  id: string
  connected_at: string
  disconnected_at: string | null
  app_name: string | null
  platform: string | null
  event_count: number
  is_important: boolean
  stats: SessionStats | null
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
  compareMode?: boolean
  selectedForCompare?: Set<string>
  onToggleCompareSelect?: (sessionId: string) => void
}

export default function SessionTree({
  apiBase,
  onSelectSession,
  compareMode = false,
  selectedForCompare,
  onToggleCompareSelect,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set())
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)

  async function loadSessions() {
    setLoading(true)
    setError(null)
    try {
      const url = bookmarkedOnly
        ? `${apiBase}/api/sessions?is_important=true`
        : `${apiBase}/api/sessions`
      const res = await fetch(url)
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
  }, [apiBase, bookmarkedOnly])

  const groups = useMemo(() => groupSessions(sessions), [sessions])

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

  async function toggleBookmark(sessionId: string, currentValue: boolean) {
    // Optimistic update
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, is_important: !currentValue } : s)),
    )
    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_important: !currentValue }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Rollback
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, is_important: currentValue } : s)),
      )
    }
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

  if (sessions.length === 0 && !bookmarkedOnly) {
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
        <HStack spacing={3}>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400">Bookmarked only</Text>
            <Switch
              size="sm"
              colorScheme="yellow"
              isChecked={bookmarkedOnly}
              onChange={() => setBookmarkedOnly(!bookmarkedOnly)}
            />
          </HStack>
          <Button size="xs" variant="outline" color="gray.300" onClick={() => loadSessions().catch(() => undefined)}>
            Refresh
          </Button>
        </HStack>
      </HStack>

      {sessions.length === 0 && bookmarkedOnly ? (
        <Box p={4} textAlign="center">
          <Text color="gray.400" fontSize="sm">No bookmarked sessions.</Text>
        </Box>
      ) : (
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
                              {appGroup.sessions.map((session) => {
                                const isSelected = selectedForCompare?.has(session.id)
                                return (
                                  <HStack
                                    key={session.id}
                                    px={3}
                                    py={2}
                                    cursor="pointer"
                                    borderRadius="md"
                                    borderWidth="1px"
                                    borderColor={isSelected ? 'cyan.500' : 'gray.700'}
                                    bg={isSelected ? 'gray.800' : 'gray.950'}
                                    _hover={{ bg: 'gray.800', borderColor: 'cyan.600' }}
                                    onClick={() => {
                                      if (compareMode && onToggleCompareSelect) {
                                        onToggleCompareSelect(session.id)
                                      } else {
                                        onSelectSession(session.id)
                                      }
                                    }}
                                  >
                                    {compareMode ? (
                                      <Checkbox
                                        isChecked={isSelected}
                                        colorScheme="cyan"
                                        size="sm"
                                        onChange={() => onToggleCompareSelect?.(session.id)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    ) : null}
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
                                    {session.stats && session.stats.error_count > 0 ? (
                                      <Badge fontSize="xs" colorScheme="red" variant="subtle">
                                        {session.stats.error_count} error{session.stats.error_count !== 1 ? 's' : ''}
                                      </Badge>
                                    ) : null}
                                    {session.stats && session.stats.failed_network_count > 0 ? (
                                      <Badge fontSize="xs" colorScheme="orange" variant="subtle">
                                        {session.stats.failed_network_count} failed req{session.stats.failed_network_count !== 1 ? 's' : ''}
                                      </Badge>
                                    ) : null}
                                    {!session.disconnected_at ? (
                                      <Badge fontSize="xs" colorScheme="green" variant="subtle">Active</Badge>
                                    ) : null}
                                    <Box flex={1} />
                                    <IconButton
                                      aria-label={session.is_important ? 'Remove bookmark' : 'Bookmark session'}
                                      icon={<StarIcon />}
                                      size="xs"
                                      variant="ghost"
                                      color={session.is_important ? 'yellow.400' : 'gray.600'}
                                      _hover={{ color: session.is_important ? 'yellow.300' : 'yellow.400' }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleBookmark(session.id, session.is_important).catch(() => undefined)
                                      }}
                                    />
                                  </HStack>
                                )
                              })}
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
      )}
    </Box>
  )
}
