/**
 * Shared Solana connection for the tenant app. Uses RPC URL from runtime config
 * (useRpc). Prefer this over creating new Connection() so RPC and options stay consistent.
 */
import { createConnection } from '@decentraguild/web3'
import { useRpc } from './useRpc'

export function useSolanaConnection() {
  const { rpcUrl, hasRpc, rpcError } = useRpc()
  const connection = computed(() => (rpcUrl.value ? createConnection(rpcUrl.value) : null))
  return { connection, rpcUrl, hasRpc, rpcError }
}
