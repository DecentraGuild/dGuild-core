import { PublicKey } from '@solana/web3.js'
import type { Transaction, VersionedTransaction } from '@solana/web3.js'
import {
  ConnectorClient,
  getDefaultConfig,
  createTransactionSigner,
  isConnected,
  type ConnectorState,
  type WalletConnectorId,
  type Wallet,
  type WalletAccount,
} from '@solana/connector/headless'
import type { Wallet as EscrowWallet } from './escrow/types.js'

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
  })
  if (!signer?.signMessage) return null
  const signMessage = signer.signMessage
  return {
    publicKey: { toBase58: () => pair.account.address },
    signMessage: async (message: Uint8Array) => {
      const sig = await signMessage(message)
      return sig instanceof Uint8Array ? sig : new Uint8Array(Buffer.from(sig as string, 'base64'))
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
  })
  if (!signer?.signMessage) {
    throw new Error('Connected wallet does not support message signing')
  }
  const signatureBytes = await signer.signMessage(message)
  return signatureBytes instanceof Uint8Array
    ? signatureBytes
    : new Uint8Array(Buffer.from(signatureBytes as string, 'base64'))
}

export function getEscrowWalletFromConnector(): EscrowWallet | null {
  const client = getClient()
  const pair = getWalletAndAccount(client)
  if (!pair) return null
  const signer = createTransactionSigner({
    wallet: pair.wallet,
    account: pair.account,
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
