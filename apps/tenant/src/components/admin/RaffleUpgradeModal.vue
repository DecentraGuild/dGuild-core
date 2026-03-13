<template>
  <div class="raffle-upgrade-modal">
    <p class="raffle-upgrade-modal__hint">Choose a plan to get more raffle slots. The pricing panel will update.</p>
    <div class="raffle-upgrade-modal__options">
      <button
        type="button"
        class="raffle-upgrade-option"
        :class="{ 'raffle-upgrade-option--current': effectiveTierId === 'grow', 'raffle-upgrade-option--disabled': effectiveTierId === 'grow' }"
        :disabled="effectiveTierId === 'grow'"
        @click="effectiveTierId !== 'grow' && $emit('selectTier', 'grow')"
      >
        <span class="raffle-upgrade-option__name">Grow</span>
        <span class="raffle-upgrade-option__slots">3 slots</span>
        <span class="raffle-upgrade-option__price">15 USDC/mo</span>
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
        <span class="raffle-upgrade-option__slots">10 slots included</span>
        <span class="raffle-upgrade-option__price">25 USDC/mo</span>
        <span v-if="effectiveTierId === 'pro'" class="raffle-upgrade-option__badge">Current</span>
      </button>
    </div>
    <p class="raffle-upgrade-modal__note">Scroll down to select monthly/yearly and pay.</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  effectiveTierId: string
}>()

defineEmits<{
  selectTier: [tier: 'grow' | 'pro']
}>()
</script>
