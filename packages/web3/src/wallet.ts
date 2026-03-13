/**
 * Wallet + auth only. No escrow/spl-token.
 * Use this for platform app, admin, any consumer that only needs connect + sign in.
 * Import escrow separately when needed (e.g. marketplace).
 */
export {
  getConnectorClient,
  getConnectorState,
  subscribeToConnectorState,
  connectWallet,
  disconnectWallet,
  signMessageForAuth,
  signMessageWithConnector,
  getWalletAndAccount,
  getEscrowWalletFromConnector,
  getSupabaseWalletAdapter,
  type ConnectorStateSnapshot,
} from './connector.js'
