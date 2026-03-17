import { useMemo, useState } from 'react'
import type { CuratedEvent } from '@shared/types'

export type EventFilterState = {
  typeFilter: Set<string>
  levelFilter: string
  urlFilter: string
  errorsOnly: boolean
  eventTypes: string[]
  filteredEvents: CuratedEvent[]
  setTypeFilter: (value: Set<string>) => void
  setLevelFilter: (value: string) => void
  setUrlFilter: (value: string) => void
  setErrorsOnly: (value: boolean) => void
  resetFilters: () => void
}

export function useEventFilter(events: CuratedEvent[]): EventFilterState {
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.type))).sort((a, b) => a.localeCompare(b)),
    [events],
  )

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (errorsOnly && event.level !== 'error') return false
      if (typeFilter.size > 0 && !typeFilter.has(event.type)) return false
      if (levelFilter && (event.level ?? '') !== levelFilter) return false
      if (urlFilter) {
        const url = (event.network?.url ?? '').toLowerCase()
        if (!url.includes(urlFilter.toLowerCase())) return false
      }
      return true
    })
  }, [errorsOnly, events, levelFilter, typeFilter, urlFilter])

  function resetFilters() {
    setTypeFilter(new Set())
    setLevelFilter('')
    setUrlFilter('')
    setErrorsOnly(false)
  }

  return {
    typeFilter,
    levelFilter,
    urlFilter,
    errorsOnly,
    eventTypes,
    filteredEvents,
    setTypeFilter,
    setLevelFilter,
    setUrlFilter,
    setErrorsOnly,
    resetFilters,
  }
}
