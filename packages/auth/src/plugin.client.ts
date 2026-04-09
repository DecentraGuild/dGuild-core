/**
 * Client-side auth plugin: initialises the Supabase session from cookies and
 * subscribes to auth state changes so the wallet ref stays in sync.
 *
 * Session persistence (no spurious logouts):
 * - fetchMe: only set wallet when session has wallet_address; never clear on null.
 * - onAuthStateChange: only SET wallet when session has wallet_address; never CLEAR from events.
 *   (Token refresh can emit session with minimal user_metadata; do not overwrite with null.)
 * - signOut: the only place we clear (user-initiated).
 * Supabase fires spurious SIGNED_OUT/null on tab switch and token refresh; we ignore them.
 * Session persists until the user explicitly signs out or closes the browser.
 */
import {
  setConnectorWebOptions,
  runMobileWalletStandardWarmup,
  registerSolanaMobileWalletAdapter,
} from '@decentraguild/web3/wallet'
import { useAuth, walletFromSupabaseUser } from './useAuth'
import { getBrowserClient } from './supabase-client'

/** Same host rule as SIWS: connector metadata / WalletConnect icons must match the live origin. */
function resolveClientAppUrlForWallet(configured: string | undefined): string | undefined {
  const c = configured?.trim().replace(/\/$/, '') ?? ''
  if (typeof window === 'undefined') {
    return c || undefined
  }
  const origin = `${window.location.protocol}//${window.location.host}`.replace(/\/$/, '')
  if (!c || !/^https?:\/\//i.test(c)) return origin
  try {
    if (new URL(c).host === window.location.host) return c
  } catch {
    return origin
  }
  return origin
}

export default defineNuxtPlugin(async () => {
  if (import.meta.server) return

  const config = useRuntimeConfig()
  const configuredAppUrl = (config.public.appUrl as string | undefined) || undefined
  const appUrl = resolveClientAppUrlForWallet(configuredAppUrl)
  setConnectorWebOptions({
    appUrl,
    walletConnectProjectId:
      (config.public.walletConnectProjectId as string | undefined) || undefined,
  })

  await registerSolanaMobileWalletAdapter({
    appName: 'DecentraGuild',
    appUrl,
  })

  const auth = useAuth()
  void runMobileWalletStandardWarmup().then(() => {
    auth.refreshConnectorState()
  })

  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnonKey = config.public.supabaseAnonKey as string

  const supabase = getBrowserClient(supabaseUrl, supabaseAnonKey)

  void auth.fetchMe()

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const addr = walletFromSupabaseUser(session.user)
      if (addr) auth.wallet.value = addr
    }
  })
})
