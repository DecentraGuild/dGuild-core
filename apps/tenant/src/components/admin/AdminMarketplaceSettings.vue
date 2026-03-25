<template>
  <div class="marketplace-settings">
    <Card>
      <GateSelectRowModule
        layout="stacked"
        :slug="slug"
        :model-value="marketplaceGateSelectValue"
        title="Who can see Marketplace"
        hint="Who can see Marketplace. Use dGuild default, admins only, public, or a specific list."
        show-use-default
        show-admin-only
        @update:model-value="onGateSelectUpdate"
      />
    </Card>
    <Card>
      <h3>Mint catalog</h3>
      <p class="marketplace-settings__hint">
        Paste any mint address or pick from your address book. New mints are added to the address book automatically when you load them here.
      </p>

      <AdminMintCatalog
        :mints="catalogItems"
        @inspect="onInspectMint"
        @delete="onDeleteMint"
      >
        <template #add>
          <h4 class="marketplace-settings__add-title">Add tradable mint</h4>
          <div class="marketplace-settings__add-mint">
            <AddMintInput
              v-model="newMint"
              v-model:kind="newMintKind"
              :error="addMintError"
              :loading="adding"
              :disabled="saving"
              @submit="(mint, kind, entry) => addMint(mint, kind, entry)"
            />
          </div>
        </template>
      </AdminMintCatalog>
    </Card>

    <Card>
      <h3>Currencies</h3>
      <p class="marketplace-settings__hint">Select which trades Royalty and Shop fee bps counts. Base: SOL, WBTC, USDC, USDT. Add custom by mint. Not yet active in the smart contract.</p>
      <fieldset disabled class="marketplace-settings__disabled-fieldset">
        <div class="marketplace-settings__base-toggles">
          <label v-for="b in BASE_CURRENCY_MINTS" :key="b.symbol" class="marketplace-settings__checkbox">
            <input
              :checked="form.currencyMints.some((c) => c.mint === b.mint)"
              type="checkbox"
              @change="onBaseToggle(b.symbol, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ b.symbol }}</span>
          </label>
        </div>
        <div class="marketplace-settings__custom">
          <h4 class="marketplace-settings__add-title">Custom currencies</h4>
          <div class="marketplace-settings__add-mint">
            <AddMintInput
              v-model="newCurrencyMint"
              v-model:kind="newCurrencyKind"
              book-kind="SPL"
              hide-book-base-mints
              :error="addCurrencyError"
              :disabled="saving"
              @submit="addCurrencyFromInput"
            />
          </div>
          <ul v-if="customCurrencies.length" class="marketplace-settings__mint-list">
            <li
              v-for="(c, idx) in customCurrencies"
              :key="c.mint"
              class="marketplace-settings__mint-item"
            >
              <div class="marketplace-settings__mint-row marketplace-settings__mint-row--plain">
                <div class="marketplace-settings__mint-thumb">
                  <img v-if="c.image" :src="c.image" :alt="c.name ?? c.symbol ?? c.mint" />
                  <span v-else class="marketplace-settings__mint-thumb-placeholder"><Icon icon="lucide:banknote" /></span>
                </div>
                <div class="marketplace-settings__mint-detail">
                  <template v-if="c._loading">
                    <Icon icon="lucide:loader-2" class="marketplace-settings__spinner" />
                    <span class="marketplace-settings__mint-name">{{ truncateAddress(c.mint, 8, 4) }}</span>
                    <span class="marketplace-settings__mint-status">Loading...</span>
                  </template>
                  <template v-else-if="c._error">
                    <span class="marketplace-settings__mint-name">{{ truncateAddress(c.mint, 8, 4) }}</span>
                    <span class="marketplace-settings__mint-error">{{ c._error }}</span>
                  </template>
                  <template v-else>
                    <span class="marketplace-settings__mint-name">{{ (c.symbol || c.name) || truncateAddress(c.mint, 8, 4) }}</span>
                    <code class="marketplace-settings__mint-address">{{ truncateAddress(c.mint, 8, 6) }}</code>
                    <span class="marketplace-settings__mint-meta">
                      {{ c.name || '' }} {{ c.decimals != null ? `· ${c.decimals} dec` : '' }}
                      {{ c.sellerFeeBasisPoints != null ? `· ${c.sellerFeeBasisPoints} bps` : '' }}
                    </span>
                  </template>
                </div>
              </div>
              <Button variant="ghost" :disabled="!!c._loading" @click="removeCustomCurrency(idx)">
                <Icon icon="lucide:x" />
              </Button>
            </li>
          </ul>
        </div>
      </fieldset>
    </Card>

    <Card>
      <h3>Marketplace fees</h3>
      <p class="marketplace-settings__hint">
        These fees will be enforced at the escrow program level. Fields are shown here for planning but are not yet active.
      </p>
      <div class="marketplace-settings__fees">
        <FormInput
          v-model="form.shopFee.wallet"
          label="Fee wallet"
          placeholder="Wallet to receive marketplace fees"
          disabled
        />
        <div class="marketplace-settings__fee-row admin__card-grid--2-sm">
          <FormInput
            :model-value="String(form.shopFee.makerFlatFee ?? 0)"
            label="Maker flat fee (SOL)"
            type="number"
            disabled
            @update:model-value="form.shopFee.makerFlatFee = Number($event) || 0"
          />
          <FormInput
            :model-value="String(form.shopFee.takerFlatFee ?? 0)"
            label="Taker flat fee (SOL)"
            type="number"
            disabled
            @update:model-value="form.shopFee.takerFlatFee = Number($event) || 0"
          />
        </div>
        <div class="marketplace-settings__fee-row admin__card-grid--2-sm">
          <FormInput
            :model-value="String(form.shopFee.makerPercentFee ?? 0)"
            label="Maker fee (bps)"
            type="number"
            disabled
            @update:model-value="form.shopFee.makerPercentFee = Number($event) || 0"
          />
          <FormInput
            :model-value="String(form.shopFee.takerPercentFee ?? 0)"
            label="Taker fee (bps)"
            type="number"
            disabled
            @update:model-value="form.shopFee.takerPercentFee = Number($event) || 0"
          />
        </div>
      </div>
    </Card>

    <div class="marketplace-settings__actions">
      <Button
        variant="default"
        :disabled="saving || !canSave"
        @click="save"
      >
        {{ saving ? 'Saving...' : saveSuccess ? 'Saved' : canSave ? 'Save Marketplace Settings' : 'Complete loading before saving' }}
      </Button>
      <p v-if="saveSuccess" class="marketplace-settings__success">Settings saved.</p>
      <p v-else-if="saveError" class="marketplace-settings__error">{{ saveError }}</p>
    </div>

    <MintDetailModal v-model="showMintModal" :mint="selectedMint" :tenant-id="tenantId ?? ''" />
  </div>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { BASE_CURRENCY_MINTS } from '@decentraguild/core'
