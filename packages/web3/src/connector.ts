import { PublicKey } from '@solana/web3.js'
import type { Transaction, VersionedTransaction } from '@solana/web3.js'
import {
  ConnectorClient,
  createSolanaMainnet,
  getDefaultConfig,
  createTransactionSigner,
  isConnected,
  type ConnectorState,
  type WalletConnectorId,
  type Wallet,
  type WalletAccount,
} from '@solana/connector/headless'
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

export async function connectWallet(connectorId: WalletConnectorId): Promise<void> {
  setWalletConnectDisplayUri(null)
  const client = getClient()
  await client.connectWallet(connectorId)
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

export function isBackpackConnector(connectorId: string | null): boolean {
  if (!connectorId) return false
  return connectorId.toLowerCase().includes('backpack')
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

export function getEscrowWalletFromConnector(): EscrowWallet | null {
  const client = getClient()
  const pair = getWalletAndAccount(client)
  if (!pair) return null
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
  return {
    publicKey,
    signTransaction,
    signAllTransactions,
  }
}
