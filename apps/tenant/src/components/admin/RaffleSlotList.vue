<template>
  <div class="raffle-slots">
    <h3>Raffle slots</h3>
    <p class="admin__hint raffle-slots__hint">Each slot holds one raffle. Click the plus to create a new raffle in that slot.</p>
    <p v-if="actionTxStatus" class="raffle-slots__tx-status">
      <Icon icon="lucide:loader-2" class="raffle-slots__tx-spinner" />
      {{ actionTxStatus }}
    </p>
    <div v-if="slotsLoading" class="raffle-slots__loading">
      <Icon icon="lucide:loader-2" class="raffle-slots__spinner" />
      <span>Loading...</span>
    </div>
    <div v-else class="raffle-slots__grid admin__card-grid--auto-dense">
      <template v-for="(slot, idx) in slotCards" :key="slot.key">
        <RaffleSlotCard
          v-if="slot.raffle"
          :slot-card="slot"
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
          @distribute-reward="$emit('distributeReward', slot)"
          @claim-proceeds="$emit('claimProceeds', slot)"
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
import { Icon } from '@iconify/vue'
import RaffleSlotCard from './RaffleSlotCard.vue'
import type { SlotCard, RaffleItem } from '~/composables/raffles/useRaffleSlots'

defineProps<{
  slotCards: SlotCard[]
  slotsLoading: boolean
  canCreateMore: boolean
  actionTxStatus: string | null
  actionSubmitting: string | null
  actionError: string | null
  actionErrorRaffle: string | null
  mintMetadataByTicketMint: Record<string, { symbol: string; name: string }>
}>()

defineEmits<{
  addReward: [raffle: RaffleItem]
  start: [slot: SlotCard]
  pause: [slot: SlotCard]
  resume: [slot: SlotCard]
  edit: [slot: SlotCard]
  revealWinner: [slot: SlotCard]
  distributeReward: [slot: SlotCard]
  claimProceeds: [slot: SlotCard]
  close: [raffle: RaffleItem]
  create: [slotIndex: number]
  upgrade: []
}>()
</script>
