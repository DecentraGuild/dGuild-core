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

    <div v-if="server.connected && !loading" class="discord-settings__role-reference">
      <div class="discord-settings__role-col">
        <h4 class="discord-settings__role-heading">Roles the bot can assign</h4>
        <p class="discord-settings__role-hint">
          Roles below the bot’s highest role. Used when you assign a rule to a role.
        </p>
        <ul v-if="guildRoles.length" class="discord-settings__role-ul">
          <li v-for="r in guildRoles" :key="r.role_id">{{ r.name || r.role_id }}</li>
        </ul>
        <p v-else class="discord-settings__role-empty">None (raise the bot’s role or wait for sync).</p>
      </div>
      <div class="discord-settings__role-col">
        <h4 class="discord-settings__role-heading">All server roles</h4>
        <p class="discord-settings__role-hint">
          Every role cached from Discord. The “Discord” condition type can require any of these.
        </p>
        <ul v-if="guildRolesAll.length" class="discord-settings__role-ul">
          <li v-for="r in guildRolesAll" :key="r.role_id">{{ r.name || r.role_id }}</li>
        </ul>
        <p v-else class="discord-settings__role-empty">No roles synced yet.</p>
      </div>
    </div>

    <div v-if="server.connected && !loading" class="discord-settings__cards">
      <DiscordRoleCardsCarousel
        :role-cards="roleCards"
        admin
        @edit="onEditCard"
        @delete="onDeleteCard"
        @create="openQuickAssignModal"
      />
    </div>

    <SimpleModal
      :model-value="quickAssignOpen"
      title="Assign rule to role"
      @update:model-value="(v: boolean) => (quickAssignOpen = v)"
    >
      <div class="discord-quick-assign">
        <ConditionSetCatalog
          :items="rulesCatalogItems"
          :loading="rulesCatalogLoading"
          :error="rulesCatalogError"
          :filter="'all'"
          :show-filter="false"
          :filter-unassigned="true"
          :hide-create-button="true"
          :hide-delete-button="true"
          :active-id="quickAssignSetId ?? undefined"
          @select="(item) => (quickAssignSetId = item.id)"
          @edit="(item) => goToConditionsEdit(item.id)"
          @delete="() => {}"
          @create="goToConditions"
        />
        <div v-if="quickAssignSetId" class="discord-quick-assign__form">
          <OptionsSelect
            v-model="quickAssignRoleId"
            :options="guildRoleOptions"
            label="Role to assign"
            placeholder="Select role"
          />
          <FormInput
            v-if="selectedRuleForAssign?.ruleType === 'weighted'"
            v-model="quickAssignMinPercent"
            type="number"
            label="Min %"
            placeholder="0"
            min="0"
            max="100"
          />
          <Button
            variant="default"
            :disabled="!quickAssignRoleId || assigning"
            @click="onQuickAssignSave"
          >
            <Icon v-if="assigning" icon="lucide:loader-2" class="discord-quick-assign__spinner" />
            Assign
          </Button>
        </div>
        <p class="discord-quick-assign__link">
          <NuxtLink :to="{ path: '/admin', query: { ...route.query, tab: 'conditions' } }" @click="quickAssignOpen = false">
            Create new condition set
          </NuxtLink>
        </p>
      </div>
    </SimpleModal>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import AdminDiscordServerCard from '~/components/AdminDiscordServerCard.vue'
import ConditionSetCatalog from '~/components/gates/ConditionSetCatalog.vue'
import DiscordRoleCardsCarousel from '~/components/DiscordRoleCardsCarousel.vue'
import type { RoleCard } from '~/components/DiscordRoleCardsCarousel.vue'
import { useSupabase } from '~/composables/core/useSupabase'
import { useConditionSet } from '~/composables/conditions/useConditionSet'
import { useTenantStore } from '~/stores/tenant'
import { useTenantCatalog } from '~/composables/watchtower/useTenantCatalog'
import { useConditionSetCatalog } from '~/composables/conditions/useConditionSetCatalog'
import type { CatalogMint } from '~/types/mints'

defineProps<{ slug: string }>()

const route = useRoute()
const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)

const catalog = useTenantCatalog()
const loading = ref(true)
const catalogMints = ref<CatalogMint[]>([])
const catalogMintsRef = computed(() => catalogMints.value)
const { gateLists, fetchGateLists } = useConditionSet(catalogMintsRef)

async function fetchCatalog() {
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
  }
}

const {
  items: rulesCatalogItems,
  loading: rulesCatalogLoading,
  error: rulesCatalogError,
  fetchCatalog: fetchRulesCatalog,
} = useConditionSetCatalog({
  catalogMints: catalogMintsRef,
  gateLists,
})

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

const roleCards = ref<RoleCard[]>([])
const guildRoles = ref<Array<{ role_id: string; name: string }>>([])
const guildRolesAll = ref<Array<{ role_id: string; name: string }>>([])

const quickAssignOpen = ref(false)
const quickAssignSetId = ref<number | null>(null)
const quickAssignRoleId = ref('')
const quickAssignMinPercent = ref('')
const assigning = ref(false)

const assignedRoleIds = computed(() => new Set(roleCards.value.map((c) => c.role_id)))

const guildRoleOptions = computed(() =>
  guildRoles.value
    .filter((r) => !assignedRoleIds.value.has(r.role_id))
    .map((r) => ({ value: r.role_id, label: r.name }))
)