import { Card } from '~/components/ui/card'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { useMarketplaceSettings } from '~/composables/marketplace/useMarketplaceSettings'
import AdminMintCatalog from './AdminMintCatalog.vue'
import MintDetailModal from '~/components/mint/MintDetailModal/index.vue'
import AddMintInput from '~/components/mint/AddMintInput.vue'

const props = defineProps<{
  slug: string
  settings: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  saved: [settings: Record<string, unknown>]
  saving: [value: boolean]
}>()

const tenantId = computed(() => useTenantStore().tenantId ?? null)
const {
  form,
  catalogItems,
  customCurrencies,
  canSave,
  marketplaceGateSelectValue,
  newMint,
  newMintKind,
  addMintError,
  adding,
  newCurrencyMint,
  newCurrencyKind,
  addCurrencyError,
  saving,
  saveError,
  saveSuccess,
  selectedMint,
  showMintModal,
  onGateSelectUpdate,
  onInspectMint,
  onDeleteMint,
  addMint,
  onBaseToggle,
  addCurrencyFromInput,
  removeCustomCurrency,
  save,
} = useMarketplaceSettings({
  slug: () => props.slug,
  settings: () => props.settings,
  emit: (_, payload) => emit('saved', payload),
  emitSaving: (value) => emit('saving', value),
})

defineExpose({ save, form })
</script>

<style scoped>
.marketplace-settings {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
}

.marketplace-settings__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__add-title {
  font-size: var(--theme-font-md);
  margin-bottom: var(--theme-space-sm);
}

.marketplace-settings__add-mint {
  width: 100%;
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__add-mint :deep(.add-mint-input) {
  width: 100%;
  min-width: 0;
}

.marketplace-settings__base-toggles {
  display: flex;
  gap: var(--theme-space-lg);
  flex-wrap: wrap;
  margin-bottom: var(--theme-space-md);
}

.marketplace-settings__checkbox {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  cursor: pointer;
  font-size: var(--theme-font-sm);
}

.marketplace-settings__custom {
  margin-top: var(--theme-space-md);
}

.marketplace-settings__mint-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.marketplace-settings__mint-item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.marketplace-settings__mint-item:last-child {
  border-bottom: none;
}

.marketplace-settings__mint-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  flex: 1;
  min-width: 0;
}

.marketplace-settings__mint-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--theme-radius-sm);
  overflow: hidden;
  background: var(--theme-bg-muted);
}

.marketplace-settings__mint-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.marketplace-settings__mint-thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text-muted);
}

.marketplace-settings__mint-detail {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  min-width: 0;
}

.marketplace-settings__mint-name {
  font-size: var(--theme-font-sm);
  font-weight: 500;
}

.marketplace-settings__mint-address {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.marketplace-settings__mint-meta,
.marketplace-settings__mint-status,
.marketplace-settings__mint-error {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.marketplace-settings__mint-error {
  color: var(--theme-error);
}

.marketplace-settings__spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.marketplace-settings__disabled-fieldset {
  border: none;
  padding: 0;
  margin: 0;
  opacity: 0.5;
  cursor: not-allowed;
}

.marketplace-settings__fees {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.marketplace-settings__actions {
  margin-top: var(--theme-space-md);
}

.marketplace-settings__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
  margin-top: var(--theme-space-sm);
}

.marketplace-settings__success {
  font-size: var(--theme-font-sm);
  color: var(--theme-success, #22c55e);
  margin-top: var(--theme-space-sm);
}
</style>
