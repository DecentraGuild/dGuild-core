/**
 * Fetch connected wallet's token balances, filtered by allowed mints.
 * Uses getParsedTokenAccountsByOwner (Token + Token-2022) like C2C - RPC is reliable for USDC, USDT.
 * Adds native SOL when WSOL is in allowed mints (user can wrap). Client cache: 60s.
 */
import { PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { createConnection } from '@decentraguild/web3'

const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112'
const BALANCE_CACHE_TTL_MS = 60_000

export interface TokenBalance {
  mint: string
  amount: string
  decimals: number
  uiAmount: number | null
}

type BalanceCacheMode = 'scoped' | 'all'

const balanceCache = new Map<
  string,
  { balances: TokenBalance[]; fetchedAt: number }
>()

function getCacheKey(rpcUrl: string, owner: string, mode: BalanceCacheMode): string {
  return `${rpcUrl}:${owner}:${mode}`
}

function getCached(rpcUrl: string, owner: string, mode: BalanceCacheMode): TokenBalance[] | null {
  const key = getCacheKey(rpcUrl, owner, mode)
  const hit = balanceCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.fetchedAt > BALANCE_CACHE_TTL_MS) {
    balanceCache.delete(key)
    return null
  }
  return hit.balances
}

function setCache(rpcUrl: string, owner: string, balances: TokenBalance[], mode: BalanceCacheMode) {
  balanceCache.set(getCacheKey(rpcUrl, owner, mode), {
    balances,
    fetchedAt: Date.now(),
  })
}

export interface FetchWalletTokenBalancesOptions {
  forceRefresh?: boolean
  skipCache?: boolean
  /**
   * Return every SPL / Token-2022 account with non-zero balance (no mint allowlist).
   * Use for raffle prizes, vouchers, etc. Cache is separate from scoped fetches.
   */
  allHeldMints?: boolean
}

export async function fetchWalletTokenBalances(
  rpcUrl: string,
  ownerAddress: string,
  allowedMints: Set<string>,
  options?: FetchWalletTokenBalancesOptions
): Promise<TokenBalance[]> {
  const allHeld = options?.allHeldMints === true
  const cacheMode: BalanceCacheMode = allHeld ? 'all' : 'scoped'

  if (!allHeld && allowedMints.size === 0) return []

  if (!options?.forceRefresh && !options?.skipCache) {
    const cached = getCached(rpcUrl, ownerAddress, cacheMode)
    if (cached) return cached
  }

  const connection = createConnection(rpcUrl)
  const owner = new PublicKey(ownerAddress)
  const result: TokenBalance[] = []

  const [standardAccounts, token2022Accounts] = await Promise.all([
    connection
      .getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID })
      .catch(() => ({ value: [] })),
    connection
      .getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID })
      .catch(() => ({ value: [] })),
  ])

  const allAccounts = [
    ...(standardAccounts.value ?? []),
    ...(token2022Accounts.value ?? []),
  ]

  const seenMints = new Set<string>()
  for (const acc of allAccounts) {
    const mint = acc.account.data.parsed?.info?.mint
    if (!mint || seenMints.has(mint)) continue
    if (!allHeld && !allowedMints.has(mint)) continue
    const amount = acc.account.data.parsed?.info?.tokenAmount
    if (!amount) continue
    let raw: bigint
    try {
      raw = BigInt(amount.amount)
    } catch {
      continue
    }
    if (raw === 0n) continue
    seenMints.add(mint)
    result.push({
      mint,
      amount: amount.amount,
      decimals: amount.decimals ?? 0,
      uiAmount: amount.uiAmount ?? null,
    })
  }

  if (allHeld) {
    try {
      const lamports = await connection.getBalance(owner)
      if (lamports > 0 && !seenMints.has(NATIVE_SOL_MINT)) {
        const solBalance = lamports / 1e9
        result.push({
          mint: NATIVE_SOL_MINT,
          amount: lamports.toString(),
          decimals: 9,
          uiAmount: solBalance,
        })
      }
    } catch {
      // ignore
    }
  } else if (allowedMints.has(NATIVE_SOL_MINT)) {
    try {
      const lamports = await connection.getBalance(owner)
      const solBalance = lamports / 1e9
      if (solBalance > 0 || !seenMints.has(NATIVE_SOL_MINT)) {
        result.push({
          mint: NATIVE_SOL_MINT,
          amount: lamports.toString(),
          decimals: 9,
          uiAmount: solBalance,
        })
      }
    } catch {
      // ignore
    }
  }

  if (!options?.skipCache) {
    setCache(rpcUrl, ownerAddress, result, cacheMode)
  }
  return result
}
