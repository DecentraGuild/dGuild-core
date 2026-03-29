<template>
  <PageSection title="Raffle" module-id="raffles">
    <div
      class="raffle-page"
      :class="{ 'raffle-page--selected': !!selectedRaffle }"
      :style="selectedRaffle?.chainData?.url ? { '--raffle-bg-image': `url(${selectedRaffle.chainData.url})` } : {}"
    >
      <p v-if="!tenantStore.tenant?.modules?.raffles" class="raffle-page__empty">
        Raffle module is not enabled for this community.
      </p>
      <template v-else>
        <div v-if="loading" class="raffle-page__loading">
          <Icon icon="lucide:loader-2" class="raffle-page__spinner" />
          <span>Loading raffles...</span>
        </div>
        <div v-else-if="visibleRaffles.length === 0" class="raffle-page__empty">
          <p>No active raffles yet.</p>
        </div>
        <div v-else class="raffle-page__layout layout-split">
          <div class="raffle-page__grid layout-split__main admin__card-grid--auto-comfortable">
            <button
              v-for="r in visibleRaffles"
              :key="r.rafflePubkey"
              type="button"
              class="raffle-card"
              :class="{ 'raffle-card--selected': selectedRaffle?.rafflePubkey === r.rafflePubkey }"
              :style="r.chainData?.url ? { backgroundImage: `url(${r.chainData.url})` } : {}"
              @click="selectRaffle(r)"
            >
              <div class="raffle-card__overlay" />
              <div class="raffle-card__content">
                <h3 class="raffle-card__name">{{ r.chainData?.name ?? 'Raffle' }}</h3>
                <p v-if="r.chainData?.description" class="raffle-card__desc">{{ r.chainData.description }}</p>
                <p v-if="r.chainData" class="raffle-card__price">
                  {{ formatTicketPrice(r.chainData) }} per ticket
                </p>
                <p v-if="r.chainData" class="raffle-card__tickets">
                  {{ r.chainData.ticketsSold }} / {{ r.chainData.ticketsTotal }} tickets
                </p>
                <p
                  v-if="r.chainData && prizeConfigured(r.chainData)"
                  class="raffle-card__prize"
                >
                  Prize: {{ formatPrizeLine(r.chainData) }}
                </p>
                <span
                  v-if="r.chainData"
                  class="raffle-card__state"
                  :class="`raffle-card__state--${r.chainData.state}`"
                >
                  {{ r.chainData.stateDisplay }}
                </span>
                <p v-if="r.chainData?.winner" class="raffle-card__winner">
                  Winner: {{ resolveWallet(r.chainData.winner, 8, 4) }}
                </p>
                <div v-if="r.chainData" class="raffle-card__footer">
                  <span
                    class="raffle-card__mint-name"
                    :title="r.chainData.ticketMint"
                  >{{ mintCatalogLabel(r.chainData.ticketMint) }}</span>
                  <a
                    :href="accountUrl(r.rafflePubkey)"
                    target="_blank"
                    rel="noopener"
                    class="raffle-card__link"
                    @click.stop
                  >
                    <Icon icon="lucide:external-link" />
                  </a>
                </div>
              </div>
            </button>
          </div>
          <aside v-if="selectedRaffle" class="raffle-page__panel layout-split__sidebar">
            <div class="raffle-panel">
              <h3 class="raffle-panel__title">{{ selectedRaffle.chainData?.name ?? 'Raffle' }}</h3>
              <p v-if="selectedRaffle.chainData?.description" class="raffle-panel__desc">
                {{ selectedRaffle.chainData.description }}
              </p>
              <p v-if="selectedRaffle.chainData" class="raffle-panel__meta">
                {{ selectedRaffle.chainData.ticketsSold }} / {{ selectedRaffle.chainData.ticketsTotal }} tickets sold
              </p>
              <p v-if="selectedRaffle.chainData" class="raffle-panel__price">
                {{ formatTicketPrice(selectedRaffle.chainData) }} per ticket
              </p>
              <p v-if="selectedRaffle.chainData" class="raffle-panel__ticket-token">
                Pay with: {{ mintCatalogLabelLong(selectedRaffle.chainData.ticketMint) }}
              </p>
              <div
                v-if="selectedRaffle.chainData && prizeConfigured(selectedRaffle.chainData)"
                class="raffle-panel__reward"
              >
                <h4 class="raffle-panel__reward-title">Prize</h4>
                <p class="raffle-panel__reward-value">{{ formatPrizeLine(selectedRaffle.chainData) }}</p>
              </div>
              <div v-if="selectedRaffle.chainData?.winner" class="raffle-panel__winner">
                <h4 class="raffle-panel__winner-title">Winner</h4>
                <p class="raffle-panel__winner-row">
                  <span class="raffle-panel__winner-value">{{ resolveWallet(selectedRaffle.chainData.winner, 8, 6) }}</span>
                  <a
                    :href="accountUrl(selectedRaffle.chainData.winner)"
                    target="_blank"
                    rel="noopener"
                    class="raffle-panel__winner-link"
                    title="View on explorer"
                  >
                    <Icon icon="lucide:external-link" />
                  </a>
                </p>
              </div>
              <template v-if="canBuyTickets">
                <div class="raffle-panel__field">
                  <label class="raffle-panel__label">Number of tickets</label>
                  <input
                    v-model.number="buyAmount"
                    type="number"
                    min="1"
                    :max="availableTickets"
                    class="raffle-panel__input"
                    placeholder="1"
                  />
                </div>
                <p class="raffle-panel__total">
                  Total: {{ formatTotalCost }}
                </p>
                <Button
                  :disabled="!canSubmitBuy || buySubmitting"
                  @click="onBuyTickets"
                >
                  <Icon v-if="buySubmitting" icon="lucide:loader-2" class="raffle-panel__btn-spinner" />
                  <span v-else>Buy tickets</span>
                </Button>
                <p v-if="buyTxStatus" class="raffle-panel__status">{{ buyTxStatus }}</p>
                <p v-if="buyError" class="raffle-panel__error">{{ buyError }}</p>
              </template>
              <p v-else class="raffle-panel__hint">
                {{ selectedRaffle.chainData?.state !== 'running' ? 'This raffle is not currently accepting ticket purchases.' : 'Connect your wallet to buy tickets.' }}
              </p>
              <button type="button" class="raffle-panel__close" @click="selectedRaffle = null">
                <Icon icon="lucide:x" />
              </button>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { useExplorerLinks } from '@decentraguild/nuxt-composables'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { useTenantStore } from '~/stores/tenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useRafflePublic } from '~/composables/raffle/useRafflePublic'

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const { connection } = useSolanaConnection()
const { accountUrl } = useExplorerLinks()

