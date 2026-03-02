/**
 * Shared Solana connection factory. Use this so RPC URL and default options
 * (e.g. commitment) are defined in one place. Browser callers should pass
 * the RPC URL from their runtime config (e.g. Nuxt useRpc().rpcUrl).
 */

import { Connection } from '@solana/web3.js'

/**
 * Create a Solana Connection for the given RPC URL. Use in browser/tenant app
 * with RPC from useRpc() or equivalent; in API use getSolanaConnection() instead.
 */
export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl.replace(/\/$/, ''))
}
