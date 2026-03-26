import { PublicKey } from '@solana/web3.js'
import type { Transaction, VersionedTransaction } from '@solana/web3.js'
import {
  ConnectorClient,
  createSolanaMainnet,
  getDefaultConfig,
  createTransactionSigner,
  isConnected,
  type ConnectOptions,
  type ConnectorState,
  type WalletConnectorId,
  type Wallet,
  type WalletAccount,
} from '@solana/connector/headless'
import { isMobileUserAgent } from './wallet-standard-ready.js'
import type { Wallet as EscrowWallet } from './escrow/types.js'

/** Avoid `Buffer` in the browser bundle; some mobile WebViews lack it. */
function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * localStorage key used by @solana-mobile/wallet-standard-mobile's
 * createDefaultAuthorizationCache(). Pre-populating it lets connectWallet()
 * return without opening a second transact() (no second app-switch).
 */
const MWA_CACHE_KEY = 'SolanaMobileWalletAdapterDefaultAuthorizationCache'

function signatureBytesFromSignerResult(sig: Uint8Array | string): Uint8Array {
  return sig instanceof Uint8Array ? sig : base64ToUint8Array(sig)
}

export interface ConnectorStateSnapshot {
  connected: boolean
  account: string | null
  connectorId: string | null
  connectors: { id: string; name: string; ready: boolean }[]
}

export type ConnectorWebOptions = {
  appUrl?: string
  walletConnectProjectId?: string
}

let webOptions: ConnectorWebOptions = {}

let clientInstance: ConnectorClient | null = null

let walletConnectDisplayUri: string | null = null
const walletConnectUriListeners = new Set<(uri: string | null) => void>()

function setWalletConnectDisplayUri(uri: string | null): void {
  if (walletConnectDisplayUri === uri) return
  walletConnectDisplayUri = uri
  for (const fn of walletConnectUriListeners) {
    fn(uri)
  }
}

export function setConnectorWebOptions(opts: ConnectorWebOptions): void {
  webOptions = { ...webOptions, ...opts }
  clientInstance = null
  setWalletConnectDisplayUri(null)
}

export function subscribeWalletConnectUri(listener: (uri: string | null) => void): () => void {
  walletConnectUriListeners.add(listener)
  listener(walletConnectDisplayUri)
  return () => {
    walletConnectUriListeners.delete(listener)
  }
}

export function getWalletConnectDisplayUri(): string | null {
  return walletConnectDisplayUri
}

export function clearWalletConnectDisplayUri(): void {
  setWalletConnectDisplayUri(null)
}

function resolveAppUrl(): string {
  const trimmed = webOptions.appUrl?.trim()
  if (trimmed) return trimmed.replace(/\/$/, '')
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin
    if (origin) return origin.replace(/\/$/, '')
  }
  return 'http://localhost:3002'
}

function createConnectorClient(): ConnectorClient {
  const appUrl = resolveAppUrl()
  const wcId = webOptions.walletConnectProjectId?.trim() ?? ''
  const walletConnectConfig =
    wcId.length > 0
      ? {
          projectId: wcId,
          metadata: {
            name: 'DecentraGuild',
            description: 'Solana community dApp',
            url: appUrl,
            icons: [`${appUrl}/favicon.ico`],
          },
          onDisplayUri: (uri: string) => {
            setWalletConnectDisplayUri(uri)
          },
        }
      : undefined

  return new ConnectorClient(
    getDefaultConfig({
      appName: 'DecentraGuild',
      appUrl,
      autoConnect: true,
      enableMobile: true,
      ...(walletConnectConfig ? { walletConnect: walletConnectConfig } : {}),
    }),
  )
}

function getClient(): ConnectorClient {
  if (!clientInstance) {
    clientInstance = createConnectorClient()
  }
  return clientInstance
}

/** MWA / Wallet Standard signMessage expects a chain id; omitting cluster skips it and breaks some wallets. */
function clusterForSigner(client: ConnectorClient) {
  return client.getCluster() ?? createSolanaMainnet()
}

export function getConnectorClient(): ConnectorClient {
  return getClient()
}

export function getConnectorState(): ConnectorStateSnapshot {
  const client = getClient()
  const state = client.getSnapshot()
  const wallet = state.wallet
  const connected = isConnected(wallet)
  const session = connected ? wallet.session : null
  const account = session?.selectedAccount?.address ?? null
  const connectorId = session?.connectorId ?? null
  const connectors = (state.connectors ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    ready: c.ready ?? true,
  }))
  return {
    connected: connected && !!account,
    account,
    connectorId,
    connectors,
  }
}

