/**
 * @module hooks/useDebouncedValue
 * @description Generic debounce hook using setTimeout + cleanup.
 * No new dependencies — just React useState + useEffect.
 * Default 300ms delay.
 */
import { useState, useEffect } from 'react'

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
