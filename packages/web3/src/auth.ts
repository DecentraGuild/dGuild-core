/**
 * Wallet connector re-exports for auth-adjacent usage.
 * The sign-in flow is now handled by Supabase Web3 auth (signInWithWeb3).
 * This file is kept for backward-compatibility of any imports that
 * reference '@decentraguild/web3/wallet'.
 */

export {
  getConnectorState,
  subscribeToConnectorState,
  connectWallet,
  disconnectWallet,
  getConnectorClient,
  type ConnectorStateSnapshot,
} from './connector.js'
