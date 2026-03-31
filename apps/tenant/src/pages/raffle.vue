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
          <div class="raffle-page__main-col layout-split__main">
            <div v-if="anyPublicWinner" class="raffle-page__outcomes-bar">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="raffle-page__outcomes-toggle"
                :title="revealPublicOutcomes ? 'Hide winner' : 'Show winner'"
                :aria-pressed="revealPublicOutcomes"
                @click="revealPublicOutcomes = !revealPublicOutcomes"
              >
                <Icon :icon="revealPublicOutcomes ? 'lucide:eye-off' : 'lucide:eye'" />
                <span>{{ revealPublicOutcomes ? 'Hide winner' : 'Show winner' }}</span>
              </Button>
            </div>
            <div class="raffle-page__grid admin__card-grid--auto-comfortable">
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
                <p v-if="r.chainData?.winner && revealPublicOutcomes" class="raffle-card__winner">
                  Winner: {{ resolveWallet(r.chainData.winner, 8, 4) }}
                </p>
                <p v-else-if="r.chainData?.winner && !revealPublicOutcomes" class="raffle-card__winner raffle-card__winner--masked">
                  Winner decided — use Show winner above to reveal.
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
          </div>
          <aside v-if="selectedRaffle" class="raffle-page__panel layout-split__sidebar">
            <div class="raffle-panel">
              <h3 class="raffle-panel__title">{{ selectedRaffle.chainData?.name ?? 'Raffle' }}</h3>
              <p v-if="selectedRaffle.chainData?.description" class="raffle-panel__desc">
                {{ selectedRaffle.chainData.description }}
              </p>
              <div v-if="selectedRaffle.chainData" class="raffle-panel__meta-row">
                <p class="raffle-panel__meta">
                  {{ selectedRaffle.chainData.ticketsSold }} / {{ selectedRaffle.chainData.ticketsTotal }} tickets sold
                  <span v-if="selectedRaffle.chainData.state === 'running'" class="raffle-panel__meta-avail">
                    ({{ availableTickets }} left)
                  </span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="raffle-panel__refresh"
                  :disabled="chainRefreshLoading || !connection"
                  @click="refreshRaffleAvailability"
                >
                  <Icon
                    icon="lucide:refresh-cw"
                    class="raffle-panel__refresh-icon"
                    :class="{ 'raffle-panel__refresh-icon--spin': chainRefreshLoading }"
                  />
                  Refresh
                </Button>
              </div>
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
                <div class="raffle-panel__winner-head">
                  <h4 class="raffle-panel__winner-title">Winner</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="raffle-panel__winner-eye"
                    :title="revealPublicOutcomes ? 'Hide winner' : 'Show winner'"
                    :aria-pressed="revealPublicOutcomes"
                    @click="revealPublicOutcomes = !revealPublicOutcomes"
                  >
                    <Icon :icon="revealPublicOutcomes ? 'lucide:eye-off' : 'lucide:eye'" />
                  </Button>
                </div>
                <template v-if="revealPublicOutcomes">
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
                </template>
                <p v-else class="raffle-panel__winner-masked">Hidden — tap the eye to reveal.</p>
              </div>
              <div v-if="canPublicBattleReveal" class="raffle-panel__battle">
                <Button type="button" variant="outline" size="sm" @click="openPublicBattleReveal">
                  Battle reveal
                </Button>
                <p class="raffle-panel__battle-hint">
                  Watch a fun draw replay. Available until this raffle is closed on-chain.
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
                <p v-if="buyWhitelistChecking" class="raffle-panel__status">Checking whitelist…</p>
                <p v-else-if="buyWhitelistMessage" class="raffle-panel__error">{{ buyWhitelistMessage }}</p>
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
              <details
                v-if="selectedRaffle.chainData && selectedRaffle.chainData.ticketsSold > 0"
                :key="selectedRaffle.rafflePubkey"
                class="raffle-panel__entries"
                @toggle="onEntriesToggle"
              >
                <summary class="raffle-panel__entries-summary">Entries and odds</summary>
                <p class="raffle-panel__entries-note">
                  Each row is tickets bought in successful Buy transactions for this raffle (not everyone who holds the payment mint). Share is of sold tickets on-chain.
                </p>
                <p v-if="holdersLoading" class="raffle-panel__entries-status">Loading entries…</p>
                <p v-else-if="holdersError" class="raffle-panel__error">{{ holdersError }}</p>
                <template v-else>
                  <p v-if="!holdersMatchSold" class="raffle-panel__entries-warn">
                    Entrant data on the Tickets account does not match the sold count; refresh the page or try again shortly.
                  </p>
                  <div class="raffle-panel__entries-table-wrap">
                    <table class="raffle-panel__entries-table">
                      <thead>
                        <tr>
                          <th>Wallet</th>
                          <th>Tickets</th>
                          <th>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in holderRows" :key="row.owner">
                          <td>{{ resolveWallet(row.owner, 8, 4) }}</td>
                          <td>{{ row.tickets }}</td>
                          <td>{{ row.sharePercent.toFixed(1) }}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
              </details>
              <button type="button" class="raffle-panel__close" @click="selectedRaffle = null">
                <Icon icon="lucide:x" />
              </button>
            </div>
          </aside>
        </div>
      </template>
    </div>

    <RaffleBattleRevealModal
      v-model="publicBattleOpen"
      :raffle-name="publicBattleRaffleTitle"
      :winner-pubkey="publicBattleWinnerPubkey"
      :loading="publicBattleHoldersLoading"
      :load-error="publicBattleHoldersError"
      :matches-sold="publicBattleHoldersMatchSold"
      :display-rows="publicBattleDisplayRows"
      :raw-holder-rows="publicBattleRawHolderRows"
      :format-wallet="formatPublicBattleWallet"
    />
  </PageSection>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useExplorerLinks } from '@decentraguild/nuxt-composables'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { useTenantStore } from '~/stores/tenant'