export function subscribeToConnectorState(listener: (state: ConnectorState) => void): () => void {
  const client = getClient()
  return client.subscribe(listener)
}

/** Stable ConnectorKit id for `@solana-mobile/wallet-standard-mobile`. */
const MOBILE_WALLET_CONNECTOR_ID = 'mobile-wallet-adapter' as WalletConnectorId

export async function connectWallet(
  connectorId: WalletConnectorId,
  options?: ConnectOptions,
): Promise<void> {
  setWalletConnectDisplayUri(null)
  const client = getClient()
  await client.connectWallet(connectorId, options)
}

/**
 * Restores ConnectorKit + signing wallet when the user is already signed in (Supabase session)
 * but the headless connector lost in-memory state — common on mobile after navigation or refresh
 * because `ConnectorClient` does not persist `walletStateStorage` for vNext silent auto-connect.
 *
 * Prefer **silent** MWA reconnect (reads `SolanaMobileWalletAdapterDefaultAuthorizationCache`) so Pay
 * does not open a second interactive session that often hits the MWA protocol blur timeout.
 */
export async function ensureSigningWalletForSession(
  sessionWalletAddress: string | null | undefined,
): Promise<void> {
  if (typeof sessionWalletAddress !== 'string' || !sessionWalletAddress.trim()) {
    throw new Error('Sign in required')
  }
  const expected = sessionWalletAddress.trim()
  const existing = getEscrowWalletFromConnector()
  if (existing?.publicKey.toBase58() === expected) return

  const client = getClient()

  const silentSessionOpts = {
    silent: true,
    preferredAccount: expected,
    allowInteractiveFallback: true,
  } as ConnectOptions

  if (isMobileUserAgent()) {
    await client.connectWallet(MOBILE_WALLET_CONNECTOR_ID, silentSessionOpts)
  } else {
    const withAuto = client as unknown as {
      autoConnector?: { attemptAutoConnect(): Promise<boolean> }
    }
    await withAuto.autoConnector?.attemptAutoConnect()
    let cur = getEscrowWalletFromConnector()
    if (!cur?.publicKey || cur.publicKey.toBase58() !== expected) {
      const { connectorId } = getConnectorState()
      if (connectorId) {
        await client.connectWallet(connectorId as WalletConnectorId, silentSessionOpts)
      }
    }
  }

  const ready = getEscrowWalletFromConnector()
  if (!ready?.publicKey || ready.publicKey.toBase58() !== expected) {
    throw new Error('Wallet session expired. Use Connect wallet in the header, then try again.')
  }
}

export async function disconnectWallet(): Promise<void> {
  const client = getClient()
  await client.disconnectWallet()
  setWalletConnectDisplayUri(null)
}

/**
 * Return the raw Wallet Standard wallet for `connectorId` WITHOUT connecting.
 *
 * This is used by the one-shot MWA sign-in path: obtain the wallet before connecting,
 * then pass its `solana:signIn` feature directly to `supabase.auth.signInWithWeb3`.
 * That performs auth + SIWS sign in a **single** MWA `transact()` call (one app switch).
 * After `signIn` the wallet's authorization cache is populated; a subsequent
 * `connectWallet()` call hits the cache and sets ConnectorKit state without a
 * second `transact()`.
 */
export function getMwaRawWallet(connectorId: WalletConnectorId): Wallet | null {
  const client = getClient() as ConnectorClient & {
    getConnector?: (id: WalletConnectorId) => Wallet | null
  }
  return client.getConnector?.(connectorId) ?? null
}

/** ConnectorKit session id for `@solana-mobile/wallet-standard-mobile`. */
export function isMobileWalletAdapterConnector(connectorId: string | null): boolean {
  return connectorId === MOBILE_WALLET_CONNECTOR_ID
}

export function isBackpackConnector(connectorId: string | null): boolean {
  if (!connectorId) return false
  if (connectorId.toLowerCase().includes('backpack')) return true
  // Mobile MWA: connectorId is always 'mobile-wallet-adapter'.
  // Read wallet_uri_base from the MWA auth cache (already written by mwaSingleSessionSignIn)
  // to detect which wallet was actually used (billing ix order only).
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(MWA_CACHE_KEY) : null
    if (raw) {
      const cache = JSON.parse(raw) as { wallet_uri_base?: string }
      if (cache.wallet_uri_base?.toLowerCase().includes('backpack')) return true
    }
  } catch {
    // localStorage unavailable or cache malformed
  }
  return false
}

