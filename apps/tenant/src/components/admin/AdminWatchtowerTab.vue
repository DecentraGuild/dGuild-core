<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <GateSelectRowModule
          layout="stacked"
          :slug="slug"
          :model-value="gateFormValue"
          title="Who can see Watchtower"
          hint="Who can see Watchtower. Use dGuild default, admins only, public, or a specific list."
          show-use-default
          show-admin-only
          show-save
          save-label="Save"
          :dirty="gateDirty"
          :loading="savingGate"
          :save-success="gateSaveSuccess"
          :save-error="gateSaveError"
          @update:model-value="onGateUpdate"
          @save="saveGate"
        />
        <h3>Watchtower</h3>
        <p class="watchtower-tab__hint">
          Enable tracking per mint. Current holders: short refresh rate for conditions, shipment, Discord. Snapshot: daily holder snapshots. Transactions track is coming soon.
        </p>

        <div v-if="loading" class="watchtower-tab__loading">
          <Icon icon="lucide:loader-2" class="watchtower-tab__spinner" />
          Loading...
        </div>

        <template v-else>
          <p v-if="!mints.length" class="watchtower-tab__empty">
            Add mints in Admin > Address Book first.
          </p>
          <template v-else>
            <section v-if="mintsSpl.length" class="watchtower-tab__section">
              <h4 class="watchtower-tab__section-title">SPL tokens</h4>
              <ul class="watchtower-tab__list">
                <li
                  v-for="mint in mintsSpl"
                  :key="mint.mint"
                  class="watchtower-tab__item"
                >
                  <div class="watchtower-tab__item-info">
                    <span class="watchtower-tab__item-name">{{ mint.name ?? mint.label ?? truncateAddress(mint.mint, 8, 6) }}</span>
                    <code class="watchtower-tab__item-addr">{{ truncateAddress(mint.mint, 8, 6) }}</code>
                  </div>
                  <div class="watchtower-tab__item-tracks">
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_holders ?? false"
                        @change="onTrackChange(mint.mint, 'track_holders', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Current holders</span>
                    </label>
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_snapshot ?? false"
                        @change="onTrackChange(mint.mint, 'track_snapshot', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Snapshot</span>
                    </label>
                    <label class="watchtower-tab__check watchtower-tab__check--disabled" title="Coming soon">
                      <input type="checkbox" :checked="false" disabled />
                      <span>Transactions</span>
                    </label>
                  </div>
                </li>
              </ul>
            </section>
            <section v-if="mintsNft.length" class="watchtower-tab__section">
              <h4 class="watchtower-tab__section-title">NFT collections</h4>
              <ul class="watchtower-tab__list">
                <li
                  v-for="mint in mintsNft"
                  :key="mint.mint"
                  class="watchtower-tab__item"
                >
                  <div class="watchtower-tab__item-info">
                    <span class="watchtower-tab__item-name">{{ mint.name ?? mint.label ?? truncateAddress(mint.mint, 8, 6) }}</span>
                    <code class="watchtower-tab__item-addr">{{ truncateAddress(mint.mint, 8, 6) }}</code>
                    <span
                      v-if="mint.nft_collection_sync_mode === 'sft_per_mint'"
                      class="watchtower-tab__mode"
                    >SFT collection (holders per item mint)</span>
                  </div>
                  <div class="watchtower-tab__item-tracks">
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_holders ?? false"
                        @change="onTrackChange(mint.mint, 'track_holders', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Current holders</span>
                    </label>
                    <label class="watchtower-tab__check">
                      <input
                        type="checkbox"
                        :checked="watchesByMint[mint.mint]?.track_snapshot ?? false"
                        @change="onTrackChange(mint.mint, 'track_snapshot', ($event.target as HTMLInputElement).checked)"
                      />
                      <span>Snapshot</span>
                    </label>
                    <label class="watchtower-tab__check watchtower-tab__check--disabled" title="Coming soon">
                      <input type="checkbox" :checked="false" disabled />
                      <span>Transactions</span>
                    </label>
                  </div>
                </li>
              </ul>
            </section>
          </template>
          <div v-if="localSaveError" class="watchtower-tab__error">{{ localSaveError }}</div>
          <p v-else-if="showGraceHint" class="watchtower-tab__grace-hint">
            Deploy and pay for the new tracks to make them active for members.
          </p>
          <p class="watchtower-tab__save-hint">
            Changes are saved when you click Save in the pricing widget.
          </p>
        </template>
      </Card>
    </div>

    <AdminPricingWidget
      module-id="watchtower"
      :module-state="moduleState"
      :conditions="liveConditions"
      :stored-conditions="storedConditionsSnapshot"
      :subscription="widgetSubscription"
      :saving="saving"
      :deploying="deploying"
      :save-error="saveError"
      @save="(p: BillingPeriod, c?: Record<string, number>) => emit('save', p, c)"
      @deploy="(p: BillingPeriod, c?: Record<string, number>) => emit('deploy', p, c)"
      @reactivate="(p: BillingPeriod) => emit('reactivate', p)"
    />
  </div>
</template>

<script setup lang="ts">
import { truncateAddress } from '@decentraguild/display'
import { Icon } from '@iconify/vue'
import { Card } from '~/components/ui/card'
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod } from '@decentraguild/billing'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'
import type { SubscriptionInfo, WatchtowerSubscriptionByScope } from '~/composables/admin/useAdminSubscriptions'
import { useAdminWatchtowerScope } from '~/composables/admin/useAdminWatchtowerScope'
import { toRef } from 'vue'

const props = defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: WatchtowerSubscriptionByScope | SubscriptionInfo | null
  saving: boolean
  deploying: boolean
  saveError: string | null
}>()

const emit = defineEmits<{
  save: [period: BillingPeriod]
  deploy: [period: BillingPeriod]
  reactivate: [period: BillingPeriod]
}>()

const {
  loading, localSaveError, mints, watches: _watches,
  mintsSpl, mintsNft, watchesByMint, liveConditions,
  storedConditionsSnapshot, showGraceHint, widgetSubscription,
  gateFormValue, gateDirty, savingGate, gateSaveSuccess, gateSaveError,
  onGateUpdate, saveGate, onTrackChange, saveWatches,
} = useAdminWatchtowerScope(toRef(props, 'subscription'))

defineExpose({ saveWatches })
</script>

<style scoped>
.watchtower-tab__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
  margin-bottom: var(--theme-space-md);
}

.watchtower-tab__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.watchtower-tab__spinner {
  animation: watchtower-spin 1s linear infinite;
}

@keyframes watchtower-spin {
  to { transform: rotate(360deg); }
}

.watchtower-tab__empty {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.watchtower-tab__section {
  margin-bottom: var(--theme-space-lg);
}

.watchtower-tab__section:last-child {
  margin-bottom: 0;
}

.watchtower-tab__section-title {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  margin: 0 0 var(--theme-space-sm);
  color: var(--theme-secondary);
}

.watchtower-tab__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.watchtower-tab__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--theme-space-sm) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.watchtower-tab__item:last-child {
  border-bottom: none;
}

.watchtower-tab__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.watchtower-tab__item-name {
  font-weight: 500;
}

.watchtower-tab__item-addr {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.watchtower-tab__mode {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.watchtower-tab__item-tracks {
  display: flex;
  gap: var(--theme-space-md);
}

.watchtower-tab__check {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  font-size: var(--theme-font-sm);
  cursor: pointer;
}

.watchtower-tab__check--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.watchtower-tab__error {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}

.watchtower-tab__grace-hint {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.watchtower-tab__save-hint {
  margin-top: var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}
</style>
