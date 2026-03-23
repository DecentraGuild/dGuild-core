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
import { setConnectorWebOptions } from '@decentraguild/web3/wallet'
import { useAuth } from './useAuth'
import { getBrowserClient } from './supabase-client'

export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  const config = useRuntimeConfig()
  setConnectorWebOptions({
    appUrl: (config.public.appUrl as string | undefined) || undefined,
    walletConnectProjectId:
      (config.public.walletConnectProjectId as string | undefined) || undefined,
  })
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnonKey = config.public.supabaseAnonKey as string

  const auth = useAuth()
  const supabase = getBrowserClient(supabaseUrl, supabaseAnonKey)

  void auth.fetchMe()

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      const addr = session.user?.user_metadata?.wallet_address as string | undefined
      // Only set when we have an address. Token refresh can send session with minimal
      // user_metadata; do not overwrite wallet with null and drop the user's login.
      if (addr) auth.wallet.value = addr
    }
    // Never clear from events: Supabase fires spurious null on tab switch / refresh.
    // Only signOut() clears.
  })
})
