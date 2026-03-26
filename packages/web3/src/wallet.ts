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
  ensureSigningWalletForSession,
  signMessageForAuth,
  signMessageWithConnector,
  getWalletAndAccount,
  getEscrowWalletFromConnector,
  getSupabaseWalletAdapter,
  getMwaRawWallet,
  mwaSingleSessionSignIn,
  setConnectorWebOptions,
  subscribeWalletConnectUri,
  getWalletConnectDisplayUri,
  clearWalletConnectDisplayUri,
  type ConnectorStateSnapshot,
  type ConnectorWebOptions,
} from './connector.js'
export {
  isMobileUserAgent,
  waitForWalletStandardInjected,
  runMobileWalletStandardWarmup,
  runConnectModalWalletWarmup,
  settleWebViewAfterWalletReturn,
} from './wallet-standard-ready.js'
export { registerSolanaMobileWalletAdapter } from './register-solana-mobile-wallet.js'
