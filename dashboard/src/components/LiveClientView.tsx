import { useCallback, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Code,
  Grid,
  GridItem,
  Heading,
  HStack,
  useDisclosure,
  useToast,
  VStack,
} from '@chakra-ui/react'

import type { ClientInfo, CuratedEvent } from '@shared/types'
import { extractLiveMetadata, formatEventsMarkdown } from '../utils/markdown'
import { formatJson } from '../utils/normalize'
import ClipboardFallbackModal from './ClipboardFallbackModal'
import EventCard from './EventCard'
import FilterBar from './FilterBar'
import TextModeView from './TextModeView'
import { useEventFilter } from '../hooks/useEventFilter'

type Props = {
  apiBase: string
  client: ClientInfo
  events: CuratedEvent[]
  stateText: string
  onDumpState: () => void
  onRefresh: () => void
}

export default function LiveClientView({
  apiBase,
  client,
  events,
  stateText,
  onDumpState,
  onRefresh,
}: Props) {
  const {
    typeFilter,
    levelFilter,
    urlFilter,
    errorsOnly,
    sortOrder,
    eventTypes,
    eventLevels,
    filteredEvents,
    setTypeFilter,
    setLevelFilter,
    setUrlFilter,
    setErrorsOnly,
    toggleSortOrder,
    resetFilters,
  } = useEventFilter(events)

  const [textMode, setTextMode] = useState(false)
  const [snapshotEvents, setSnapshotEvents] = useState<CuratedEvent[] | null>(null)
  const toast = useToast()
  const { isOpen: isFallbackOpen, onOpen: onFallbackOpen, onClose: onFallbackClose } = useDisclosure()
  const [fallbackContent, setFallbackContent] = useState('')

  const newEventsSinceSnapshot = textMode && snapshotEvents
    ? filteredEvents.length - snapshotEvents.length
    : 0

  const handleTextModeToggle = useCallback(() => {
    setTextMode((prev) => {
      if (!prev) setSnapshotEvents([...filteredEvents])
      else setSnapshotEvents(null)
      return !prev
    })
  }, [filteredEvents])

  const handleSnapshotRefresh = useCallback(() => {
    setSnapshotEvents([...filteredEvents])
  }, [filteredEvents])

  const handleCopyAll = useCallback(async () => {
    const metadata = extractLiveMetadata(events, filteredEvents)
    const md = formatEventsMarkdown(filteredEvents, metadata)
    try {
      await navigator.clipboard.writeText(md)
      toast({
        title: `Copied ${filteredEvents.length} events to clipboard`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      })
    } catch {
      setFallbackContent(md)
      onFallbackOpen()
    }
  }, [events, filteredEvents, toast, onFallbackOpen])

  const errorCount = useMemo(() => events.filter((e) => e.level === 'error').length, [events])
  const networkCount = useMemo(() => events.filter((e) => e.network !== undefined).length, [events])

  return (
    <>
      <HStack justify="flex-end" spacing={2} mb={2}>
        <Button size="sm" onClick={onRefresh}>Refresh Events</Button>
        <Button
          size="sm"
          colorScheme="reactotron"
          onClick={onDumpState}
          isDisabled={!client.isOpen}
        >
          Dump State
        </Button>
        <Button
          size="sm"
          colorScheme="reactotron"
          variant="outline"
          isDisabled={events.length === 0}
          onClick={() => {
            const params = new URLSearchParams()
            params.set('session', client.clientId)
            if (typeFilter.size > 0) params.set('type', Array.from(typeFilter).join(','))
            if (levelFilter.size > 0) params.set('level', Array.from(levelFilter).join(','))
            else if (errorsOnly) params.set('level', 'error')
            window.open(`${apiBase}/api/export?${params.toString()}`)
          }}
        >
          Export
        </Button>
      </HStack>

      <FilterBar
        typeFilter={typeFilter}
        levelFilter={levelFilter}
        urlFilter={urlFilter}
        errorsOnly={errorsOnly}
        sortOrder={sortOrder}
        eventTypes={eventTypes}
        eventLevels={eventLevels}
        onTypeFilterChange={setTypeFilter}
        onLevelFilterChange={setLevelFilter}
        onUrlFilterChange={setUrlFilter}
        onErrorsOnlyChange={setErrorsOnly}
        onSortOrderToggle={toggleSortOrder}
        onReset={resetFilters}
        textMode={textMode}
        onTextModeToggle={handleTextModeToggle}
        onCopyAll={handleCopyAll}
        eventCount={filteredEvents.length}
      />

      <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={4} minW={0}>
        <GridItem minW={0}>
          <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="65vh" overflowY="auto" overflowX="auto" minW={0}>
            <Heading size="sm" mb={3}>Curated Events ({filteredEvents.length}/{events.length})</Heading>
            {textMode ? (
              <TextModeView
                events={snapshotEvents ?? filteredEvents}
                newEventCount={newEventsSinceSnapshot > 0 ? newEventsSinceSnapshot : undefined}
                onRefresh={handleSnapshotRefresh}
              />
            ) : (
              <VStack align="stretch" spacing={3}>
                {filteredEvents.map((event, index) => (
                  <EventCard key={`${event.ts}-${index}`} event={event} />
                ))}
              </VStack>
            )}
          </Box>
        </GridItem>

        <GridItem minW={0}>
          <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900" maxH="65vh" overflowY="auto" overflowX="auto" minW={0}>
            <Heading size="sm" mb={3}>State Snapshot</Heading>
            <Code whiteSpace="pre-wrap" wordBreak="break-word" overflowWrap="anywhere" display="block" p={3} maxW="100%" overflowX="auto">
              {stateText}
            </Code>
          </Box>
        </GridItem>
      </Grid>
      <ClipboardFallbackModal isOpen={isFallbackOpen} onClose={onFallbackClose} content={fallbackContent} />
    </>
  )
}
