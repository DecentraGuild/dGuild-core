import { truncateAddress, formatRawTokenAmount } from '@decentraguild/display'
import type { RaffleChainData } from '@decentraguild/web3'
import {
  fetchRaffleChainData,
  isRaffleVisibleToUsers,
  buildBuyTicketsTransaction,
  sendAndConfirmTransaction,
  getEscrowWalletFromConnector,
} from '@decentraguild/web3'
import { PublicKey } from '@solana/web3.js'
import { useMintLabels } from '~/composables/mint/useMintLabels'
import { useMintMetadata } from '~/composables/mint/useMintMetadata'
import { useMemberProfiles } from '~/composables/members/useMemberProfiles'
import { useSupabase } from '~/composables/core/useSupabase'
import type { Connection } from '@solana/web3.js'

const DEFAULT_MINT = PublicKey.default.toBase58()

interface RaffleItem {
  id: string
  rafflePubkey: string
  createdAt: string
  closedAt: string | null
}

interface RaffleWithChainData extends RaffleItem {
  chainData: RaffleChainData | null
}

export function useRafflePublic(
  tenantId: Ref<string | null | undefined>,
  connection: Ref<Connection | null>,
) {
  const raffles = ref<RaffleItem[]>([])
  const chainDataByRaffle = ref<Record<string, RaffleChainData | null>>({})
  const loading = ref(true)
  const selectedRaffle = ref<RaffleWithChainData | null>(null)
  const buyAmount = ref(1)
  const buySubmitting = ref(false)
  const buyTxStatus = ref<string | null>(null)
  const buyError = ref<string | null>(null)

  const visibleRaffles = computed((): RaffleWithChainData[] => {
    const active = raffles.value.filter((r) => !r.closedAt)
    const chain = chainDataByRaffle.value
    return active
      .map((r) => ({ ...r, chainData: chain[r.rafflePubkey] ?? null }))
      .filter((r) => {
        if (!r.chainData) return false
        return isRaffleVisibleToUsers(r.chainData.state)
      })
  })

  function prizeConfigured(d: RaffleChainData): boolean {
    return Boolean(d.prizeMint && d.prizeMint !== DEFAULT_MINT)
  }

  const mintsForCatalogLabels = computed(() => {
    const s = new Set<string>()
    for (const r of visibleRaffles.value) {
      const d = r.chainData
      if (!d) continue
      if (d.ticketMint) s.add(d.ticketMint)
      if (prizeConfigured(d)) s.add(d.prizeMint)
    }
    return s
  })

  const { labelByMint } = useMintLabels(mintsForCatalogLabels)
  const { fetchMetadata } = useMintMetadata()
  const { resolveWallet } = useMemberProfiles()
  const decimalsByMint = ref<Map<string, number>>(new Map())

  watch(
    mintsForCatalogLabels,
    async (mintSet: Set<string>) => {
      if (!mintSet?.size) return
      const map = new Map(decimalsByMint.value)
      for (const mint of mintSet) {
        if (map.has(mint)) continue
        const meta = await fetchMetadata(mint)
        if (meta != null) map.set(mint, meta.decimals)
      }
      decimalsByMint.value = map
    },
    { immediate: true },
  )

  function mintCatalogLabel(mint: string): string {
    const l = labelByMint.value.get(mint)?.trim()
    return l || truncateAddress(mint, 8, 4)
  }

  function mintCatalogLabelLong(mint: string): string {
    const l = labelByMint.value.get(mint)?.trim()
    return l || mint
  }

  function formatPrizeLine(d: RaffleChainData): string {
    const label = mintCatalogLabelLong(d.prizeMint)
    const decimals = decimalsByMint.value.get(d.prizeMint) ?? d.prizeDecimals
    const amt = formatRawTokenAmount(d.prizeAmount, decimals, 'SPL')
    if (amt === '0' || amt === '?') return label
    return `${amt} ${label}`
  }

  function formatTicketPrice(data: RaffleChainData): string {
    const dec = data.ticketDecimals
    const divisor = 10 ** dec
    const whole = Number(data.ticketPrice / BigInt(divisor))
    const frac = Number(data.ticketPrice % BigInt(divisor))
    const fracStr = frac === 0 ? '' : `.${String(frac).padStart(dec, '0').replace(/0+$/, '')}`
    return `${whole}${fracStr} ${mintCatalogLabel(data.ticketMint)}`
  }

  const canBuyTickets = computed(() => {
    const r = selectedRaffle.value
    if (!r?.chainData || r.chainData.state !== 'running') return false
    const wallet = getEscrowWalletFromConnector()
    return !!wallet?.publicKey
  })

  const availableTickets = computed(() => {
    const r = selectedRaffle.value?.chainData
    if (!r) return 0
    return Math.max(0, r.ticketsTotal - r.ticketsSold)
  })

  const canSubmitBuy = computed(() => {
    const n = buyAmount.value
    return Number.isInteger(n) && n >= 1 && n <= availableTickets.value
  })

  const formatTotalCost = computed(() => {
    const r = selectedRaffle.value?.chainData
    if (!r) return '0'
    const total = r.ticketPrice * BigInt(Math.max(0, buyAmount.value))
    const dec = r.ticketDecimals
    const divisor = 10 ** dec
    const whole = Number(total / BigInt(divisor))
    const frac = Number(total % BigInt(divisor))
    const fracStr = frac === 0 ? '' : `.${String(frac).padStart(dec, '0').replace(/0+$/, '')}`
    return `${whole}${fracStr} ${mintCatalogLabel(r.ticketMint)}`
  })

  function selectRaffle(r: RaffleWithChainData) {
    selectedRaffle.value = selectedRaffle.value?.rafflePubkey === r.rafflePubkey ? null : r
    buyAmount.value = 1
    buyError.value = null
    buyTxStatus.value = null
  }

  async function fetchChainData() {
    if (!connection.value) return
    const active = raffles.value.filter((r) => !r.closedAt)
    const next: Record<string, RaffleChainData | null> = {}
    for (const r of active) {
      try {
        const data = await fetchRaffleChainData(connection.value!, r.rafflePubkey)
        next[r.rafflePubkey] = data ?? null
      } catch { next[r.rafflePubkey] = null }
    }
    chainDataByRaffle.value = next
  }

  async function loadRaffles() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    try {
      const supabase = useSupabase()
      const { data, error } = await supabase
        .from('tenant_raffles')
        .select('id, raffle_pubkey, created_at, closed_at')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false })

      if (!error && data) {
        raffles.value = data.map((r) => ({
          id: r.id as string,
          rafflePubkey: r.raffle_pubkey as string,
          createdAt: r.created_at as string,
          closedAt: r.closed_at as string | null,
        }))
        await fetchChainData()
      } else { raffles.value = [] }
    } catch { raffles.value = [] }
    finally { loading.value = false }
  }

  async function onBuyTickets() {
    const r = selectedRaffle.value
    const conn = connection.value
    const wallet = getEscrowWalletFromConnector()
    if (!r?.chainData || !conn || !wallet?.publicKey || r.chainData.state !== 'running') return
    if (!canSubmitBuy.value) return

    buySubmitting.value = true; buyError.value = null; buyTxStatus.value = null
    try {
      const amount = Math.floor(buyAmount.value)
      const fresh = await fetchRaffleChainData(conn, r.rafflePubkey)
      if (!fresh || fresh.state !== 'running') { buyError.value = 'Raffle is no longer available'; return }
      const available = fresh.ticketsTotal - fresh.ticketsSold
      if (amount > available) { buyError.value = `Only ${available} ticket(s) left. Please reduce your amount.`; return }

      const tx = await buildBuyTicketsTransaction({
        rafflePubkey: r.rafflePubkey,
        ticketAmount: amount,
        chainData: { ticketMint: fresh.ticketMint, useWhitelist: fresh.useWhitelist, whitelist: fresh.whitelist },
        connection: conn,
        wallet,
      })
      const TX_LABELS: Record<string, string> = { signing: 'Signing...', sending: 'Sending...', confirming: 'Confirming...' }
      await sendAndConfirmTransaction(conn, tx, wallet, wallet.publicKey, {
        onStatus: (s) => { buyTxStatus.value = TX_LABELS[s] ?? s },
      })
      buyTxStatus.value = 'Success'; buyError.value = null
      await fetchChainData()
      selectedRaffle.value = visibleRaffles.value.find((x) => x.rafflePubkey === r.rafflePubkey) ?? null
    } catch (e) {
      buyError.value = e instanceof Error ? e.message : 'Transaction failed'
    } finally { buySubmitting.value = false; buyTxStatus.value = null }
  }

  onMounted(() => { loadRaffles() })

  return {
    raffles, loading, selectedRaffle, buyAmount, buySubmitting, buyTxStatus, buyError,
    visibleRaffles, canBuyTickets, availableTickets, canSubmitBuy, formatTotalCost,
    prizeConfigured, mintCatalogLabel, mintCatalogLabelLong, formatPrizeLine, formatTicketPrice,
    selectRaffle, onBuyTickets,
    resolveWallet,
  }
}
