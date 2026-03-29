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
  isMobileUserAgent,
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

/** SIWS `URI` / domain for GoTrue; prefer canonical deploy URL so it matches Supabase redirect allow-list. */
function resolveSolanaWeb3SignInPageUrl(appUrlConfig: string | undefined): string {
  const base = appUrlConfig?.trim().replace(/\/$/, '')
  if (base && /^https?:\/\//i.test(base)) return base
  if (typeof window !== 'undefined') return window.location.href
  return 'http://localhost:3000'
}

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
   *
   * Mobile (MWA) path — single-session via `authorize + signMessages`:
   *   Opens ONE `transact()` (one app switch). Inside: `authorize` (no sign_in_payload)
   *   then `signMessages` with the SIWS text, both in the same MWA session. Pre-populates
   *   the MWA auth cache so `connectWallet` updates ConnectorKit state silently after.
   *
   *   This fixes Backpack mobile, which hangs indefinitely when `authorize` receives
   *   `sign_in_payload`. By skipping `sign_in_payload` and using `signMessages` in the
   *   same session we get one app-switch with two approval dialogs (connect + sign).
   *
   * Desktop path — two-step via `signMessage`:
   *   Connect first, then Supabase signs a SIWS message via the connected wallet's
   *   `signMessage` feature (works fine on desktop; no app-switching involved).
   */
  async function connectAndSignIn(connectorId: WalletConnectorId): Promise<boolean> {
    error.value = null
    loading.value = true
    try {
      // Clear stale ConnectorKit session and the MWA localStorage authorization cache.
      await web3DisconnectWallet()
      refreshConnectorState()

      const supabase = getClient()
      const siwsUrl = resolveSolanaWeb3SignInPageUrl(config.public.appUrl as string | undefined)

      if (isMobileUserAgent()) {
        // Single-session MWA: authorize + signMessages in ONE transact() call.
        // Works for Backpack and Solflare. Pre-signed result submitted directly to Supabase.
        const { mwaSingleSessionSignIn } = await import('@decentraguild/web3/wallet')

        const signResult = await mwaSingleSessionSignIn({
          siwsUrl,
          statement: 'Sign in to DecentraGuild.',
          chain: 'solana:mainnet',
        })

        const { data, error: authError } = await supabase.auth.signInWithWeb3({
          chain: 'solana',
          message: signResult.message,
          signature: signResult.signature,
        })

        if (authError) {
          error.value = authError.message
          return false
        }

        // Sync ConnectorKit: MWA cache was pre-populated by mwaSingleSessionSignIn,
        // so connectWallet hits it and updates state without another transact().
        await web3ConnectWallet(connectorId)
        refreshConnectorState()

        const state = getConnectorState()
        wallet.value =
          (data.session?.user?.user_metadata?.wallet_address as string) ??
          state.account ??
          signResult.address ??
          null
        clearWalletConnectDisplayUri()
        return true
      }

      // Desktop path: two-step — connect first, then sign the SIWS message.
      await web3ConnectWallet(connectorId)
      refreshConnectorState()

      const state = getConnectorState()
      if (!state.account) {
        error.value = 'Wallet not connected'
        return false
      }

      const { getSupabaseWalletAdapter, getConnectorClient } = await import('@decentraguild/web3/wallet')
      const walletAdapter = getSupabaseWalletAdapter()
      if (!walletAdapter) {
        error.value = 'Wallet does not support Solana sign-in'
        return false
      }

      const cluster = getConnectorClient().getCluster() as { id?: string } | null | undefined
      const siwsChainId = typeof cluster?.id === 'string' ? cluster.id : 'solana:mainnet'

      const { data, error: authError } = await supabase.auth.signInWithWeb3({
        chain: 'solana',
        wallet: walletAdapter,
        statement: 'Sign in to DecentraGuild.',
        options: {
          url: siwsUrl,
          signInWithSolana: { chainId: siwsChainId },
        },
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
