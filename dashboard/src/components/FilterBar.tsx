import { useRef } from 'react'
import {
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  HStack,
  Heading,
  IconButton,
  Input,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
} from '@chakra-ui/react'
import { ChevronDownIcon, CopyIcon, TriangleDownIcon, TriangleUpIcon, ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import { LEVEL_NONE, type SortOrder } from '../hooks/useEventFilter'
import { getTypeFilterLabel } from '../utils/eventDisplay'

type FilterBarProps = {
  typeFilter: Set<string>
  levelFilter: Set<string>
  urlFilter: string
  errorsOnly: boolean
  sortOrder: SortOrder
  eventTypes: string[]
  eventLevels: string[]
  onTypeFilterChange: (value: Set<string>) => void
  onLevelFilterChange: (value: Set<string>) => void
  onUrlFilterChange: (value: string) => void
  onErrorsOnlyChange: (value: boolean) => void
  onSortOrderToggle: () => void
  onReset: () => void
  textMode?: boolean
  onTextModeToggle?: () => void
  onCopyAll?: () => void
  eventCount?: number
}

function selectionLabel(
  filter: Set<string>,
  noun: string,
  formatOption: (value: string) => string,
): string {
  if (filter.size === 0) return 'All'
  if (filter.size <= 2) return Array.from(filter).map(formatOption).join(', ')
  return `${filter.size} ${noun} selected`
}

type CheckboxFilterProps = {
  label: string
  noun: string
  options: string[]
  selected: Set<string>
  onChange: (value: Set<string>) => void
  minW: string
  emptyText: string
  triggerTestId: string
  formatOption?: (value: string) => string
}

function CheckboxFilter({
  label,
  noun,
  options,
  selected,
  onChange,
  minW,
  emptyText,
  triggerTestId,
  formatOption = (v) => v,
}: CheckboxFilterProps) {
  const { isOpen, onToggle, onClose } = useDisclosure()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function toggle(value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const allSelected = options.length > 0 && selected.size === options.length

  return (
    <Box minW={minW}>
      <Text fontSize="sm" mb={1}>{label}</Text>
      <Popover isOpen={isOpen} onClose={onClose} placement="bottom-start" isLazy>
        <PopoverTrigger>
          <Button
            ref={triggerRef}
            variant="outline"
            size="md"
            w="100%"
            justifyContent="space-between"
            rightIcon={<ChevronDownIcon />}
            fontWeight="normal"
            borderColor="gray.600"
            color={selected.size > 0 ? 'gray.100' : 'gray.300'}
            _hover={{ borderColor: 'gray.500' }}
            onClick={onToggle}
            data-testid={triggerTestId}
          >
            <Text noOfLines={1} textAlign="left">
              {selectionLabel(selected, noun, formatOption)}
            </Text>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          bg="gray.900"
          borderColor="gray.600"
          w={triggerRef.current ? `${triggerRef.current.offsetWidth}px` : minW}
        >
          <PopoverBody p={0}>
            <HStack justify="space-between" px={3} py={2} borderBottomWidth="1px" borderColor="gray.700">
              <Button
                size="xs"
                variant="ghost"
                color="reactotron.400"
                onClick={() => onChange(allSelected ? new Set() : new Set(options))}
              >
                {allSelected ? 'Clear' : 'Select All'}
              </Button>
            </HStack>
            <CheckboxGroup value={Array.from(selected)}>
              <VStack
                align="stretch"
                spacing={0}
                maxH="240px"
                overflowY="auto"
                px={3}
                py={2}
              >
                {options.map((opt) => (
                  <Checkbox
                    key={opt}
                    value={opt}
                    isChecked={selected.has(opt)}
                    onChange={() => toggle(opt)}
                    colorScheme="reactotron"
                    py={1}
                  >
                    <Text fontSize="sm">{formatOption(opt)}</Text>
                  </Checkbox>
                ))}
                {options.length === 0 ? (
                  <Text fontSize="sm" color="gray.500" py={1}>{emptyText}</Text>
                ) : null}
              </VStack>
            </CheckboxGroup>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </Box>
  )
}

export default function FilterBar({
  typeFilter,
  levelFilter,
  urlFilter,
  errorsOnly,
  sortOrder,
  eventTypes,
  eventLevels,
  onTypeFilterChange,
  onLevelFilterChange,
  onUrlFilterChange,
  onErrorsOnlyChange,
  onSortOrderToggle,
  onReset,
  textMode,
  onTextModeToggle,
  onCopyAll,
  eventCount,
}: FilterBarProps) {
  return (
    <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
      <Heading size="sm" mb={3}>Filters</Heading>
      <HStack align="end" spacing={3} wrap="wrap" minW={0}>
        <CheckboxFilter
          label="Type"
          noun="types"
          options={eventTypes}
          selected={typeFilter}
          onChange={onTypeFilterChange}
          minW="220px"
          emptyText="No event types"
          triggerTestId="type-filter-trigger"
          formatOption={getTypeFilterLabel}
        />
        <CheckboxFilter
          label="Level"
          noun="levels"
          options={eventLevels}
          selected={levelFilter}
          onChange={onLevelFilterChange}
          minW="180px"
          emptyText="No levels"
          triggerTestId="level-filter-trigger"
          formatOption={(v) => (v === LEVEL_NONE ? '(no level)' : v)}
        />
        <Box minW="260px" flex="1">
          <Text fontSize="sm" mb={1}>URL contains</Text>
          <Input value={urlFilter} onChange={(e) => onUrlFilterChange(e.target.value)} placeholder="/graphql" />
        </Box>
        <Checkbox isChecked={errorsOnly} onChange={(e) => onErrorsOnlyChange(e.target.checked)} pb={1}>
          Errors only
        </Checkbox>
        <Tooltip label={sortOrder === 'newest' ? 'Showing newest first' : 'Showing oldest first'} placement="top">
          <IconButton
            aria-label={`Sort ${sortOrder === 'newest' ? 'oldest' : 'newest'} first`}
            icon={sortOrder === 'newest' ? <TriangleDownIcon /> : <TriangleUpIcon />}
            size="sm"
            variant="subtle"
            onClick={onSortOrderToggle}
            data-testid="sort-order-toggle"
          />
        </Tooltip>
        <Button size="sm" variant="subtle" onClick={onReset}>
          Reset
        </Button>
        {onTextModeToggle ? (
          <Tooltip label={textMode ? 'Switch to card view' : 'Switch to text view'} placement="top">
            <IconButton
              aria-label={textMode ? 'Switch to card view' : 'Switch to text view'}
              aria-pressed={textMode}
              icon={textMode ? <ViewOffIcon /> : <ViewIcon />}
              size="sm"
              variant={textMode ? 'solid' : 'subtle'}
              colorScheme={textMode ? 'reactotron' : undefined}
              onClick={onTextModeToggle}
              data-testid="text-mode-toggle"
            />
          </Tooltip>
        ) : null}
        {onCopyAll ? (
          <Tooltip label={`Copy all ${eventCount ?? 0} visible events`} placement="top">
            <IconButton
              aria-label="Copy all visible events"
              icon={<CopyIcon />}
              size="sm"
              variant="subtle"
              onClick={onCopyAll}
              isDisabled={eventCount === 0}
              data-testid="copy-all-btn"
            />
          </Tooltip>
        ) : null}
      </HStack>
    </Box>
  )
}