export function getWalletAndAccount(client: ConnectorClient): { wallet: Wallet; account: WalletAccount } | null {
  const state = client.getSnapshot()
  const walletStatus = state.wallet
  if (!isConnected(walletStatus)) return null
  const session = walletStatus.session
  const connectorId = session.connectorId
  const selectedAccount = session.selectedAccount
  if (!selectedAccount) return null
  const wallet = client.getConnector(connectorId)
  if (!wallet) return null
  const walletAccount = wallet.accounts.find((a) => a.address === selectedAccount.address)
  if (!walletAccount) return null
  return { wallet, account: walletAccount }
}

export async function signMessageForAuth(message: string): Promise<{ signature: string; message: string }> {
  const client = getClient()
  const pair = getWalletAndAccount(client)
  if (!pair) {
    throw new Error('Wallet not connected')
  }
  const signer = createTransactionSigner({
    wallet: pair.wallet,
    account: pair.account,
    cluster: clusterForSigner(client),
  })
  if (!signer?.signMessage) {
    throw new Error('Connected wallet does not support message signing')
  }
  const messageBytes = new TextEncoder().encode(message)
  const signatureBytes = await signer.signMessage(messageBytes)
  const signature =
    signatureBytes instanceof Uint8Array
      ? btoa(String.fromCharCode(...signatureBytes))
      : String(signatureBytes)
  return { signature, message }
}

/**
 * Adapter for `supabase.auth.signInWithWeb3({ chain: 'solana', wallet })`.
 *
 * Used by the desktop (two-step) sign-in path: `connectWallet` first, then pass this
 * adapter to Supabase so it signs with the already-connected wallet via `signMessage`.
 *
 * Do **not** expose `wallet.signIn` here for MWA: if `connectWallet` already ran,
 * `performAuthorization` returns the **cached** session (no `sign_in_payload`) which
 * has no `sign_in_result` → "Sign in failed, no sign in result returned by wallet".
 *
 * For MWA mobile, use `getMwaRawWallet` + one-shot sign-in instead (see `useAuth.ts`).
 */
export function getSupabaseWalletAdapter(): {
  publicKey: { toBase58: () => string }
  signMessage: (message: Uint8Array, _display?: string) => Promise<Uint8Array>
} | null {
  const client = getClient()
  const pair = getWalletAndAccount(client)
  if (!pair) return null
  const signer = createTransactionSigner({
    wallet: pair.wallet,
    account: pair.account,
    cluster: clusterForSigner(client),
  })
  if (!signer?.signMessage) return null
  const signMessage = signer.signMessage
  return {
    publicKey: { toBase58: () => pair.account.address },
    signMessage: async (message: Uint8Array) => {
      const sig = await signMessage(message)
      return signatureBytesFromSignerResult(sig as Uint8Array | string)
    },
  }
}

export async function signMessageWithConnector(
  _connectorId: WalletConnectorId,
  message: Uint8Array,
): Promise<Uint8Array> {
  const client = getClient()
  const pair = getWalletAndAccount(client)
  if (!pair) {
    throw new Error('Wallet not connected')
  }
  const signer = createTransactionSigner({
    wallet: pair.wallet,
    account: pair.account,
    cluster: clusterForSigner(client),
  })
  if (!signer?.signMessage) {
    throw new Error('Connected wallet does not support message signing')
  }
  const signatureBytes = await signer.signMessage(message)
  return signatureBytesFromSignerResult(signatureBytes as Uint8Array | string)
}

/**
 * Single-session MWA sign-in for Backpack and all MWA wallets.
 *
 * Opens ONE `transact()` session and performs:
 *   1. `wallet.authorize({ chain, identity })` — no `sign_in_payload`
 *      (Backpack hangs when it receives `sign_in_payload` in authorize, never responding)
 *   2. `wallet.signMessages(...)` — SIWS text signed in the **same** session
 *
 * This is a single app-switch. After returning, the MWA authorization cache is
 * pre-populated so that `connectWallet()` finds it and updates ConnectorKit state
 * without opening another transact().
 *
 * The returned `message` + `signature` are passed directly to
 * `supabase.auth.signInWithWeb3({ chain: 'solana', message, signature })`.
 */
