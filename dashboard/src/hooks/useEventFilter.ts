import { useMemo, useState } from 'react'
import type { CuratedEvent } from '@shared/types'

export type SortOrder = 'newest' | 'oldest'

export type EventFilterState = {
  typeFilter: Set<string>
  levelFilter: string
  urlFilter: string
  errorsOnly: boolean
  sortOrder: SortOrder
  eventTypes: string[]
  filteredEvents: CuratedEvent[]
  setTypeFilter: (value: Set<string>) => void
  setLevelFilter: (value: string) => void
  setUrlFilter: (value: string) => void
  setErrorsOnly: (value: boolean) => void
  setSortOrder: (value: SortOrder) => void
  toggleSortOrder: () => void
  resetFilters: () => void
}

export function useEventFilter(events: CuratedEvent[]): EventFilterState {
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.type))).sort((a, b) => a.localeCompare(b)),
    [events],
  )

  const filteredEvents = useMemo(() => {
    const filtered = events.filter((event) => {
      if (errorsOnly && event.level !== 'error') return false
      if (typeFilter.size > 0 && !typeFilter.has(event.type)) return false
      if (levelFilter && (event.level ?? '') !== levelFilter) return false
      if (urlFilter) {
        const url = (event.network?.url ?? '').toLowerCase()
        if (!url.includes(urlFilter.toLowerCase())) return false
      }
      return true
    })
    // Sort newest-first by timestamp, then reverse for oldest-first.
    // Using reverse() instead of flipping the comparator ensures events with
    // equal timestamps (common in rapid bursts) still visibly reorder on toggle.
    const sorted = [...filtered].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    return sortOrder === 'oldest' ? sorted.reverse() : sorted
  }, [errorsOnly, events, levelFilter, sortOrder, typeFilter, urlFilter])

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))
  }

  function resetFilters() {
    setTypeFilter(new Set())
    setLevelFilter('')
    setUrlFilter('')
    setErrorsOnly(false)
    setSortOrder('newest')
  }

  return {
    typeFilter,
    levelFilter,
    urlFilter,
    errorsOnly,
    sortOrder,
    eventTypes,
    filteredEvents,
    setTypeFilter,
    setLevelFilter,
    setUrlFilter,
    setErrorsOnly,
    setSortOrder,
    toggleSortOrder,
    resetFilters,
  }
}
