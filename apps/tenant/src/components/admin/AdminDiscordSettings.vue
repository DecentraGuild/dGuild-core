<template>
  <div class="discord-settings">
    <AdminDiscordServerCard
      v-model:guild-id-input="guildIdInput"
      :slug="slug"
      :loading="loading"
      :server="server"
      :invite-url="inviteUrl"
      :link-error="linkError"
      :linking="linking"
      :disconnecting="disconnecting"
      @link="onLink"
      @disconnect="disconnect"
    />
    <ConditionCatalogShell
      v-if="server.connected && !loading"
      mint-hint="Mints come from Address Book. Enable Holders, Snapshot, or Transactions in Admin &gt; Watchtower."
    >
      <template #mint-catalog>
        <AdminMintCatalog
          :mints="discordCatalogItems"
          :loading="catalogMintsLoading"
          readonly
          item-extra-when-readonly
          @inspect="onInspectMint"
        >
          <template #item-extra="{ item }">
            <div v-if="item.track_discord || item.track_snapshot || item.track_transactions" class="discord-settings__badges">
              <span v-if="item.track_discord" class="discord-settings__badge">Holders</span>
              <span v-if="item.track_snapshot" class="discord-settings__badge">Snapshot</span>
              <span v-if="item.track_transactions" class="discord-settings__badge">Transactions</span>
            </div>
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
      :guild-id="server.connected ? server.discord_guild_id : null"
      :initial-set-id="editingSetId"
      @saved="fetchRulesCatalog"
    />
    <MintDetailModal v-model="showMintModal" :mint="selectedMint" />
  </div>
</template>

<script setup lang="ts">
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import { useConditionSet } from '~/composables/conditions/useConditionSet'
import { useConditionSetCatalog } from '~/composables/conditions/useConditionSetCatalog'
import AdminDiscordServerCard from '~/components/AdminDiscordServerCard.vue'
import AdminMintCatalog from '~/components/admin/AdminMintCatalog.vue'
import ConditionCatalogShell from '~/components/gates/ConditionCatalogShell.vue'
import ConditionSetCatalog from '~/components/gates/ConditionSetCatalog.vue'
import ConditionSetEditor from '~/components/gates/ConditionSetEditor.vue'
import type { CatalogMint, CatalogMintItem } from '~/types/mints'
import MintDetailModal from '~/components/mint/MintDetailModal/index.vue'

defineProps<{
  slug: string
}>()

const loading = ref(true)
const catalogMints = ref<CatalogMint[]>([])
const catalogMintsRef = computed(() => catalogMints.value)
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

const tenantId = computed(() => useTenantStore().tenantId)

const editorOpen = ref(false)
const editingSetId = ref<number | null>(null)
const guildRoles = ref<Array<{ role_id: string; name: string }>>([])
const guildRolesAll = ref<Array<{ role_id: string; name: string }>>([])
const catalogMintsLoading = ref(false)
const inviteUrl = ref<string | null>(null)
const server = ref<{
  connected: boolean
  discord_guild_id?: string
  guild_name?: string | null
  connected_at?: string
  bot_role_position?: number | null
}>({ connected: false })
const guildIdInput = ref('')
const linking = ref(false)
const disconnecting = ref(false)
const linkError = ref<string | null>(null)

async function fetchInviteUrl() {
  const id = tenantId.value
  if (!id) return
  const supabase = useSupabase()
  const { data } = await supabase.functions.invoke('discord-server', {
    body: { action: 'invite-url', tenantId: id },
  })
  inviteUrl.value = (data as { url?: string | null })?.url ?? null
}

async function fetchServer() {
  const id = tenantId.value
  if (!id) return
  const supabase = useSupabase()
  const { data } = await supabase.functions.invoke('discord-server', {
    body: { action: 'get', tenantId: id },
  })
  const srv = (data as { server?: Record<string, unknown> | null })?.server
  server.value = srv
    ? {
        connected: true,
        discord_guild_id: srv.discord_guild_id as string,
        guild_name: srv.guild_name as string | null,
        connected_at: srv.connected_at as string,
        bot_role_position: srv.bot_role_position as number | null | undefined,
      }
    : { connected: false }
}

