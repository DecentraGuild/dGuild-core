/**
 * Solana RPC URL for Edge Functions (Helius / public RPC). No @solana/web3.js import.
 */
export function getRpcUrl(): string {
  return (
    Deno.env.get('HELIUS_RPC_URL') ??
    Deno.env.get('SOLANA_RPC_URL') ??
    'https://api.mainnet-beta.solana.com'
  )
}