import { useSolanaConnection } from '~/composables/core/useSolanaConnection'
import { useRafflePublic } from '~/composables/raffle/useRafflePublic'
import { useRaffleTicketHolders } from '~/composables/raffle/useRaffleTicketHolders'
import RaffleBattleRevealModal from '~/components/raffle/RaffleBattleRevealModal.vue'

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)
const { connection } = useSolanaConnection()
const { accountUrl } = useExplorerLinks()

const {
  loading, selectedRaffle, buyAmount, buySubmitting, buyTxStatus, buyError,
  buyWhitelistChecking, buyWhitelistMessage,
  chainRefreshLoading, refreshRaffleAvailability,
  visibleRaffles, canBuyTickets, availableTickets, canSubmitBuy, formatTotalCost,
  prizeConfigured, mintCatalogLabel, mintCatalogLabelLong, formatPrizeLine, formatTicketPrice,
  selectRaffle, onBuyTickets, resolveWallet,
} = useRafflePublic(tenantId, connection)

const publicBattleOpen = ref(false)
const publicBattleRafflePubkey = ref<string | null>(null)

const canPublicBattleReveal = computed(() => {
  const d = selectedRaffle.value?.chainData
  if (!d) return false
  if (!d.winner?.trim()) return false
  if (d.state === 'done') return false
  return d.ticketsSold >= 1
})

const publicBattleHolderContext = computed(() => {
  if (!publicBattleOpen.value || !publicBattleRafflePubkey.value) return null
  const r = selectedRaffle.value
  if (r?.rafflePubkey !== publicBattleRafflePubkey.value) return null
  const d = r.chainData
  if (!d || d.ticketsSold < 1) return null
  return { rafflePubkey: r.rafflePubkey, ticketsSold: d.ticketsSold }
})

const {
  loading: publicBattleHoldersLoading,
  error: publicBattleHoldersError,
  rows: publicBattleDisplayRows,
  rawRows: publicBattleRawHolderRows,
  matchesSold: publicBattleHoldersMatchSold,
} = useRaffleTicketHolders(connection, publicBattleHolderContext)

const publicBattleChainData = computed(() => {
  if (!publicBattleRafflePubkey.value) return null
  const r = selectedRaffle.value
  if (r?.rafflePubkey !== publicBattleRafflePubkey.value) return null
  return r.chainData ?? null
})

const publicBattleWinnerPubkey = computed(() => publicBattleChainData.value?.winner?.trim() ?? '')
const publicBattleRaffleTitle = computed(() => publicBattleChainData.value?.name ?? '')

