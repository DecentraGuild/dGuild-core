/**
 * Resolves mint addresses to display labels from tenant_mint_catalog and mint_metadata.
 * Used when marketplace_settings has only mint IDs (e.g. after sync from minimal config).
 * Batches requests to avoid URL length limits (e.g. 200+ mints in one .in() query).
 */
import { computed, ref, watch, type Ref } from 'vue'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'

const BATCH_SIZE = 50

function batch<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function useMintLabels(mints: Ref<Set<string>>) {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)
  const labelByMint = ref<Map<string, string>>(new Map())
  const loading = ref(false)

  watch(
    [mints, tenantId],
    async ([mintSet, id]: [Set<string>, string | null]) => {
      if (!id || !mintSet?.size) {
        labelByMint.value = new Map()
        return
      }
      loading.value = true
      try {
        const list = [...(mintSet ?? [])]
        const supabase = useSupabase()
        const batches = batch(list, BATCH_SIZE)

        const [catalogBatches, metaBatches] = await Promise.all([
          Promise.all(
            batches.map((chunk) =>
              supabase
                .from('tenant_mint_catalog')
                .select('mint, label')
                .eq('tenant_id', id)
                .in('mint', chunk)
            )
          ),
          Promise.all(
            batches.map((chunk) =>
              supabase
                .from('mint_metadata')
                .select('mint, name, symbol')
                .in('mint', chunk)
            )
          ),
        ])

        const catalogRows = catalogBatches.flatMap((r) => r.data ?? [])
        const metaRows = metaBatches.flatMap((r) => r.data ?? [])
        const map = new Map<string, string>()
        for (const m of list) {
          const catalog = catalogRows.find((r) => r.mint === m) as { label?: string | null } | undefined
          const meta = metaRows.find((r) => r.mint === m) as { name?: string | null; symbol?: string | null } | undefined
          const label = catalog?.label ?? meta?.name ?? meta?.symbol ?? null
          if (label) map.set(m, label)
        }
        labelByMint.value = map
      } finally {
        loading.value = false
      }
    },
    { immediate: true }
  )

  return { labelByMint, loading }
}
