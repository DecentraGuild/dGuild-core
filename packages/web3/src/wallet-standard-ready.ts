import { getConnectorClient, getConnectorState } from './connector.js'

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

const DEFAULT_MAX_WAIT_MS = 2500
const DEFAULT_POLL_MS = 100
const MODAL_MAX_WAIT_MS = 2000

export function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false
  return MOBILE_UA_RE.test(navigator.userAgent)
}

function walletStandardProbe(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { wallets?: unknown }
  if (nav.wallets) return true
  const w = window as Window & { solana?: unknown }
  return Boolean(w.solana)
}

export async function waitForWalletStandardInjected(options?: {
  maxWaitMs?: number
  pollMs?: number
}): Promise<boolean> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const pollMs = options?.pollMs ?? DEFAULT_POLL_MS
  if (typeof window === 'undefined') return false
  if (walletStandardProbe()) return true
  const deadline = Date.now() + maxWaitMs
  return new Promise((resolve) => {
    const id = window.setInterval(() => {
      if (walletStandardProbe()) {
        window.clearInterval(id)
        resolve(true)
        return
      }
      if (Date.now() >= deadline) {
        window.clearInterval(id)
        resolve(false)
      }
    }, pollMs)
  })
}

export async function runMobileWalletStandardWarmup(): Promise<void> {
  if (!isMobileUserAgent()) return
  await waitForWalletStandardInjected()
  getConnectorClient()
}

export async function runConnectModalWalletWarmup(): Promise<void> {
  if (!isMobileUserAgent()) return
  if (getConnectorState().connectors.length > 0) return
  await waitForWalletStandardInjected({ maxWaitMs: MODAL_MAX_WAIT_MS, pollMs: DEFAULT_POLL_MS })
  getConnectorClient()
}

/**
 * After returning from a native wallet (MWA), Chrome may report `visible` before the JS bridge is
 * ready for a second request (`signMessages`). Wait for visibility, then yield briefly.
 */
export async function settleWebViewAfterWalletReturn(options?: { settleMs?: number }): Promise<void> {
  if (typeof document === 'undefined') return
  const settleMs = options?.settleMs ?? 320
  if (document.visibilityState !== 'visible') {
    await new Promise<void>((resolve) => {
      const done = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', done)
          resolve()
        }
      }
      document.addEventListener('visibilitychange', done)
    })
  }
  await new Promise((r) => setTimeout(r, settleMs))
}
