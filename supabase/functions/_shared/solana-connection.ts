/**
 * Solana connection factory for Edge Functions.
 * Uses HELIUS_RPC_URL or SOLANA_RPC_URL environment variable.
 */
import { Connection } from 'npm:@solana/web3.js@1'

let _connection: Connection | null = null

/** RPC URL for DAS/Helius-style fetch calls. Connection does not expose this. */
export function getRpcUrl(): string {
  return (
    Deno.env.get('HELIUS_RPC_URL') ??
    Deno.env.get('SOLANA_RPC_URL') ??
    'https://api.mainnet-beta.solana.com'
  )
}

export function getSolanaConnection(): Connection {
  if (_connection) return _connection
  _connection = new Connection(getRpcUrl(), 'confirmed')
  return _connection
}
