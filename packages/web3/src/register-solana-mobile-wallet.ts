import { getDefaultMobileConfig } from '@solana/connector/headless'

let mwaRegistered = false

export async function registerSolanaMobileWalletAdapter(options: {
  appName: string
  appUrl?: string
}): Promise<void> {
  if (typeof window === 'undefined' || mwaRegistered) return
  try {
    const mod = await import('@solana-mobile/wallet-standard-mobile')
    const {
      registerMwa,
      createDefaultAuthorizationCache,
      createDefaultChainSelector,
      createDefaultWalletNotFoundHandler,
    } = mod
    const mobile = getDefaultMobileConfig({
      appName: options.appName,
      appUrl: options.appUrl,
    })
    const defaultChains = ['solana:mainnet', 'solana:devnet', 'solana:testnet'] as const
    registerMwa({
      appIdentity: mobile.appIdentity,
      authorizationCache: createDefaultAuthorizationCache(),
      chains: [...defaultChains],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    })
    mwaRegistered = true
  } catch {
    /* MWA optional: bundle or environment may not support it */
  }
}