const catalog = useTenantCatalog()

async function fetchGuildRoles() {
  const guildId = server.value.discord_guild_id
  if (!guildId) {
    guildRoles.value = []
    guildRolesAll.value = []
    return
  }
  const supabase = useSupabase()
  const { data } = await supabase
    .from('discord_guild_roles')
    .select('role_id, name, position')
    .eq('discord_guild_id', guildId)
    .order('position')
  const all = (data ?? []).map((r) => ({
    role_id: r.role_id as string,
    name: (r.name as string) ?? '',
  }))
  guildRolesAll.value = all
  const botPos = server.value.bot_role_position
  const assignable = (data ?? []).filter((r) => {
    const pos = (r.position as number) ?? 0
    return botPos == null || pos < botPos
  })
  guildRoles.value = assignable.map((r) => ({
    role_id: r.role_id as string,
    name: (r.name as string) ?? '',
  }))
}

async function fetchMints() {
  if (!server.value.connected) return
  const id = tenantId.value
  if (!id) return
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
      track_discord: (r as { track_discord?: boolean }).track_discord ?? false,
      track_snapshot: (r as { track_snapshot?: boolean }).track_snapshot ?? false,
      track_transactions: (r as { track_transactions?: boolean }).track_transactions ?? false,
    }))
  } catch {
    catalogMints.value = []
  } finally {
    catalogMintsLoading.value = false
  }
}

async function load() {
  loading.value = true
  linkError.value = null
  try {
    await Promise.all([fetchInviteUrl(), fetchServer()])
    if (server.value.connected) {
      await Promise.all([fetchMints(), fetchGuildRoles(), fetchGateLists()])
    }
  } finally {
    loading.value = false
  }
}

async function onLink(payload: { guildId: string }) {
  const guildId = payload.guildId
  const id = tenantId.value
  if (!guildId || !id) return
  linking.value = true
  linkError.value = null
  try {
    const supabase = useSupabase()
    const { error } = await supabase.functions.invoke('discord-server', {
      body: { action: 'link', tenantId: id, guildId },
    })
    if (error) {
      linkError.value = error.message ?? 'Failed to link server'
      return
    }
    guildIdInput.value = ''
    await fetchServer()
    await Promise.all([fetchMints(), fetchGuildRoles(), fetchGateLists()])
  } finally {
    linking.value = false
  }
}

async function disconnect() {
  const id = tenantId.value
  if (!id) return
  disconnecting.value = true
  try {
    const supabase = useSupabase()
    await supabase.functions.invoke('discord-server', {
      body: { action: 'unlink', tenantId: id },
    })
    server.value = { connected: false }
  } finally {
    disconnecting.value = false
  }
}

const emit = defineEmits<{ 'conditions-changed': [conditions: { holders_current: number }] }>()

const discordCatalogItems = computed<CatalogMintItem[]>(() =>
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
    track_discord: m.track_discord ?? false,
    track_snapshot: m.track_snapshot ?? false,
    track_transactions: m.track_transactions ?? false,
  }))
)

const showMintModal = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)

function onInspectMint(item: CatalogMintItem) {
  selectedMint.value = item
  showMintModal.value = true
}

function openEditor(setId: number | null) {
  editingSetId.value = setId
  editorOpen.value = true
}

watch(catalogMints, (mints) => {
  emit('conditions-changed', { holders_current: mints.length })
}, { immediate: true })

watch(
  () => tenantId.value,
  async (id) => {
    if (id) {
      await fetchGateLists()
      void fetchRulesCatalog()
    }
  },
  { immediate: true }
)

onMounted(() => {
  load()
})
</script>

<style scoped>
.discord-settings {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.discord-settings__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
  align-items: center;
}

.discord-settings__badge {
  font-size: var(--theme-font-xs);
  padding: 2px 6px;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
}
</style>
