<template>
  <div class="admin__panel">
    <h3>Shipment List</h3>
    <p class="shipment-list-tab__hint">
      Select a rule from the catalog, then generate JSON. <strong>Holding</strong> uses current holders. <strong>Period</strong> and <strong>Snapshots</strong> use snapshots (requires Snapshot in Watchtower).
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
            <div v-if="item.track_discord || item.track_snapshot || item.track_transactions" class="shipment-list-tab__badges">
              <span v-if="item.track_discord" class="shipment-list-tab__badge">Holders</span>
              <span v-if="item.track_snapshot" class="shipment-list-tab__badge">Snapshot</span>
              <span v-if="item.track_transactions" class="shipment-list-tab__badge">Transactions</span>
            </div>
          </template>
        </AdminMintCatalog>
      </template>
      <template #rules-catalog>
        <ConditionSetCatalog
          :items="rulesCatalogFilteredItems"
          :loading="rulesCatalogLoading"
          :error="rulesCatalogError"
          :active-id="conditionSetId"
          :filter="rulesCatalogFilter"
          :show-filter="true"
          @select="onLoadRule"
          @edit="(item) => openEditor(item.id)"
          @delete="onDeleteRule"
          @create="openEditor(null)"
          @update:filter="setRulesCatalogFilter"
        />
      </template>
    </ConditionCatalogShell>

    <div class="shipment-list-tab__generate">
      <h4>Generate JSON</h4>
      <p class="shipment-list-tab__generate-hint">
        Select a rule above, then set amount and mint.
      </p>
      <div v-if="isWeightedRule" class="shipment-list-tab__row">
        <label class="shipment-list-tab__label">Total amount to drop</label>
        <FormInput v-model="totalAmountStr" type="number" placeholder="e.g. 10000" min="0" />
      </div>
      <div v-else class="shipment-list-tab__row">
        <label class="shipment-list-tab__label">Fixed amount (per recipient)</label>
        <FormInput v-model="fixedAmountStr" type="number" placeholder="e.g. 100" min="0" />
      </div>
      <div class="shipment-list-tab__row">
        <label class="shipment-list-tab__label">Token mint (to airdrop)</label>
        <div class="shipment-list-tab__mint-row">
          <FormInput v-model="mint" placeholder="SPL token mint address" class="shipment-list-tab__mint-input" />
          <AddressBookBrowser kind="SPL" @select="(m) => (mint = m)" />
        </div>
      </div>
      <Button
        variant="default"
        :disabled="!canGenerate || generating"
        @click="generateJson"
      >
        <Icon v-if="generating" icon="lucide:loader-2" class="shipment-list-tab__spinner" />
        Generate JSON
      </Button>
      <p v-if="selectedRuleHasDiscordCondition" class="shipment-list-tab__discord-hint">
        DISCORD conditions use member roles from the last bot sync. Ensure the linked Discord server has been synced recently.
      </p>
    </div>

    <div v-if="generateError" class="shipment-list-tab__error">{{ generateError }}</div>

    <div v-if="generatedJson" class="shipment-list-tab__output">
      <h4>Generated list</h4>
      <p class="shipment-list-tab__meta">
        {{ generatedJson.recipients.length }} recipients, total {{ totalAmount }} tokens
      </p>
      <div class="shipment-list-tab__json-actions">
        <Button variant="secondary" size="sm" @click="copyJson">Copy</Button>
        <Button variant="secondary" size="sm" @click="downloadJson">Download</Button>
        <Button variant="secondary" size="sm" @click="useInPlanShipment">Use in Plan Shipment</Button>
      </div>
      <pre class="shipment-list-tab__pre">{{ jsonPreview }}</pre>
    </div>

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
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import AddressBookBrowser from '~/components/shared/AddressBookBrowser.vue'
import AdminMintCatalog from '~/components/admin/AdminMintCatalog.vue'
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
import type { ConditionSetItem } from '~/composables/conditions/useConditionSetCatalog'

const SHIPMENT_JSON_KEY = 'shipment-list-json'

defineProps<{ slug: string }>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)

const catalog = useTenantCatalog()
const catalogMints = ref<CatalogMint[]>([])
const catalogMintsRef = computed(() => catalogMints.value)
const catalogMintsLoading = ref(false)
const showModal = ref(false)
const selectedMint = ref<CatalogMintItem | null>(null)

const conditionSetId = ref<number | null>(null)
const editorOpen = ref(false)
const editingSetId = ref<number | null>(null)
const guildRoles = ref<Array<{ role_id: string; name: string }>>([])
const guildRolesAll = ref<Array<{ role_id: string; name: string }>>([])
const discordGuildId = ref<string | null>(null)

const { gateLists, fetchGateLists } = useConditionSet(catalogMintsRef)

const {
  items: rulesCatalogItems,
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

const selectedRule = computed(() =>
  rulesCatalogItems.value.find((r) => r.id === conditionSetId.value)
)
const isWeightedRule = computed(() => selectedRule.value?.ruleType === 'weighted')
const selectedRuleHasDiscordCondition = computed(
  () => (selectedRule.value?.conditionSummary?.includes('Discord') ?? false)
)

const fixedAmountStr = ref('100')
const totalAmountStr = ref('10000')
const mint = ref('')
const generating = ref(false)
const generateError = ref<string | null>(null)
const generatedJson = ref<{
  mint: string
  recipients: Array<{ address: string; amount: number }>
  totalAmount?: number
} | null>(null)

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
    track_discord: m.track_discord ?? false,
    track_snapshot: m.track_snapshot ?? false,
    track_transactions: m.track_transactions ?? false,
  }))
)

