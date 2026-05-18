import { useEffect, useRef } from 'react'
import { Box, CloseButton, HStack, Text } from '@chakra-ui/react'

import type { ClientInfo } from '@shared/types'
import { dotState, type DotState } from '../utils/activityDot'
import { PlatformIcon } from '../utils/platformIcon'

function dotColor(state: DotState): string {
  switch (state) {
    case 'green': return 'twilight.green'
    case 'orange': return 'twilight.warning'
    case 'grey': return 'gray.500'
    case 'disconnected': return 'gray.500'
  }
}

function ActivityDot({ client, now }: { client: ClientInfo; now: number }) {
  const state = dotState(client, now)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.setAttribute('data-pulse', 'true')
    const handler = () => el.removeAttribute('data-pulse')
    el.addEventListener('animationend', handler)
    return () => el.removeEventListener('animationend', handler)
  }, [client.lastSeen])

  return (
    <Box
      ref={ref}
      w="8px"
      h="8px"
      borderRadius="full"
      flexShrink={0}
      bg={state === 'disconnected' ? 'transparent' : dotColor(state)}
      borderWidth={state === 'disconnected' ? '2px' : 0}
      borderColor={state === 'disconnected' ? 'gray.500' : undefined}
      data-testid={`activity-dot-${client.clientId}`}
      data-state={state}
      sx={{
        '&[data-pulse="true"]': {
          animation: 'dot-pulse 400ms ease-out',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '&[data-pulse="true"]': {
            animation: 'none',
          },
        },
        '@keyframes dot-pulse': {
          '0%': { transform: 'scale(1)', opacity: 1 },
          '50%': { transform: 'scale(1.6)', opacity: 0.7 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
      }}
    />
  )
}

function clientLabel(client: ClientInfo): string {
  if (client.appName) return client.appName
  return `Unnamed (${client.clientId.slice(0, 8)})`
}

type TabProps = {
  label: string
  isSelected: boolean
  onClick: () => void
  testId: string
}

function TabButton({ label, isSelected, onClick, testId }: TabProps) {
  return (
    <Box
      as="button"
      px={4}
      py={2}
      borderWidth="1px"
      borderBottomWidth={isSelected ? 0 : '1px'}
      borderColor={isSelected ? 'gray.700' : 'transparent'}
      borderBottomColor={isSelected ? 'gray.900' : 'gray.700'}
      borderTopRadius="md"
      bg={isSelected ? 'gray.900' : 'transparent'}
      color={isSelected ? 'gray.100' : 'gray.400'}
      fontWeight={isSelected ? 600 : 400}
      fontSize="sm"
      cursor="pointer"
      _hover={{ color: 'gray.100', bg: isSelected ? 'gray.900' : 'gray.800' }}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
    </Box>
  )
}

type ClientTabProps = {
  client: ClientInfo
  isSelected: boolean
  now: number
  onSelect: () => void
  onClose: () => void
}

function ClientTab({ client, isSelected, now, onSelect, onClose }: ClientTabProps) {
  return (
    <HStack
      as="button"
      px={3}
      py={2}
      spacing={2}
      borderWidth="1px"
      borderBottomWidth={isSelected ? 0 : '1px'}
      borderColor={isSelected ? 'gray.700' : 'transparent'}
      borderBottomColor={isSelected ? 'gray.900' : 'gray.700'}
      borderTopRadius="md"
      bg={isSelected ? 'gray.900' : 'transparent'}
      color={isSelected ? 'gray.100' : 'gray.400'}
      fontWeight={isSelected ? 600 : 400}
      fontSize="sm"
      cursor="pointer"
      _hover={{ color: 'gray.100', bg: isSelected ? 'gray.900' : 'gray.800' }}
      onClick={onSelect}
      data-testid={`tab-client-${client.clientId}`}
    >
      <PlatformIcon platform={client.platform} boxSize="14px" />
      <Text fontSize="sm">{clientLabel(client)}</Text>
      <ActivityDot client={client} now={now} />
      <CloseButton
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        data-testid={`tab-close-${client.clientId}`}
      />
    </HStack>
  )
}

type TabBarProps = {
  selectedTabId: string
  clients: ClientInfo[]
  now: number
  onSelect: (id: string) => void
  onClose: (clientId: string) => void
}

export default function TabBar({ selectedTabId, clients, now, onSelect, onClose }: TabBarProps) {
  return (
    <HStack spacing={0} borderBottomWidth="1px" borderColor="gray.700" overflowX="auto">
      <TabButton
        label="Browse Sessions"
        isSelected={selectedTabId === 'browse'}
        onClick={() => onSelect('browse')}
        testId="tab-browse-sessions"
      />
      {clients.length === 0 ? (
        <TabButton
          label="Live"
          isSelected={selectedTabId === 'live'}
          onClick={() => onSelect('live')}
          testId="tab-live-placeholder"
        />
      ) : (
        clients.map((client) => (
          <ClientTab
            key={client.clientId}
            client={client}
            isSelected={selectedTabId === client.clientId}
            now={now}
            onSelect={() => onSelect(client.clientId)}
            onClose={() => onClose(client.clientId)}
          />
        ))
      )}
    </HStack>
  )
}
