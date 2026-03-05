/**
 * Fetches escrows and groups them by mint: offerTrades (depositToken) and requestTrades (requestToken).
 * Prefers API when apiUrl and slug available (no client RPC needed); falls back to client RPC.
 * Only includes escrows where BOTH sides are in scope and have meaningful remaining (not completed).
 */
import { PublicKey } from '@solana/web3.js'
import { watch } from 'vue'
import { API_V1 } from '~/utils/apiBase'
import { useTenantStore } from '~/stores/tenant'
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
  options?: { apiUrl?: Ref<string>; slug?: Ref<string | null>; wallet?: Ref<string | null> }
) {
  const rawEscrows = ref<EscrowWithAddress[]>([])
  const whitelistAllowedLists = ref<Set<string>>(new Set())
  const escrows = computed(() => {
    const list = rawEscrows.value
    const wallet = options?.wallet?.value
    const slug = options?.slug?.value
    if (!wallet?.trim() || !slug?.trim()) return list
    const allowed = whitelistAllowedLists.value
    return list.filter((e) => {
      if (!e.account.onlyWhitelist) return true
      return allowed.has(e.account.whitelist.toBase58())
    })
  })

  async function fetchWhitelistChecks(listAddresses: string[], wallet: string, tenantId: string) {
    const apiBase = options?.apiUrl?.value ?? ''
    if (!apiBase) return new Set<string>()
    const allowed = new Set<string>()
    for (const listAddr of listAddresses) {
      try {
        const res = await fetch(
          `${apiBase}${API_V1}/tenant/${encodeURIComponent(tenantId)}/whitelist/check?wallet=${encodeURIComponent(wallet)}&list=${encodeURIComponent(listAddr)}`,
          { credentials: 'include' }
        )
        if (res.ok) {
          const data = (await res.json()) as { listed?: boolean }
          if (data.listed) allowed.add(listAddr)
        }
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
        let entry = map.get(dep)
        if (!entry) {
          entry = { offerTrades: [], requestTrades: [] }
          map.set(dep, entry)
        }
        entry.offerTrades.push(e)
      }
      if (m.has(req)) {
        let entry = map.get(req)
        if (!entry) {
          entry = { offerTrades: [], requestTrades: [] }
          map.set(req, entry)
        }
        entry.requestTrades.push(e)
      }
    }
    return map
  })

  const loading = ref(false)
  const error = ref<string | null>(null)

  watch(
    () => [rawEscrows.value, options?.wallet?.value, options?.slug?.value] as const,
    async ([list, w, s]) => {
      if (!w?.trim() || !s?.trim() || !list.length) {
        whitelistAllowedLists.value = new Set()
        return
      }
      const withWhitelist = list.filter((e) => e.account.onlyWhitelist)
      const uniqueLists = [...new Set(withWhitelist.map((e) => e.account.whitelist.toBase58()))]
      if (uniqueLists.length === 0) {
        whitelistAllowedLists.value = new Set()
        return
      }
      const apiBase = options?.apiUrl?.value ?? ''
      if (!apiBase) return
      const id = useTenantStore().tenantId
      whitelistAllowedLists.value = id ? await fetchWhitelistChecks(uniqueLists, w, id) : new Set()
    },
    { immediate: true }
  )

  async function load() {
    const apiBase = options?.apiUrl?.value ?? ''
    const tenantId = useTenantStore().tenantId
    const useApi = apiBase && tenantId && apiBase.length > 0

    if (useApi) {
      loading.value = true
      error.value = null
      try {
        const res = await fetch(`${apiBase}${API_V1}/tenant/${encodeURIComponent(tenantId)}/marketplace/escrows`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { escrows?: EscrowApiShape[] }
        const raw = Array.isArray(data.escrows) ? data.escrows : []
        rawEscrows.value = raw.map(apiEscrowToFull)
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load escrows'
        rawEscrows.value = []
      } finally {
        loading.value = false
      }
      return
    }

    if (!rpcUrl.value) {
      error.value = 'RPC URL not configured'
      return
    }
    loading.value = true
    error.value = null
    try {
      const connection = createConnection(rpcUrl.value)
      const all = await fetchAllEscrows(connection)
      const m = mints.value
      rawEscrows.value = all.filter((e) => {
        const dep = e.account.depositToken.toBase58()
        const req = e.account.requestToken.toBase58()
        const bothInScope = m.has(dep) && m.has(req)
        const notComplete = !isEffectivelyComplete(
          e.account.tokensDepositRemaining,
          e.account.decimals
        )
        return bothInScope && notComplete
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load escrows'
      rawEscrows.value = []
    } finally {
      loading.value = false
    }
  }

  return { escrows, byMint, loading, error, retry: load }
}
