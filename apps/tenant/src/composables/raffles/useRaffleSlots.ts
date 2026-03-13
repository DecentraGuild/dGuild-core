/**
 * Composable for raffle slots: fetch raffles, chain data, slot cards, slot limit.
 * Extracted from AdminRaffleTab.
 */
import type { Ref } from 'vue'
import { fetchRaffleChainData } from '@decentraguild/web3'
import type { RaffleChainData } from '@decentraguild/web3'
import type { Connection } from '@solana/web3.js'
import { sanitizeTokenLabel } from '@decentraguild/display'
import { useSupabase } from '~/composables/core/useSupabase'
import { useMintMetadata } from '~/composables/mint/useMintMetadata'

export interface RaffleItem {
  id: string
  rafflePubkey: string
  createdAt: string
  closedAt: string | null
}

export interface SlotCard {
  key: string
  raffle: RaffleItem | null
  chainData: RaffleChainData | null
}

export function useRaffleSlots(
  tenantId: Ref<string | undefined>,
  connection: Ref<Connection | null>,
  slotLimit: Ref<number>
) {
  const { fetchMetadata } = useMintMetadata()

  const raffles = ref<RaffleItem[]>([])
  const slotsLoading = ref(true)
  const chainDataByRaffle = ref<Record<string, RaffleChainData | null>>({})
  const mintMetadataByTicketMint = ref<Record<string, { symbol: string; name: string }>>({})

  const activeRaffles = computed(() => raffles.value.filter((r) => !r.closedAt))

  const slotCards = computed((): SlotCard[] => {
    const active = activeRaffles.value
    const limit = slotLimit.value
    const chain = chainDataByRaffle.value
    const cards: SlotCard[] = []
    for (let i = 0; i < limit; i++) {
      const r = i < active.length ? active[i] : null
      cards.push({
        key: r ? r.rafflePubkey : `empty-${i}`,
        raffle: r,
        chainData: r ? (chain[r.rafflePubkey] ?? null) : null,
      })
    }
    return cards
  })

  async function fetchChainDataForRaffles() {
    if (!connection.value) return
    const active = raffles.value.filter((r) => !r.closedAt)
    const next: Record<string, RaffleChainData | null> = {}
    for (const r of active) {
      try {
        const data = await fetchRaffleChainData(connection.value!, r.rafflePubkey)
        next[r.rafflePubkey] = data
      } catch {
        next[r.rafflePubkey] = null
      }
    }
    chainDataByRaffle.value = next
  }

  async function fetchRaffles() {
    const id = tenantId.value
    if (!id) return
    slotsLoading.value = true
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
        await fetchChainDataForRaffles()
      } else {
        raffles.value = []
      }
    } catch {
      raffles.value = []
    } finally {
      slotsLoading.value = false
    }
  }

  watch(
    chainDataByRaffle,
    async (chain) => {
      const mints = new Set<string>()
      for (const data of Object.values(chain)) {
        if (data?.ticketMint) mints.add(data.ticketMint)
      }
      const map = { ...mintMetadataByTicketMint.value }
      let changed = false
      for (const mint of mints) {
        if (map[mint]) continue
        const meta = await fetchMetadata(mint)
        if (meta) {
          map[mint] = {
            symbol: sanitizeTokenLabel(meta.symbol),
            name: sanitizeTokenLabel(meta.name),
          }
          changed = true
        }
      }
      if (changed) mintMetadataByTicketMint.value = { ...map }
    },
    { deep: true }
  )

  return {
    raffles,
    slotsLoading,
    slotCards,
    chainDataByRaffle,
    mintMetadataByTicketMint,
    activeRaffles,
    fetchRaffles,
    fetchChainDataForRaffles,
  }
}