const fixedAmount = computed(() => {
  const n = Number.parseInt(fixedAmountStr.value, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
})

const totalAmountForGenerate = computed(() => {
  const n = Number.parseInt(totalAmountStr.value, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
})

const canGenerate = computed(() => {
  const amountOk = isWeightedRule.value ? totalAmountForGenerate.value >= 0 : fixedAmount.value >= 0
  return !!(
    tenantId.value &&
    conditionSetId.value != null &&
    conditionSetId.value > 0 &&
    mint.value.trim().length >= 32 &&
    amountOk
  )
})

const totalAmount = computed(() => {
  const j = generatedJson.value
  if (!j) return 0
  if (j.totalAmount != null) return j.totalAmount
  return j.recipients.reduce((sum, r) => sum + r.amount, 0)
})

const jsonPreview = computed(() => {
  const j = generatedJson.value
  if (!j) return ''
  return JSON.stringify(j, null, 2)
})

async function fetchDiscordServer() {
  const id = tenantId.value
  if (!id) return
  const supabase = useSupabase()
  const { data } = await supabase.functions.invoke('discord-server', {
    body: { action: 'get', tenantId: id },
  })
  const srv = (data as { server?: Record<string, unknown> | null })?.server
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
    guildRoles.value = []
    guildRolesAll.value = []
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

async function generateJson() {
  const id = tenantId.value
  if (!id || !canGenerate.value) return
  generating.value = true
  generateError.value = null
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      generateError.value = 'Connect your wallet and sign in to generate JSON.'
      return
    }
    const action = isWeightedRule.value ? 'weighted-time-json' : 'rules-mode-json'
    const body = isWeightedRule.value
      ? {
          action,
          tenantId: id,
          conditionSetId: conditionSetId.value,
          totalAmount: totalAmountForGenerate.value,
          mint: mint.value.trim(),
        }
      : {
          action,
          tenantId: id,
          conditionSetId: conditionSetId.value,
          fixedAmount: fixedAmount.value,
          mint: mint.value.trim(),
        }
    const { data, error } = await supabase.functions.invoke('qualification', {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) throw new Error(error.message ?? 'Failed to generate')
    const result = data as {
      mint?: string
      recipients?: Array<{ address: string; amount: number }>
      totalAmount?: number
    }
    if (!result?.mint || !Array.isArray(result.recipients)) {
      throw new Error('Invalid response from qualification')
    }
    generatedJson.value = {
      mint: result.mint,
      recipients: result.recipients,
      ...(result.totalAmount != null && { totalAmount: result.totalAmount }),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate JSON'
    generateError.value =
      msg.includes('401') || msg.includes('Unauthorized')
        ? 'Connect your wallet and ensure you are an admin for this tenant.'
        : msg
    generatedJson.value = null
  } finally {
    generating.value = false
  }
}

function copyJson() {
  if (!generatedJson.value) return
  navigator.clipboard.writeText(JSON.stringify(generatedJson.value, null, 2))
}

function downloadJson() {
  if (!generatedJson.value) return
  const blob = new Blob([JSON.stringify(generatedJson.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shipment-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function useInPlanShipment() {
  if (!generatedJson.value) return
  try {
    sessionStorage.setItem(SHIPMENT_JSON_KEY, JSON.stringify(generatedJson.value))
    const route = useRoute()
    navigateTo({ path: '/admin', query: { ...route.query, tab: 'plan-shipment' } })
  } catch {
    // ignore
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

function onLoadRule(item: ConditionSetItem) {
  conditionSetId.value = item.id
}

async function onDeleteRule(item: ConditionSetItem) {
  await deleteConditionSet(item.id)
  if (conditionSetId.value === item.id) {
    conditionSetId.value = null
  }
}

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
</script>

<style scoped>
.shipment-list-tab__hint,
.shipment-list-tab__generate-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-md);
  line-height: 1.5;
}
.shipment-list-tab__discord-hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: var(--theme-space-sm) 0 0;
  line-height: 1.5;
}
.shipment-list-tab__generate {
  margin-bottom: var(--theme-space-xl);
}
.shipment-list-tab__generate h4 {
  font-size: var(--theme-font-md);
  margin: 0 0 var(--theme-space-sm);
}
.shipment-list-tab__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
}
.shipment-list-tab__badge {
  font-size: var(--theme-font-xs);
  padding: 2px 6px;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
}
.shipment-list-tab__row {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  margin-bottom: var(--theme-space-md);
  max-width: 24rem;
}
.shipment-list-tab__mint-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
}
.shipment-list-tab__mint-input {
  flex: 1;
  min-width: 0;
}
.shipment-list-tab__label {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-secondary);
}
.shipment-list-tab__spinner {
  animation: shipment-list-spin 1s linear infinite;
}
@keyframes shipment-list-spin {
  to { transform: rotate(360deg); }
}
.shipment-list-tab__error {
  color: var(--theme-error);
  font-size: var(--theme-font-sm);
  margin: 0;
}
.shipment-list-tab__output {
  margin-top: var(--theme-space-lg);
  padding-top: var(--theme-space-lg);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}
.shipment-list-tab__output h4 {
  font-size: var(--theme-font-md);
  margin: 0 0 var(--theme-space-sm);
}
.shipment-list-tab__meta {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-sm);
}
.shipment-list-tab__json-actions {
  display: flex;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-sm);
}
.shipment-list-tab__pre {
  font-size: var(--theme-font-xs);
  background: var(--theme-bg-secondary);
  padding: var(--theme-space-md);
  border-radius: var(--theme-radius-md);
  overflow-x: auto;
  max-height: 12rem;
  overflow-y: auto;
  margin: 0;
}
</style>
