<template>
  <div class="admin__panel">
    <h3>Conditions</h3>
    <p class="conditions-tab__hint">
      Create and manage condition rules. Use them for Discord roles or shipment lists.
    </p>

    <ConditionCatalogShell mint-hint="Mints come from Address Book. Enable Holders, Snapshot, or Transactions in Admin &gt; Watchtower.">
      <template #mint-catalog>
        <AdminMintCatalog
          :mints="catalogItems"
          :loading="catalogMintsLoading"
          readonly
          item-extra-when-readonly
          @inspect="onInspect"
        >
          <template #item-extra="{ item }">
            <TrackIndicators
              :track-holders="item.track_holders"
              :track-snapshot="item.track_snapshot"
              :track-transactions="item.track_transactions"
            />
          </template>
        </AdminMintCatalog>
      </template>
      <template #rules-catalog>
        <ConditionSetCatalog
          :items="rulesCatalogFilteredItems"
          :loading="rulesCatalogLoading"
          :error="rulesCatalogError"
          :filter="rulesCatalogFilter"
          :show-filter="true"
          :active-id="null"
          @select="() => {}"
          @edit="(item) => openEditor(item.id)"
          @delete="(item) => deleteConditionSet(item.id)"
          @create="openEditor(null)"
          @update:filter="setRulesCatalogFilter"
        />
      </template>
    </ConditionCatalogShell>

    <ConditionSetEditor
      v-model:open="editorOpen"
      :catalog-mints="catalogMints"
      :gate-lists="gateLists"
      :guild-roles="guildRoles"
      :guild-roles-all="guildRolesAll"
      :guild-id="discordGuildId"
      :initial-set-id="editingSetId"
      @saved="fetchRulesCatalog"
    />
    <MintDetailModal v-model="showModal" :mint="selectedMint" />
  </div>
</template>

<script setup lang="ts">
import AdminMintCatalog from '~/components/admin/AdminMintCatalog.vue'
import TrackIndicators from '~/components/mint/TrackIndicators.vue'
import ConditionCatalogShell from '~/components/gates/ConditionCatalogShell.vue'
import ConditionSetCatalog from '~/components/gates/ConditionSetCatalog.vue'
import ConditionSetEditor from '~/components/gates/ConditionSetEditor.vue'
import MintDetailModal from '~/components/mint/MintDetailModal/index.vue'
import { useSupabase } from '~/composables/core/useSupabase'
import { useConditionSet } from '~/composables/conditions/useConditionSet'
import { useTenantStore } from '~/stores/tenant'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import { useConditionSetCatalog } from '~/composables/conditions/useConditionSetCatalog'
import type { CatalogMint, CatalogMintItem } from '~/types/mints'

defineProps<{ slug: string }>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)

const catalog = useTenantCatalog()
const catalogMints = ref<CatalogMint[]>([])
const catalogMintsRef = computed(() => catalogMints.value)
const catalogMintsLoading = ref(false)
const showModal = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)

const editorOpen = ref(false)
const editingSetId = ref<number | null>(null)
const guildRoles = ref<Array<{ role_id: string; name: string }> | undefined>(undefined)
const guildRolesAll = ref<Array<{ role_id: string; name: string }> | undefined>(undefined)
const discordGuildId = ref<string | null>(null)

const { gateLists, fetchGateLists } = useConditionSet(catalogMintsRef)

const {
  filteredItems: rulesCatalogFilteredItems,
  filter: rulesCatalogFilter,
  setFilter: setRulesCatalogFilter,
  loading: rulesCatalogLoading,
  error: rulesCatalogError,
  fetchCatalog: fetchRulesCatalog,
  deleteConditionSet,
} = useConditionSetCatalog({
  catalogMints: catalogMintsRef,
  gateLists,
})

const catalogItems = computed<CatalogMintItem[]>(() =>
  catalogMints.value.map((m) => ({
    id: m.id,
    mint: m.asset_id,
    kind: m.kind,
    label: m.label,
    symbol: m.symbol,
    image: m.image,
    decimals: m.decimals,
    traitKeys: m.trait_keys,
    traitTypes: m.trait_keys,
    track_holders: m.track_holders ?? false,
    track_snapshot: m.track_snapshot ?? false,
    track_transactions: m.track_transactions ?? false,
  }))
)

async function fetchDiscordServer() {
  const id = tenantId.value
  if (!id) return
  const supabase = useSupabase()
  const { data: srv } = await supabase
    .from('discord_servers')
    .select('discord_guild_id, bot_role_position')
    .eq('tenant_id', id)
    .maybeSingle()
  if (srv?.discord_guild_id) {
    discordGuildId.value = srv.discord_guild_id as string
    const botPos = srv.bot_role_position as number | null | undefined
    const { data: roles } = await supabase
      .from('discord_guild_roles')
      .select('role_id, name, position')
      .eq('discord_guild_id', srv.discord_guild_id)
      .order('position')
    const all = (roles ?? []).map((r) => ({
      role_id: r.role_id as string,
      name: (r.name as string) ?? '',
    }))
    guildRolesAll.value = all
    const assignable = (roles ?? []).filter((r) => {
      const pos = (r.position as number) ?? 0
      return botPos == null || pos < botPos
    })
    guildRoles.value = assignable.map((r) => ({
      role_id: r.role_id as string,
      name: (r.name as string) ?? '',
    }))
  } else {
    discordGuildId.value = null
    guildRoles.value = undefined
    guildRolesAll.value = undefined
  }
}

async function fetchCatalog() {
  catalogMintsLoading.value = true
  try {
    const entries = await catalog.listDiscord()
    catalogMints.value = entries.map((r) => ({
      id: r.id,
      asset_id: r.mint,
      kind: r.kind,
      label: (r.label ?? r.name ?? r.mint) ?? '',
      symbol: null,
      image: r.image,
      decimals: (r as { decimals?: number | null }).decimals ?? null,
      trait_keys: (r.trait_index as { trait_keys?: string[] } | null)?.trait_keys ?? [],
      trait_options: (r.trait_index as { trait_options?: Record<string, string[]> } | null)?.trait_options ?? {},
      track_holders: (r as { track_holders?: boolean }).track_holders ?? false,
      track_snapshot: (r as { track_snapshot?: boolean }).track_snapshot ?? false,
      track_transactions: (r as { track_transactions?: boolean }).track_transactions ?? false,
    }))
  } catch {
    catalogMints.value = []
  } finally {
    catalogMintsLoading.value = false
  }
}

function openEditor(setId: number | null) {
  editingSetId.value = setId
  editorOpen.value = true
}

function onInspect(item: CatalogMintItem) {
  selectedMint.value = item
  showModal.value = true
}

const route = useRoute()

watch(
  tenantId,
  async (id) => {
    if (id) {
      await fetchGateLists()
      await fetchCatalog()
      await fetchDiscordServer()
      await fetchRulesCatalog()
    }
  },
  { immediate: true }
)

watch(
  () => route.query.edit,
  (editId) => {
    const id = editId ? parseInt(editId, 10) : NaN
    if (Number.isFinite(id) && id > 0) {
      openEditor(id)
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.conditions-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-md);
  line-height: 1.5;
}
</style>
