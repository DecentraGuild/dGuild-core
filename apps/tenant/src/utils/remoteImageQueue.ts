/**
 * Global concurrency limit for remote mint/asset images to avoid overwhelming
 * origins that reset connections under parallel browser loads (ERR_CONNECTION_RESET).
 */

const MAX_CONCURRENT = 4
let inFlight = 0
const waiters: Array<() => void> = []

export function acquireRemoteImageSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (inFlight < MAX_CONCURRENT) {
        inFlight++
        resolve()
      } else {
        waiters.push(tryAcquire)
      }
    }
    tryAcquire()
  })
}

export function releaseRemoteImageSlot(): void {
  inFlight = Math.max(0, inFlight - 1)
  const next = waiters.shift()
  if (next) next()
}
