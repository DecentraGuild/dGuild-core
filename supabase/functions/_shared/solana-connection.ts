/**
 * Solana connection factory for Edge Functions.
 * Uses HELIUS_RPC_URL or SOLANA_RPC_URL environment variable.
 */
import { Connection } from 'npm:@solana/web3.js@1'
import { getRpcUrl } from './rpc-url.ts'

export { getRpcUrl }

let _connection: Connection | null = null

export function getSolanaConnection(): Connection {
  if (_connection) return _connection
  _connection = new Connection(getRpcUrl(), 'confirmed')
  return _connection
}
