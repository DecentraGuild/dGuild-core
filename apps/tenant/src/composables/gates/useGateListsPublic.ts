/**
 * Fetches gate lists for a tenant.
 * - source 'db': Direct Supabase read (admin) — no Edge Function.
 * - source 'edge': Gates Edge Function (public/member-facing).
 */
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { useTenantStore } from '~/stores/tenant'
import { useSupabase } from '~/composables/core/useSupabase'

export interface GateListPublic {
  address: string
  name: string
  imageUrl?: string | null
}

export function useGateLists(opts: {
  slug: Ref<string | null>
  source?: Ref<'edge' | 'db'> | (() => 'edge' | 'db')
}) {
  const tenantId = computed(() => useTenantStore().tenantId)
  const source = typeof opts.source === 'function'
    ? computed(opts.source)
    : (opts.source ?? ref<'edge' | 'db'>('edge'))
  const lists = ref<GateListPublic[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLists() {
    const id = tenantId.value
    if (!id) {
      lists.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      if (source.value === 'db') {
        const { data, error: qError } = await supabase
          .from('gate_lists')
          .select('address, name, image_url')
          .eq('tenant_id', id)
        if (qError) throw qError
        lists.value = (data ?? []).map((row) => ({
          address: row.address as string,
          name: (row.name as string) ?? '',
          imageUrl: (row.image_url as string | null) ?? null,
        }))
      } else {
        const { data, error: fnError } = await supabase.functions.invoke('gates', {
          body: { action: 'lists-public', tenantId: id },
        })
        if (fnError) throw fnError
        lists.value = (data as { lists: GateListPublic[] }).lists ?? []
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load lists'
      lists.value = []
    } finally {
      loading.value = false
    }
  }

  watch([tenantId, source], () => fetchLists(), { immediate: true })

  return { lists, loading, error, refetch: fetchLists }
}

/** @deprecated Use useGateLists with source: 'edge' */
export function useGateListsPublic(slug: Ref<string | null>) {
  return useGateLists({ slug, source: () => 'edge' })
}
