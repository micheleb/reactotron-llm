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
  Select,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
} from '@chakra-ui/react'
import { ChevronDownIcon, TriangleDownIcon, TriangleUpIcon } from '@chakra-ui/icons'
import type { SortOrder } from '../hooks/useEventFilter'

type FilterBarProps = {
  typeFilter: Set<string>
  levelFilter: string
  urlFilter: string
  errorsOnly: boolean
  sortOrder: SortOrder
  eventTypes: string[]
  onTypeFilterChange: (value: Set<string>) => void
  onLevelFilterChange: (value: string) => void
  onUrlFilterChange: (value: string) => void
  onErrorsOnlyChange: (value: boolean) => void
  onSortOrderToggle: () => void
  onReset: () => void
}

function typeFilterLabel(typeFilter: Set<string>): string {
  if (typeFilter.size === 0) return 'All'
  if (typeFilter.size <= 2) return Array.from(typeFilter).join(', ')
  return `${typeFilter.size} types selected`
}

export default function FilterBar({
  typeFilter,
  levelFilter,
  urlFilter,
  errorsOnly,
  sortOrder,
  eventTypes,
  onTypeFilterChange,
  onLevelFilterChange,
  onUrlFilterChange,
  onErrorsOnlyChange,
  onSortOrderToggle,
  onReset,
}: FilterBarProps) {
  const { isOpen, onToggle, onClose } = useDisclosure()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function toggleType(type: string) {
    const next = new Set(typeFilter)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    onTypeFilterChange(next)
  }

  function selectAll() {
    onTypeFilterChange(new Set(eventTypes))
  }

  function clearAll() {
    onTypeFilterChange(new Set())
  }

  const allSelected = eventTypes.length > 0 && typeFilter.size === eventTypes.length

  return (
    <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
      <Heading size="sm" mb={3}>Filters</Heading>
      <HStack align="end" spacing={3} wrap="wrap" minW={0}>
        <Box minW="220px">
          <Text fontSize="sm" mb={1}>Type</Text>
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
                color={typeFilter.size > 0 ? 'gray.100' : 'gray.300'}
                _hover={{ borderColor: 'gray.500' }}
                onClick={onToggle}
                data-testid="type-filter-trigger"
              >
                <Text noOfLines={1} textAlign="left">
                  {typeFilterLabel(typeFilter)}
                </Text>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              bg="gray.900"
              borderColor="gray.600"
              w={triggerRef.current ? `${triggerRef.current.offsetWidth}px` : '220px'}
            >
              <PopoverBody p={0}>
                <HStack justify="space-between" px={3} py={2} borderBottomWidth="1px" borderColor="gray.700">
                  <Button
                    size="xs"
                    variant="ghost"
                    color="reactotron.400"
                    onClick={allSelected ? clearAll : selectAll}
                  >
                    {allSelected ? 'Clear' : 'Select All'}
                  </Button>
                </HStack>
                <CheckboxGroup value={Array.from(typeFilter)}>
                  <VStack
                    align="stretch"
                    spacing={0}
                    maxH="240px"
                    overflowY="auto"
                    px={3}
                    py={2}
                  >
                    {eventTypes.map((type) => (
                      <Checkbox
                        key={type}
                        value={type}
                        isChecked={typeFilter.has(type)}
                        onChange={() => toggleType(type)}
                        colorScheme="reactotron"
                        py={1}
                      >
                        <Text fontSize="sm">{type}</Text>
                      </Checkbox>
                    ))}
                    {eventTypes.length === 0 ? (
                      <Text fontSize="sm" color="gray.500" py={1}>No event types</Text>
                    ) : null}
                  </VStack>
                </CheckboxGroup>
              </PopoverBody>
            </PopoverContent>
          </Popover>
        </Box>
        <Box minW="180px">
          <Text fontSize="sm" mb={1}>Level</Text>
          <Select value={levelFilter} onChange={(e) => onLevelFilterChange(e.target.value)}>
            <option value="">All</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </Select>
        </Box>
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
      </HStack>
    </Box>
  )
}
