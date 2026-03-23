<template>
  <div class="raffle-upgrade-modal">
    <p class="raffle-upgrade-modal__hint">Choose a plan to get more raffle slots. The pricing panel will update.</p>
    <p v-if="plansError" class="raffle-upgrade-modal__error">{{ plansError }}</p>
    <div class="raffle-upgrade-modal__options">
      <button
        type="button"
        class="raffle-upgrade-option"
        :class="{ 'raffle-upgrade-option--current': effectiveTierId === 'grow', 'raffle-upgrade-option--disabled': effectiveTierId === 'grow' }"
        :disabled="effectiveTierId === 'grow'"
        @click="effectiveTierId !== 'grow' && $emit('selectTier', 'grow')"
      >
        <span class="raffle-upgrade-option__name">Grow</span>
        <span class="raffle-upgrade-option__slots">{{ growSlotsLabel }}</span>
        <span class="raffle-upgrade-option__price">{{ growPriceLabel }}</span>
        <span v-if="effectiveTierId === 'grow'" class="raffle-upgrade-option__badge">Current</span>
      </button>
      <button
        type="button"
        class="raffle-upgrade-option"
        :class="{ 'raffle-upgrade-option--current': effectiveTierId === 'pro', 'raffle-upgrade-option--disabled': effectiveTierId === 'pro' }"
        :disabled="effectiveTierId === 'pro'"
        @click="effectiveTierId !== 'pro' && $emit('selectTier', 'pro')"
      >
        <span class="raffle-upgrade-option__name">Pro</span>
        <span class="raffle-upgrade-option__slots">{{ proSlotsLabel }}</span>
        <span class="raffle-upgrade-option__price">{{ proPriceLabel }}</span>
        <span v-if="effectiveTierId === 'pro'" class="raffle-upgrade-option__badge">Current</span>
      </button>
    </div>
    <p class="raffle-upgrade-modal__note">Scroll down to select monthly/yearly and pay.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RafflePlan } from '~/composables/admin/useRaffleUpgradePlans'
import { formatUsdc } from '@decentraguild/display'

const props = defineProps<{
  effectiveTierId: string
  growPlan: RafflePlan | null
  proPlan: RafflePlan | null
  plansLoading: boolean
  plansError: string | null
}>()

defineEmits<{
  selectTier: [tier: 'grow' | 'pro']
}>()

const growSlotsLabel = computed(() =>
  props.plansLoading ? '…' : props.growPlan ? `${props.growPlan.slotLimit} slots` : '—',
)

const proSlotsLabel = computed(() =>
  props.plansLoading ? '…' : props.proPlan ? `${props.proPlan.slotLimit} slots` : '—',
)

const growPriceLabel = computed(() => {
  if (props.plansLoading) return '…'
  const u = props.growPlan?.recurringUsdc
  return u != null ? `${formatUsdc(u)} USDC/mo` : 'See pricing below'
})

const proPriceLabel = computed(() => {
  if (props.plansLoading) return '…'
  const u = props.proPlan?.recurringUsdc
  return u != null ? `${formatUsdc(u)} USDC/mo` : 'See pricing below'
})
</script>