function formatPublicBattleWallet(pubkey: string, head = 8, tail = 6) {
  return resolveWallet(pubkey, head, tail)
}

function openPublicBattleReveal() {
  const pk = selectedRaffle.value?.rafflePubkey
  if (!pk) return
  publicBattleRafflePubkey.value = pk
  publicBattleOpen.value = true
}

watch(publicBattleOpen, (v) => {
  if (!v) publicBattleRafflePubkey.value = null
})

watch(selectedRaffle, (r) => {
  if (!publicBattleOpen.value || !publicBattleRafflePubkey.value) return
  if (!r || r.rafflePubkey !== publicBattleRafflePubkey.value) {
    publicBattleOpen.value = false
    publicBattleRafflePubkey.value = null
  }
})

const entriesSectionOpen = ref(false)
const revealPublicOutcomes = ref(false)

const anyPublicWinner = computed(() =>
  visibleRaffles.value.some((r) => Boolean(r.chainData?.winner?.trim())),
)

function onEntriesToggle(ev: Event) {
  const el = ev.target
  if (el instanceof HTMLDetailsElement) entriesSectionOpen.value = el.open
}

const holderFetchContext = computed(() => {
  const r = selectedRaffle.value
  const d = r?.chainData
  if (!entriesSectionOpen.value || !r || !d || d.ticketsSold < 1) return null
  return {
    rafflePubkey: r.rafflePubkey,
    ticketsSold: d.ticketsSold,
  }
})

const {
  loading: holdersLoading,
  error: holdersError,
  rows: holderRows,
  matchesSold: holdersMatchSold,
} = useRaffleTicketHolders(connection, holderFetchContext)
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

.raffle-page__main-col {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
  min-width: 0;
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

.raffle-panel__meta-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  margin: 0 0 var(--theme-space-xs);
  flex-wrap: wrap;
}

.raffle-panel__meta-row .raffle-panel__meta {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.raffle-panel__meta-avail {
  color: var(--theme-text-secondary);
  font-weight: 400;
}

.raffle-panel__refresh {
  flex-shrink: 0;
}

.raffle-panel__refresh-icon--spin {
  animation: raffle-spin 0.9s linear infinite;
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

.raffle-page__outcomes-bar {
  margin-bottom: var(--theme-space-sm);
}

.raffle-page__outcomes-toggle {
  color: var(--theme-text-secondary);
}

.raffle-card__winner--masked {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  font-style: italic;
}

.raffle-panel__winner {
  margin: 0 0 var(--theme-space-md);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.raffle-panel__winner-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-xs);
  margin-bottom: var(--theme-space-xs);
}

.raffle-panel__winner-head .raffle-panel__winner-title {
  margin: 0;
}

.raffle-panel__winner-title {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--theme-text-secondary);
}

.raffle-panel__winner-masked {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  font-style: italic;
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

.raffle-panel__battle {
  margin: 0 0 var(--theme-space-md);
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--theme-space-xs);
}

.raffle-panel__battle-hint {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  max-width: 22rem;
  line-height: 1.35;
}

.raffle-panel__entries {
  margin-top: var(--theme-space-md);
  padding-top: var(--theme-space-md);
  border-top: var(--theme-border-thin) solid var(--theme-border);
  font-size: var(--theme-font-sm);
}

.raffle-panel__entries-summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--theme-text-primary);
}

.raffle-panel__entries-note {
  margin: var(--theme-space-sm) 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}

.raffle-panel__entries-status {
  margin: var(--theme-space-xs) 0 0;
  color: var(--theme-text-secondary);
}

.raffle-panel__entries-warn {
  margin: var(--theme-space-xs) 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-warning, #f5a623);
}

.raffle-panel__entries-table-wrap {
  overflow: auto;
  max-height: 220px;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  margin-top: var(--theme-space-xs);
}

.raffle-panel__entries-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--theme-font-xs);
}

.raffle-panel__entries-table th,
.raffle-panel__entries-table td {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  text-align: left;
  border-bottom: 1px solid var(--theme-border);
}

.raffle-panel__entries-table th {
  color: var(--theme-text-secondary);
  font-weight: 600;
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