const {
  loading, selectedRaffle, buyAmount, buySubmitting, buyTxStatus, buyError,
  visibleRaffles, canBuyTickets, availableTickets, canSubmitBuy, formatTotalCost,
  prizeConfigured, mintCatalogLabel, mintCatalogLabelLong, formatPrizeLine, formatTicketPrice,
  selectRaffle, onBuyTickets, resolveWallet,
} = useRafflePublic(tenantId, connection)
</script>

<style scoped>
.raffle-page {
  padding: var(--theme-space-md) 0;
  position: relative;
  min-height: 200px;
}

.raffle-page--selected::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: var(--raffle-bg-image);
  background-size: cover;
  background-position: center;
  opacity: 0.12;
  pointer-events: none;
  z-index: 0;
}

.raffle-page__loading,
.raffle-page__empty {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-md);
}

.raffle-page__spinner {
  animation: raffle-spin 1s linear infinite;
}

@keyframes raffle-spin {
  to { transform: rotate(360deg); }
}

.raffle-page__layout {
  position: relative;
  z-index: 1;
}

.raffle-card {
  position: relative;
  padding: 0;
  min-height: 200px;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  background: var(--theme-bg-card);
  background-size: cover;
  background-position: center;
}

.raffle-card--selected {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px var(--theme-primary);
}

.raffle-card__overlay {
  position: absolute;
  inset: 0;
  /* Full-card darken so type reads on bright art; stronger band at bottom where copy sits */
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.88) 0%,
    rgba(0, 0, 0, 0.52) 38%,
    rgba(0, 0, 0, 0.32) 68%,
    rgba(0, 0, 0, 0.22) 100%
  );
  pointer-events: none;
}

