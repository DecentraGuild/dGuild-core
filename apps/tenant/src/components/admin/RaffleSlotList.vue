<template>
  <div class="raffle-slots">
    <div class="raffle-slots__head">
      <h3 class="raffle-slots__title">Raffle slots</h3>
      <Button
        v-if="hasAnyWinner"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="raffle-slots__outcomes-toggle"
        :title="revealOutcomes ? 'Hide winner addresses' : 'Show winner addresses'"
        :aria-pressed="revealOutcomes"
        @click="revealOutcomes = !revealOutcomes"
      >
        <Icon :icon="revealOutcomes ? 'lucide:eye-off' : 'lucide:eye'" />
      </Button>
    </div>
    <p class="admin__hint raffle-slots__hint">Each slot holds one raffle. Click the plus to create a new raffle in that slot.</p>
    <p v-if="actionTxStatus" class="raffle-slots__tx-status">
      <Icon icon="lucide:loader-2" class="raffle-slots__tx-spinner" />
      {{ actionTxStatus }}
    </p>
    <div v-if="slotsLoading" class="raffle-slots__loading">
      <Icon icon="lucide:loader-2" class="raffle-slots__spinner" />
      <span>Loading...</span>
    </div>
    <div v-else class="raffle-slots__grid raffle-slots__grid--wider admin__card-grid--auto-dense">
      <template v-for="(slot, idx) in slotCards" :key="slot.key">
        <RaffleSlotCard
          v-if="slot.raffle"
          :slot-card="slot"
          :reveal-outcomes="revealOutcomes"
          :action-submitting="actionSubmitting"
          :action-error="actionError"
          :action-error-raffle="actionErrorRaffle"
          :mint-metadata-by-ticket-mint="mintMetadataByTicketMint"
          @add-reward="$emit('addReward', slot.raffle!)"
          @start="$emit('start', slot)"
          @pause="$emit('pause', slot)"
          @resume="$emit('resume', slot)"
          @edit="$emit('edit', slot)"
            @reveal-winner="$emit('revealWinner', slot)"
            @play-battle-reveal="$emit('playBattleReveal', slot)"
          @distribute-reward="$emit('distributeReward', slot)"
          @claim-proceeds="$emit('claimProceeds', slot)"
          @refund-prize-before-start="$emit('refundPrizeBeforeStart', slot)"
          @close="$emit('close', slot.raffle!)"
        />
        <button
          v-else
          type="button"
          class="raffle-slot-card raffle-slot-card--empty"
          :disabled="!canCreateMore"
          @click="$emit('create', idx)"
        >
          <Icon icon="lucide:plus" class="raffle-slot-card__plus" />
          <span class="raffle-slot-card__label">Create raffle</span>
        </button>
      </template>
      <button
        type="button"
        class="raffle-slot-card raffle-slot-card--upgrade"
        @click="$emit('upgrade')"
      >
        <Icon icon="lucide:arrow-up" class="raffle-slot-card__upgrade-icon" />
        <span class="raffle-slot-card__upgrade-label">Upgrade tier</span>
        <span class="raffle-slot-card__upgrade-hint">More included slots</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import RaffleSlotCard from './RaffleSlotCard.vue'
import type { SlotCard, RaffleItem } from '~/composables/raffles/useRaffleSlots'

const props = defineProps<{
  slotCards: SlotCard[]
  slotsLoading: boolean
  canCreateMore: boolean
  actionTxStatus: string | null
  actionSubmitting: string | null
  actionError: string | null
  actionErrorRaffle: string | null
  mintMetadataByTicketMint: Record<string, { symbol: string; name: string }>
}>()

const revealOutcomes = ref(false)

const hasAnyWinner = computed(() =>
  props.slotCards.some((s) => Boolean(s.chainData?.winner?.trim())),
)

defineEmits<{
  addReward: [raffle: RaffleItem]
  start: [slot: SlotCard]
  pause: [slot: SlotCard]
  resume: [slot: SlotCard]
  edit: [slot: SlotCard]
  revealWinner: [slot: SlotCard]
  playBattleReveal: [slot: SlotCard]
  distributeReward: [slot: SlotCard]
  claimProceeds: [slot: SlotCard]
  refundPrizeBeforeStart: [slot: SlotCard]
  close: [raffle: RaffleItem]
  create: [slotIndex: number]
  upgrade: []
}>()
</script>

<style scoped>
.raffle-slots__head {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  margin-bottom: var(--theme-space-xs);
}

.raffle-slots__title {
  margin: 0;
}

.raffle-slots__outcomes-toggle {
  flex-shrink: 0;
}

/* ~+40% vs admin__card-grid--auto-dense (200px → 280px) for raffle slot cards */
.raffle-slots__grid--wider {
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
}
</style>