const selectedRuleForAssign = computed(() =>
  rulesCatalogItems.value.find((r) => r.id === quickAssignSetId.value)
)

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
  const rows = data ?? []
  guildRolesAll.value = rows.map((r) => ({
    role_id: r.role_id as string,
    name: (r.name as string) ?? '',
  }))
  const botPos = server.value.bot_role_position
  const assignable = rows.filter((r) => {
    const pos = (r.position as number) ?? 0
    return botPos == null || pos < botPos
  })
  guildRoles.value = assignable.map((r) => ({
    role_id: r.role_id as string,
    name: (r.name as string) ?? '',
  }))
}

async function fetchRoleCards() {
  const id = tenantId.value
  if (!id) return
  try {
    const supabase = useSupabase()
    const { data } = await supabase.functions.invoke('discord-server', {
      body: { action: 'role-cards', tenantId: id, includeAdminFields: true },
    })
    roleCards.value = (data as { cards?: RoleCard[] }).cards ?? []
  } catch {
    roleCards.value = []
  }
}

async function load() {
  loading.value = true
  linkError.value = null
  try {
    await Promise.all([fetchInviteUrl(), fetchServer()])
    if (server.value.connected) {
      await Promise.all([fetchCatalog(), fetchGuildRoles(), fetchGateLists(), fetchRoleCards(), fetchRulesCatalog()])
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
    await tenantStore.refetchTenantContext()

    await Promise.all([fetchCatalog(), fetchGuildRoles(), fetchGateLists(), fetchRoleCards(), fetchRulesCatalog()])
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
    roleCards.value = []
    guildRoles.value = []
    guildRolesAll.value = []
  } finally {
    disconnecting.value = false
  }
}

function onEditCard(card: RoleCard) {
  const setId = card.condition_set_id
  if (setId != null) {
    navigateTo({ path: '/admin', query: { ...route.query, tab: 'conditions', edit: String(setId) } })
  }
}

async function onDeleteCard(card: RoleCard) {
  const ruleId = card.rule_id
  if (ruleId == null) return
  if (!confirm('Remove this role rule?')) return
  const supabase = useSupabase()
  await supabase.from('discord_role_rules').delete().eq('id', ruleId)
  await fetchRoleCards()
}

function openQuickAssignModal() {
  quickAssignSetId.value = null
  quickAssignRoleId.value = ''
  quickAssignMinPercent.value = ''
  quickAssignOpen.value = true
}

function goToConditions() {
  quickAssignOpen.value = false
  navigateTo({ path: route.path, query: { ...route.query, tab: 'conditions' } })
}

function goToConditionsEdit(setId: number) {
  quickAssignOpen.value = false
  navigateTo({ path: route.path, query: { ...route.query, tab: 'conditions', edit: String(setId) } })
}

async function onQuickAssignSave() {
  const setId = quickAssignSetId.value
  const roleId = quickAssignRoleId.value?.trim()
  const guildId = server.value.discord_guild_id
  if (!setId || !roleId || !guildId) return

  assigning.value = true
  try {
    const supabase = useSupabase()
    const { error } = await supabase.from('discord_role_rules').insert({
      discord_guild_id: guildId,
      discord_role_id: roleId,
      condition_set_id: setId,
    })
    if (error) throw new Error(error.message)

    const minPercent = Math.max(0, Math.min(100, Math.floor(Number(quickAssignMinPercent.value) || 0)))
    if (minPercent > 0 && selectedRuleForAssign.value?.ruleType === 'weighted') {
      const { data: conditions } = await supabase
        .from('condition_set_conditions')
        .select('id, payload')
        .eq('condition_set_id', setId)
        .eq('type', 'TIME_WEIGHTED')
      const tw = (conditions ?? [])[0]
      if (tw) {
        const payload = (tw.payload as Record<string, unknown>) ?? {}
        await supabase
          .from('condition_set_conditions')
          .update({ payload: { ...payload, min_percent: minPercent } })
          .eq('id', tw.id)
      }
    }

    quickAssignOpen.value = false
    await fetchRoleCards()
    await fetchRulesCatalog()
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to assign')
  } finally {
    assigning.value = false
  }
}

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
  gap: var(--theme-space-lg);
}

.discord-settings__role-reference {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--theme-space-lg);
  padding: var(--theme-space-md);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

@media (min-width: 640px) {
  .discord-settings__role-reference {
    grid-template-columns: 1fr 1fr;
  }
}

.discord-settings__role-heading {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  font-weight: 600;
}

.discord-settings__role-hint {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  line-height: 1.45;
}

.discord-settings__role-ul {
  margin: 0;
  padding-left: 1.25rem;
  max-height: 12rem;
  overflow-y: auto;
  font-size: var(--theme-font-sm);
  line-height: 1.5;
}

.discord-settings__role-empty {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.discord-settings__cards {
  margin-top: var(--theme-space-md);
}

.discord-quick-assign {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
  min-width: 20rem;
}

.discord-quick-assign__form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.discord-quick-assign__link {
  margin: 0;
  font-size: var(--theme-font-sm);
}

.discord-quick-assign__link a {
  color: var(--theme-primary);
  text-decoration: none;
}

.discord-quick-assign__link a:hover {
  text-decoration: underline;
}

.discord-quick-assign__spinner {
  animation: discord-spin 1s linear infinite;
}

@keyframes discord-spin {
  to { transform: rotate(360deg); }
}
</style>
