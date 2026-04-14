import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons'
import { Box, Icon } from '@chakra-ui/react'
import { useState, type ReactNode } from 'react'

import { normalizePlaceholders } from '../utils/normalize'

type JsonViewProps = {
  value: unknown
  // Collections at depth < defaultExpandDepth start expanded; deeper ones start collapsed.
  defaultExpandDepth?: number
}

export default function JsonView({ value, defaultExpandDepth = 1 }: JsonViewProps) {
  return (
    <Box fontFamily="mono" fontSize="sm" lineHeight="1.55" color="gray.200" overflowX="auto">
      <Node value={normalizePlaceholders(value)} depth={0} defaultExpandDepth={defaultExpandDepth} isLast />
    </Box>
  )
}

type NodeProps = {
  value: unknown
  name?: string | number
  depth: number
  defaultExpandDepth: number
  isLast: boolean
}

function Node({ value, name, depth, defaultExpandDepth, isLast }: NodeProps) {
  if (value !== null && typeof value === 'object') {
    return (
      <Collection
        value={value as Record<string, unknown> | unknown[]}
        name={name}
        depth={depth}
        defaultExpandDepth={defaultExpandDepth}
        isLast={isLast}
      />
    )
  }
  return (
    <Line depth={depth}>
      <Gutter />
      <KeyPart name={name} />
      <Primitive value={value} />
      {isLast ? null : <Punct>,</Punct>}
    </Line>
  )
}

type CollectionProps = {
  value: Record<string, unknown> | unknown[]
  name?: string | number
  depth: number
  defaultExpandDepth: number
  isLast: boolean
}

function Collection({ value, name, depth, defaultExpandDepth, isLast }: CollectionProps) {
  const isArray = Array.isArray(value)
  const entries: ReadonlyArray<[string | number, unknown]> = isArray
    ? (value as unknown[]).map((v, i) => [i, v])
    : Object.entries(value)
  const [open, setOpen] = useState(depth < defaultExpandDepth)
  const openBr = isArray ? '[' : '{'
  const closeBr = isArray ? ']' : '}'

  if (entries.length === 0) {
    return (
      <Line depth={depth}>
        <Gutter />
        <KeyPart name={name} />
        <Punct>{openBr}{closeBr}</Punct>
        {isLast ? null : <Punct>,</Punct>}
      </Line>
    )
  }

  return (
    <>
      <Line depth={depth}>
        <Gutter open={open} onToggle={() => setOpen((o) => !o)} />
        <KeyPart name={name} />
        <Punct>{openBr}</Punct>
        {open ? null : (
          <>
            <Box as="span" color="gray.500" mx={1}>… {entries.length}</Box>
            <Punct>{closeBr}</Punct>
            {isLast ? null : <Punct>,</Punct>}
          </>
        )}
      </Line>
      {open ? (
        <>
          {entries.map(([key, val], i) => (
            <Node
              key={String(key)}
              value={val}
              name={key}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
              isLast={i === entries.length - 1}
            />
          ))}
          <Line depth={depth}>
            <Gutter />
            <Punct>{closeBr}</Punct>
            {isLast ? null : <Punct>,</Punct>}
          </Line>
        </>
      ) : null}
    </>
  )
}

function Line({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <Box pl={depth * 4} whiteSpace="pre-wrap" wordBreak="break-word">
      {children}
    </Box>
  )
}

type GutterProps = { open?: boolean; onToggle?: () => void }

function Gutter({ open, onToggle }: GutterProps = {}) {
  const shared = { display: 'inline-block', width: '1rem', verticalAlign: 'middle' } as const
  if (onToggle === undefined) return <Box as="span" sx={shared} />
  return (
    <Box
      as="button"
      type="button"
      onClick={onToggle}
      sx={shared}
      color="gray.400"
      _hover={{ color: 'gray.100' }}
      aria-label={open ? 'Collapse' : 'Expand'}
    >
      <Icon as={open ? ChevronDownIcon : ChevronRightIcon} boxSize={3} verticalAlign="middle" />
    </Box>
  )
}

function KeyPart({ name }: { name?: string | number }) {
  if (name === undefined) return null
  if (typeof name === 'number') {
    return (
      <Box as="span" color="gray.500" mr={1}>
        {name}<Box as="span" color="gray.500">:</Box>
      </Box>
    )
  }
  return (
    <Box as="span" mr={1}>
      <Box as="span" color="twilight.steel">&quot;{name}&quot;</Box>
      <Box as="span" color="gray.500">:</Box>
    </Box>
  )
}

function Punct({ children }: { children: ReactNode }) {
  return <Box as="span" color="gray.500">{children}</Box>
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <Box as="span" color="gray.400" fontStyle="italic">null</Box>
  if (value === undefined) return <Box as="span" color="gray.400" fontStyle="italic">undefined</Box>
  if (typeof value === 'string') return <Box as="span" color="twilight.green">&quot;{value}&quot;</Box>
  if (typeof value === 'number') return <Box as="span" color="twilight.amber">{value}</Box>
  if (typeof value === 'boolean') return <Box as="span" color="twilight.yellow" fontStyle="italic">{String(value)}</Box>
  return <Box as="span">{String(value)}</Box>
}
