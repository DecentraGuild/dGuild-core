import { ref, type Ref } from 'vue'

export type SubmitExclusiveResult<T> = { ok: true; value: T } | { ok: false }

/**
 * Blocks overlapping async submit work (double-click / parallel sends).
 * Flips in-flight synchronously before awaiting the callback.
 */
export function useSubmitInFlightLock(): {
  isInFlight: Ref<boolean>
  runExclusive: <T>(fn: () => Promise<T>) => Promise<SubmitExclusiveResult<T>>
} {
  const isInFlight = ref(false)

  async function runExclusive<T>(fn: () => Promise<T>): Promise<SubmitExclusiveResult<T>> {
    if (isInFlight.value) return { ok: false }
    isInFlight.value = true
    try {
      const value = await fn()
      return { ok: true, value }
    } finally {
      isInFlight.value = false
    }
  }

  return { isInFlight, runExclusive }
}
