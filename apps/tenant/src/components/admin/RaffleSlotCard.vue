<template>
  <div class="raffle-slot-card raffle-slot-card--filled">
    <div class="raffle-slot-card__header">
      <code class="raffle-slot-card__pubkey">{{ truncateAddress(slotCard.raffle!.rafflePubkey, 8, 6) }}</code>
      <a
        :href="accountUrl(slotCard.raffle!.rafflePubkey)"
        target="_blank"
        rel="noopener"
        class="raffle-slot-card__link"
        title="View on Solscan"
      >
        <Icon icon="lucide:external-link" />
      </a>
    </div>
    <span
      v-if="slotCard.chainData"
      class="raffle-slot-card__state"
      :class="`raffle-slot-card__state--${slotCard.chainData.state}`"
    >
      {{ slotCard.chainData.stateDisplay }}
    </span>
    <h4 v-if="slotCard.chainData?.name" class="raffle-slot-card__name">{{ slotCard.chainData.name }}</h4>
    <p v-if="slotCard.chainData?.description" class="raffle-slot-card__desc">{{ truncateDesc(slotCard.chainData.description) }}</p>
    <p class="raffle-slot-card__meta">Created {{ formatDate(slotCard.raffle!.createdAt) }}</p>
    <template v-if="slotCard.chainData">
      <p class="raffle-slot-card__ticket-info">{{ ticketPriceLine(slotCard.chainData) }}</p>
      <p v-if="slotCard.chainData.ticketMint" class="raffle-slot-card__ticket-mint">{{ ticketMintShort(slotCard.chainData) }}</p>
    </template>
    <p v-if="slotCard.chainData && slotCard.chainData.ticketsTotal > 0" class="raffle-slot-card__tickets">
      Tickets: {{ slotCard.chainData.ticketsSold }} / {{ slotCard.chainData.ticketsTotal }}
    </p>
    <p v-if="actionError && slotCard.raffle?.rafflePubkey === actionErrorRaffle" class="raffle-slot-card__error">{{ actionError }}</p>
    <div class="raffle-slot-card__actions">
      <Button v-if="canAddReward" variant="ghost" class="raffle-slot-card__action" @click="$emit('add-reward')">
        Add rewards
      </Button>
      <Button v-if="canStartRaffle" variant="default" class="raffle-slot-card__action" :disabled="isSubmitting" @click="$emit('start')">
        {{ isSubmitting ? 'Starting...' : 'Start raffle' }}
      </Button>
      <Button v-if="canPauseRaffle" variant="ghost" class="raffle-slot-card__action" :disabled="isSubmitting" @click="$emit('pause')">
        {{ isSubmitting ? 'Pausing...' : 'Pause' }}
      </Button>
      <Button v-if="canResumeRaffle" variant="ghost" class="raffle-slot-card__action" :disabled="isSubmitting" @click="$emit('resume')">
        {{ isSubmitting ? 'Resuming...' : 'Resume' }}
      </Button>
      <Button v-if="canEditRaffle" variant="ghost" class="raffle-slot-card__action" @click="$emit('edit')">
        Edit
      </Button>
      <Button v-if="canRevealWinner" variant="default" class="raffle-slot-card__action" :disabled="isSubmitting" @click="$emit('reveal-winner')">
        {{ isSubmitting ? 'Pulling...' : 'Pull winner' }}
      </Button>
      <Button v-if="canDistributeReward" variant="default" class="raffle-slot-card__action" :disabled="isSubmitting" @click="$emit('distribute-reward')">
        {{ isSubmitting ? 'Distributing...' : 'Distribute reward' }}
      </Button>
      <Button v-if="canClaimProceeds" variant="ghost" class="raffle-slot-card__action" :disabled="isSubmitting" @click="$emit('claim-proceeds')">
        {{ isSubmitting ? 'Claiming...' : 'Claim proceeds' }}
      </Button>
      <Button v-if="canCloseRaffle" variant="ghost" class="raffle-slot-card__action raffle-slot-card__action--close" :disabled="isSubmitting" @click="$emit('close')">
        {{ isSubmitting ? 'Closing...' : 'Close raffle' }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { truncateAddress, sanitizeTokenLabel } from '@decentraguild/display'
import type { RaffleChainData } from '@decentraguild/web3'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { formatDate, fromRawUnits } from '@decentraguild/display'

interface RaffleItem {
  id: string
  rafflePubkey: string
  createdAt: string
  closedAt: string | null
}

interface SlotCard {
  key: string
  raffle: RaffleItem | null
  chainData: RaffleChainData | null
}

const props = defineProps<{
  slotCard: SlotCard
  actionSubmitting: string | null
  actionError: string | null
  actionErrorRaffle: string | null
  mintMetadataByTicketMint: Record<string, { symbol: string; name: string }>
}>()

defineEmits<{
  'add-reward': []
  start: []
  pause: []
  resume: []
  edit: []
  'reveal-winner': []
  'distribute-reward': []
  'claim-proceeds': []
  close: []
}>()

function accountUrl(pubkey: string): string {
  const cluster = process.env.NODE_ENV === 'production' ? '' : '?cluster=devnet'
  return `https://solscan.io/account/${pubkey}${cluster}`
}

const isSubmitting = computed(() => props.actionSubmitting === props.slotCard.raffle?.rafflePubkey)

const canAddReward = computed(() => props.slotCard.chainData?.state === 'created')
const canStartRaffle = computed(() => props.slotCard.chainData?.state === 'ready')
const canPauseRaffle = computed(() => props.slotCard.chainData?.state === 'running')
const canResumeRaffle = computed(() => props.slotCard.chainData?.state === 'paused')
const canEditRaffle = computed(() => props.slotCard.chainData?.state === 'paused')
const canRevealWinner = computed(() => props.slotCard.chainData?.state === 'full')
const canDistributeReward = computed(
  () => props.slotCard.chainData?.state === 'claimprize' && props.slotCard.chainData?.winner != null
)
const canClaimProceeds = computed(() => props.slotCard.chainData?.state === 'claimtickets')
const canCloseRaffle = computed(() => props.slotCard.chainData?.state === 'done')

function truncateDesc(text: string, maxLen = 60): string {
  const t = text.trim()
  if (t.length <= maxLen) return t
  return t.slice(0, maxLen).trimEnd() + '...'
}

function ticketPriceLine(chainData: RaffleChainData): string {
  const price = fromRawUnits(chainData.ticketPrice, chainData.ticketDecimals)
  const meta = chainData.ticketMint ? props.mintMetadataByTicketMint[chainData.ticketMint] : null
  const label = sanitizeTokenLabel(meta?.symbol || meta?.name || 'token') || 'token'
  return price > 0 ? `${price} ${label} per ticket` : 'No ticket price'
}

function ticketMintShort(chainData: RaffleChainData): string {
  if (!chainData.ticketMint) return ''
  return truncateAddress(chainData.ticketMint, 6, 4)
}
</script>

<style scoped>
.raffle-slot-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-height: 180px;
  padding: var(--theme-space-lg);
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg-card);
  text-align: left;
}
.raffle-slot-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
}
.raffle-slot-card__pubkey {
  font-size: var(--theme-font-sm);
  font-family: var(--theme-font-mono, monospace);
  color: var(--theme-text-primary);
  word-break: break-all;
}
.raffle-slot-card__link {
  color: var(--theme-text-muted);
  display: inline-flex;
  flex-shrink: 0;
}
.raffle-slot-card__link:hover {
  color: var(--theme-primary);
}
.raffle-slot-card__state {
  display: inline-block;
  margin-bottom: var(--theme-space-xs);
  padding: 2px 8px;
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  border-radius: var(--theme-radius-sm);
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
}
.raffle-slot-card__state--running,
.raffle-slot-card__state--full {
  background: var(--theme-success);
  color: white;
}
.raffle-slot-card__state--claimprize,
.raffle-slot-card__state--claimtickets {
  background: var(--theme-primary);
  color: white;
}
.raffle-slot-card__state--done {
  background: var(--theme-text-muted);
  color: white;
}
.raffle-slot-card__name {
  margin: var(--theme-space-xs) 0 0;
  font-size: var(--theme-font-md);
  font-weight: 600;
  color: var(--theme-text-primary);
  line-height: 1.2;
}
.raffle-slot-card__desc {
  margin: var(--theme-space-xs) 0 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  line-height: 1.3;
}
.raffle-slot-card__meta {
  margin: var(--theme-space-sm) 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}
.raffle-slot-card__ticket-info {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}
.raffle-slot-card__ticket-mint {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-tertiary, var(--theme-text-secondary));
  font-family: var(--theme-font-mono, monospace);
}
.raffle-slot-card__tickets {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
}
.raffle-slot-card__error {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-xs);
  color: var(--theme-error);
}
.raffle-slot-card__actions {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
}
.raffle-slot-card__action {
  flex: 1;
  min-width: 0;
}
.raffle-slot-card__action--close {
  color: var(--theme-error, #c53030);
}
</style>
