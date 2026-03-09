import {
  Box,
  Button,
  Checkbox,
  HStack,
  Heading,
  Input,
  Select,
  Text,
} from '@chakra-ui/react'

type FilterBarProps = {
  typeFilter: string
  levelFilter: string
  urlFilter: string
  errorsOnly: boolean
  eventTypes: string[]
  onTypeFilterChange: (value: string) => void
  onLevelFilterChange: (value: string) => void
  onUrlFilterChange: (value: string) => void
  onErrorsOnlyChange: (value: boolean) => void
  onReset: () => void
}

export default function FilterBar({
  typeFilter,
  levelFilter,
  urlFilter,
  errorsOnly,
  eventTypes,
  onTypeFilterChange,
  onLevelFilterChange,
  onUrlFilterChange,
  onErrorsOnlyChange,
  onReset,
}: FilterBarProps) {
  return (
    <Box p={4} borderWidth="1px" borderColor="gray.700" borderRadius="lg" bg="gray.900">
      <Heading size="sm" mb={3}>Filters</Heading>
      <HStack align="end" spacing={3} wrap="wrap" minW={0}>
        <Box minW="220px">
          <Text fontSize="sm" mb={1}>Type</Text>
          <Select value={typeFilter} onChange={(e) => onTypeFilterChange(e.target.value)}>
            <option value="">All</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
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
        <Button size="sm" variant="outline" color="gray.300" _hover={{ color: 'white', bg: 'gray.700' }} onClick={onReset}>
          Reset
        </Button>
      </HStack>
    </Box>
  )
}
