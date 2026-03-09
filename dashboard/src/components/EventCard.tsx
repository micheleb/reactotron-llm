import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Code,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react'

import type { CuratedEvent } from '@shared/types'

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

function formatTime(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts

  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

export default function EventCard({ event }: { event: CuratedEvent }) {
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
}