export async function mwaSingleSessionSignIn({
  siwsUrl,
  statement,
  chain = 'solana:mainnet',
}: {
  siwsUrl: string
  statement: string
  chain?: string
}): Promise<{ message: string; signature: Uint8Array; address: string }> {
  const { transact } = await import(
    /* webpackChunkName: "mwa-protocol" */
    '@solana-mobile/mobile-wallet-adapter-protocol'
  )
  const parsedUrl = new URL(siwsUrl)
  const appIdentity = {
    name: 'DecentraGuild',
    uri: parsedUrl.origin,
    icon: '/favicon.ico',
  }

  return (transact as (cb: (w: unknown) => Promise<unknown>) => Promise<unknown>)(
    async (mobileWallet: unknown) => {
      const wallet = mobileWallet as {
        getCapabilities: () => Promise<unknown>
        authorize: (p: { chain: string; identity: { name: string; uri: string; icon: string } }) => Promise<{
          accounts: Array<{ address: string; label?: string; icon?: string }>
          auth_token: string
          wallet_uri_base?: string
        }>
        signMessages: (p: { addresses: string[]; payloads: string[] }) => Promise<{
          signed_payloads: string[]
        }>
      }

      const [capabilities, authResult] = await Promise.all([
        wallet.getCapabilities(),
        wallet.authorize({ chain, identity: appIdentity }),
      ])

      if (!authResult.accounts?.length) throw new Error('No accounts returned from wallet')

      // MWA gives base64-encoded public key bytes; SIWS needs base58 address
      const pubkeyBytes = base64ToUint8Array(authResult.accounts[0].address)
      const addressBase58 = new PublicKey(pubkeyBytes).toBase58()
      const issuedAt = new Date().toISOString()

      // Build SIWS text matching Supabase's signMessage path format exactly
      const message = [
        `${parsedUrl.host} wants you to sign in with your Solana account:`,
        addressBase58,
        '',
        statement,
        '',
        'Version: 1',
        `URI: ${parsedUrl.href}`,
        `Issued At: ${issuedAt}`,
        `Chain ID: ${chain}`,
      ].join('\n')

      // Sign within the SAME session — no second app-switch
      const messageBytes = new TextEncoder().encode(message)
      const { signed_payloads } = await wallet.signMessages({
        addresses: [authResult.accounts[0].address], // base64 as MWA expects
        payloads: [uint8ArrayToBase64(messageBytes)], // base64 of UTF-8 message
      })

      // Ed25519 signature = last 64 bytes of signed_payload
      const signedPayload = base64ToUint8Array(signed_payloads[0])
      const signature = new Uint8Array(signedPayload.slice(-64))

      // Pre-populate the MWA auth cache so connectWallet() hits it without transact()
      const cacheEntry = {
        ...authResult,
        accounts: [
          {
            address: addressBase58, // base58 — cache.get() rebuilds publicKey from this
            chains: [chain, 'solana:mainnet', 'solana:devnet', 'solana:testnet'],
            features: [
              'solana:signAndSendTransaction',
              'solana:signTransaction',
              'solana:signMessage',
              'solana:signIn',
            ],
            label: authResult.accounts[0].label,
            icon: authResult.accounts[0].icon,
          },
        ],
        chain,
        capabilities,
      }
      try {
        localStorage.setItem(MWA_CACHE_KEY, JSON.stringify(cacheEntry))
      } catch {
        // localStorage may be unavailable (private browsing etc.); not fatal
      }

      return { message, signature, address: addressBase58 }
    },
  ) as Promise<{ message: string; signature: Uint8Array; address: string }>
}

export function getEscrowWalletFromConnector(): EscrowWallet | null {
  const client = getClient()
  const pair = getWalletAndAccount(client)
  if (!pair) return null
  const walletStatus = client.getSnapshot().wallet
  const connectorId =
    isConnected(walletStatus) && walletStatus.session
      ? (walletStatus.session.connectorId as string | null)
      : null
  const signer = createTransactionSigner({
    wallet: pair.wallet,
    account: pair.account,
    cluster: clusterForSigner(client),
  })
  if (
    !signer ||
    typeof signer.signTransaction !== 'function' ||
    typeof signer.signAllTransactions !== 'function'
  ) {
    return null
  }
  const address = pair.account.address
  const publicKey = typeof address === 'string' ? new PublicKey(address) : address
  const signTransaction = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
    const signed = await signer.signTransaction(tx)
    return signed as T
  }
  const signAllTransactions = async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
    const signed = await signer.signAllTransactions(txs)
    return signed as T[]
  }
  const canSend = signer.getCapabilities().canSend
  // Backpack extension: signAndSend + ConnectorKit’s `transactions: [bytes]` looks like a batch in the UI.
  // Mobile Wallet Adapter: same wire + wallet-broadcast path often returns to the browser without a clear
  // approval screen or fails spuriously; sign + dapp `sendRawTransaction` matches the Backpack workaround.
  const signAndSendTransaction =
    canSend && !isBackpackConnector(connectorId) && !isMobileWalletAdapterConnector(connectorId)
      ? async (tx: Transaction | VersionedTransaction): Promise<string> => {
          return signer.signAndSendTransaction(tx)
        }
      : undefined
  return {
    publicKey,
    signTransaction,
    signAllTransactions,
    signAndSendTransaction,
  }
}
