/**
 * Fetches escrows and groups them by mint: offerTrades (depositToken) and requestTrades (requestToken).
 * Fetches via the marketplace Edge Function; falls back to direct RPC when no tenant context.
 */
import { PublicKey } from '@solana/web3.js'
import { watch } from 'vue'
import { useTenantStore } from '~/stores/tenant'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import BN from 'bn.js'
import { escrowPriceToHuman } from '@decentraguild/display'
import { createConnection, fetchAllEscrows } from '@decentraguild/web3'
import type { EscrowWithAddress } from '@decentraguild/web3'

const MIN_REMAINING_HUMAN = 0.0000001

function isEffectivelyComplete(remaining: BN, decimals: number): boolean {
  const rawThreshold = Math.max(1, Math.round(MIN_REMAINING_HUMAN * 10 ** decimals))
  return remaining.lt(new BN(rawThreshold))
}

export interface EscrowApiShape {
  publicKey: string
  account: {
    maker: string
    depositToken: string
    requestToken: string
    tokensDepositInit: string
    tokensDepositRemaining: string
    price: number
    decimals: number
    slippage: number
    seed: string
    expireTimestamp: string
    recipient: string
    onlyRecipient: boolean
    onlyWhitelist: boolean
    allowPartialFill: boolean
    whitelist: string
  }
}

export interface TradesByMint {
  offerTrades: EscrowWithAddress[]
  requestTrades: EscrowWithAddress[]
}

function apiEscrowToFull(e: EscrowApiShape): EscrowWithAddress {
  const acc = e.account
  return {
    publicKey: new PublicKey(e.publicKey),
    account: {
      maker: new PublicKey(acc.maker),
      depositToken: new PublicKey(acc.depositToken),
      requestToken: new PublicKey(acc.requestToken),
      tokensDepositInit: new BN(acc.tokensDepositInit),
      tokensDepositRemaining: new BN(acc.tokensDepositRemaining),
      price: escrowPriceToHuman(acc.price),
      decimals: acc.decimals,
      slippage: acc.slippage,
      seed: new BN(acc.seed),
      authBump: 0,
      vaultBump: 0,
      escrowBump: 0,
      expireTimestamp: new BN(acc.expireTimestamp),
      recipient: new PublicKey(acc.recipient),
      onlyRecipient: acc.onlyRecipient,
      onlyWhitelist: acc.onlyWhitelist,
      allowPartialFill: acc.allowPartialFill,
      whitelist: new PublicKey(acc.whitelist),
    },
  }
}

export function useEscrowsForMints(
  mints: Ref<Set<string>>,
  rpcUrl: Ref<string>,
  options?: { wallet?: Ref<string | null> },
) {
  const rawEscrows = ref<EscrowWithAddress[]>([])
  const whitelistAllowedLists = ref<Set<string>>(new Set())
  const escrows = computed(() => {
    const list = rawEscrows.value
    const wallet = options?.wallet?.value
    const tenantId = useTenantStore().tenantId
    if (!wallet?.trim() || !tenantId?.trim()) return list
    const allowed = whitelistAllowedLists.value
    return list.filter((e) => {
      if (!e.account.onlyWhitelist) return true
      return allowed.has(e.account.whitelist.toBase58())
    })
  })

  async function fetchWhitelistChecks(
    listAddresses: string[],
    wallet: string,
    tenantId: string,
  ): Promise<Set<string>> {
    const allowed = new Set<string>()
    const supabase = useSupabase()
    for (const listAddr of listAddresses) {
      try {
        const data = await invokeEdgeFunction<{ listed?: boolean }>(supabase, 'whitelist', {
          action: 'check',
          tenantId,
          listAddress: listAddr,
          wallet,
        })
        if (data.listed) allowed.add(listAddr)
      } catch {
        // skip
      }
    }
    return allowed
  }

  const byMint = computed(() => {
    const map = new Map<string, TradesByMint>()
    const list = escrows.value
    const m = mints.value

    for (const e of list) {
      const dep = e.account.depositToken.toBase58()
      const req = e.account.requestToken.toBase58()
      if (m.has(dep)) {
        const entry = map.get(dep) ?? { offerTrades: [], requestTrades: [] }
        entry.offerTrades.push(e)
        map.set(dep, entry)
      }
      if (m.has(req)) {
        const entry = map.get(req) ?? { offerTrades: [], requestTrades: [] }
        entry.requestTrades.push(e)
        map.set(req, entry)
      }
    }
    return map
  })

  const loading = ref(false)
  const error = ref<string | null>(null)

  watch(
    () => [rawEscrows.value, options?.wallet?.value, useTenantStore().tenantId] as const,
    async ([list, w, tenantId]) => {
      if (!w?.trim() || !tenantId?.trim() || !list.length) {
        whitelistAllowedLists.value = new Set()
        return
      }
      const withWhitelist = list.filter((e) => e.account.onlyWhitelist)
      const uniqueLists = [...new Set(withWhitelist.map((e) => e.account.whitelist.toBase58()))]
      if (uniqueLists.length === 0) {
        whitelistAllowedLists.value = new Set()
        return
      }
      whitelistAllowedLists.value = await fetchWhitelistChecks(uniqueLists, w, tenantId)
    },
    { immediate: true },
  )

  async function load() {
    const tenantId = useTenantStore().tenantId
    const m = mints.value

    loading.value = true
    error.value = null

    async function fetchViaRpc(): Promise<EscrowWithAddress[]> {
      if (!rpcUrl.value) return []
      const connection = createConnection(rpcUrl.value)
      const all = await fetchAllEscrows(connection)
      return all.filter((e) => {
        const dep = e.account.depositToken.toBase58()
        const req = e.account.requestToken.toBase58()
        const bothInScope = m.size === 0 || (m.has(dep) && m.has(req))
        const notComplete = !isEffectivelyComplete(
          e.account.tokensDepositRemaining,
          e.account.decimals,
        )
        return bothInScope && notComplete
      })
    }

    try {
      if (tenantId) {
        try {
          const supabase = useSupabase()
          const data = await invokeEdgeFunction<{ escrows?: EscrowApiShape[] }>(supabase, 'marketplace', { action: 'escrows', tenantId })
          const raw = data.escrows ?? []
          rawEscrows.value = raw.map(apiEscrowToFull)
          return
        } catch {
          /* fall through to RPC */
        }
      }

      const viaRpc = await fetchViaRpc()
      rawEscrows.value = viaRpc
      if (viaRpc.length > 0 || !tenantId) return

      if (tenantId && !rpcUrl.value) {
        error.value = 'Failed to load escrows. Ensure HELIUS_RPC_URL is set in supabase/functions/.env'
      } else if (!tenantId && !rpcUrl.value) {
        error.value = 'No tenant context and RPC not configured'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load escrows'
      rawEscrows.value = []
    } finally {
      loading.value = false
    }
  }

  return { escrows, byMint, loading, error, retry: load }
}