.raffle-card__content {
  position: relative;
  padding: var(--theme-space-lg);
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.raffle-card__name {
  font-size: var(--theme-font-lg);
  font-weight: 600;
  margin: 0 0 var(--theme-space-xs);
  line-height: 1.2;
}

.raffle-card__desc {
  font-size: var(--theme-font-sm);
  margin: 0 0 var(--theme-space-sm);
  opacity: 0.9;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.raffle-card__price {
  font-size: var(--theme-font-sm);
  margin: 0 0 var(--theme-space-xs);
  font-weight: 500;
}

.raffle-card__tickets {
  font-size: var(--theme-font-xs);
  margin: 0 0 var(--theme-space-sm);
  opacity: 0.9;
}

.raffle-card__state {
  display: inline-block;
  align-self: flex-start;
  padding: 2px 8px;
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-primary);
  color: white;
  margin-bottom: var(--theme-space-sm);
}

.raffle-card__winner {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  font-weight: 600;
  line-height: 1.3;
}

.raffle-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  margin-top: auto;
}

.raffle-card__prize {
  font-size: var(--theme-font-sm);
  margin: 0 0 var(--theme-space-xs);
  font-weight: 600;
  opacity: 0.95;
}

.raffle-card__mint-name {
  font-size: var(--theme-font-xs);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.raffle-card__link {
  color: rgba(255,255,255,0.8);
  display: inline-flex;
}

.raffle-card__link:hover {
  color: white;
}

.raffle-panel {
  position: sticky;
  top: var(--theme-space-md);
  padding: var(--theme-space-lg);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
}

.raffle-panel__title {
  font-size: var(--theme-font-lg);
  font-weight: 700;
  margin: 0 2rem var(--theme-space-sm) 0;
  color: var(--theme-primary);
}

.raffle-panel__desc {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-sm);
}

.raffle-panel__meta {
  font-size: var(--theme-font-sm);
  margin: 0 0 var(--theme-space-xs);
}

.raffle-panel__price {
  font-size: var(--theme-font-sm);
  font-weight: 500;
  margin: 0 0 var(--theme-space-xs);
}

.raffle-panel__ticket-token {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-md);
}

.raffle-panel__reward {
  margin: 0 0 var(--theme-space-md);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.raffle-panel__reward-title {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--theme-text-secondary);
}

.raffle-panel__reward-value {
  margin: 0;
  font-size: var(--theme-font-md);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.raffle-panel__winner {
  margin: 0 0 var(--theme-space-md);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.raffle-panel__winner-title {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--theme-text-secondary);
}

.raffle-panel__winner-row {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  flex-wrap: wrap;
}

.raffle-panel__winner-value {
  font-size: var(--theme-font-md);
  font-weight: 600;
  color: var(--theme-text-primary);
  font-family: var(--theme-font-mono, monospace);
  word-break: break-all;
}

.raffle-panel__winner-link {
  color: var(--theme-primary);
  display: inline-flex;
  flex-shrink: 0;
}

.raffle-panel__winner-link:hover {
  color: var(--theme-primary-hover);
}

.raffle-panel__field {
  margin-bottom: var(--theme-space-md);
}

.raffle-panel__label {
  display: block;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  margin-bottom: var(--theme-space-xs);
}

.raffle-panel__input {
  width: 100%;
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-md);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-primary);
}

.raffle-panel__total {
  font-size: var(--theme-font-md);
  font-weight: 600;
  margin: 0 0 var(--theme-space-md);
}

.raffle-panel__status {
  font-size: var(--theme-font-sm);
  color: var(--theme-primary);
  margin: var(--theme-space-sm) 0 0;
}

.raffle-panel__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error, #dc3545);
  margin: var(--theme-space-sm) 0 0;
}

.raffle-panel__hint {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.raffle-panel__close {
  position: absolute;
  top: var(--theme-space-sm);
  right: var(--theme-space-sm);
  padding: var(--theme-space-xs);
  color: var(--theme-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.raffle-panel__close:hover {
  color: var(--theme-text-primary);
}

.raffle-panel__btn-spinner {
  animation: raffle-spin 1s linear infinite;
}
</style>
