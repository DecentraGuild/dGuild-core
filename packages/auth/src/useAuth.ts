/**
 * Authentication composable backed by Supabase Web3 (Solana sign-in).
 *
 * Flow:
 * 1. Connect wallet via the @decentraguild/web3 connector.
 * 2. Call signInWithWeb3() – Supabase handles nonce generation, message
 *    signing request, signature verification, and session issuance.
 * 3. Supabase session (JWT + refresh token) is persisted in cookies by
 *    @supabase/ssr so SSR and client are always in sync.
 *
 * The wallet address is available from session.user.user_metadata.wallet_address
 * after sign-in and is embedded in the JWT via the custom_access_token_hook.
 */

import { ref } from 'vue'
import { useRuntimeConfig } from 'nuxt/app'
import {
  getConnectorState,
  connectWallet as web3ConnectWallet,
  disconnectWallet as web3DisconnectWallet,
  clearWalletConnectDisplayUri,
  type ConnectorStateSnapshot,
} from '@decentraguild/web3/wallet'
import type { WalletConnectorId } from '@solana/connector/headless'
import { getBrowserClient } from './supabase-client'

// Shared state: layout, AuthWidget, and plugin all see the same session.
const wallet = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const connectorState = ref<ConnectorStateSnapshot>({
  connected: false,
  account: null,
  connectorId: null,
  connectors: [],
})

/** When set true, AuthWidget should open the connect modal. Reset by AuthWidget after opening. */
export const openConnectModalRequested = ref(false)

export function useAuth() {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnonKey = config.public.supabaseAnonKey as string

  function getClient() {
    return getBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  function refreshConnectorState() {
    connectorState.value = getConnectorState()
  }

  /** Restore wallet address from active Supabase session (called on mount / plugin init). */
  async function fetchMe() {
    loading.value = true
    error.value = null
    try {
      const { data } = await getClient().auth.getSession()
      const session = data.session
      if (session) {
        const addr = (session.user?.user_metadata?.wallet_address as string) ?? null
        if (addr) wallet.value = addr
      }
      // Do NOT clear wallet when session is null or missing wallet_address (e.g. token
      // refresh with minimal payload): getSession can return null during
      // tab switch / token refresh races. Only clear on explicit signOut or SIGNED_OUT.
    } catch {
      // On error, don't clear: could be transient. signOut handles explicit logout.
    } finally {
      loading.value = false
    }
  }

  /**
   * Connect wallet and sign in with Supabase Web3 (Solana).
   * Supabase generates a SIWS message, the connector signs it, and Supabase
   * verifies the signature and returns a session.
   */
  async function connectAndSignIn(connectorId: WalletConnectorId): Promise<boolean> {
    error.value = null
    loading.value = true
    try {
      // Clear any stale or pending connection (e.g. after Backpack auto-disconnect) so
      // the first click starts a clean connect instead of surfacing "Connection cancelled".
      await web3DisconnectWallet()
      refreshConnectorState()
      await web3ConnectWallet(connectorId)
      refreshConnectorState()

      const state = getConnectorState()
      if (!state.account) {
        error.value = 'Wallet not connected'
        return false
      }

      const { getSupabaseWalletAdapter } = await import('@decentraguild/web3/wallet')
      const walletAdapter = getSupabaseWalletAdapter()
      if (!walletAdapter) {
        error.value = 'Wallet does not support message signing'
        return false
      }

      const supabase = getClient()
      const { data, error: authError } = await supabase.auth.signInWithWeb3({
        chain: 'solana',
        wallet: walletAdapter,
        statement: 'Sign in to DecentraGuild.',
      })

      if (authError) {
        error.value = authError.message
        return false
      }

      wallet.value =
        (data.session?.user?.user_metadata?.wallet_address as string) ?? state.account ?? null
      clearWalletConnectDisplayUri()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign-in failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    try {
      await getClient().auth.signOut()
    } finally {
      wallet.value = null
      error.value = null
      await web3DisconnectWallet()
      refreshConnectorState()
    }
  }

  function openConnectModal() {
    openConnectModalRequested.value = true
  }

  return {
    wallet,
    loading,
    error,
    connectorState,
    fetchMe,
    refreshConnectorState,
    connectAndSignIn,
    signOut,
    openConnectModal,
  }
}
