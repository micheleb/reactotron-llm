import { Box, Button, Code, HStack, Text } from '@chakra-ui/react'
import { useMemo } from 'react'

import type { CuratedEvent } from '@shared/types'
import { formatEventMarkdown } from '../utils/markdown'

type TextModeViewProps = {
  events: CuratedEvent[]
  newEventCount?: number
  onRefresh?: () => void
}

export default function TextModeView({ events, newEventCount, onRefresh }: TextModeViewProps) {
  const markdown = useMemo(
    () => events.map((e) => formatEventMarkdown(e, 'full')).join('\n\n---\n\n'),
    [events],
  )

  return (
    <Box>
      {newEventCount != null && newEventCount > 0 ? (
        <HStack mb={2} p={2} bg="reactotron.900" borderRadius="md" justify="space-between">
          <Text fontSize="sm" color="reactotron.200">
            {newEventCount} new event{newEventCount !== 1 ? 's' : ''} since snapshot
          </Text>
          <Button size="xs" colorScheme="reactotron" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        </HStack>
      ) : null}
      <Code
        display="block"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        overflowWrap="anywhere"
        p={4}
        maxH="65vh"
        overflowY="auto"
        bg="gray.950"
        fontSize="sm"
        data-testid="text-mode-view"
      >
        {markdown || '(no events)'}
      </Code>
    </Box>
  )
}
