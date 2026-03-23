<template>
  <form class="raffle-create-form" @submit.prevent="$emit('submit')">
    <FormInput
      v-model="form.name"
      label="Name"
      placeholder="Raffle name"
      required
    />
    <FormInput
      v-model="form.description"
      label="Description"
      placeholder="Brief description"
    />
    <div class="raffle-create-form__field">
      <label class="raffle-create-form__label" for="raffle-ticket-mint">Ticket token mint</label>
      <div class="raffle-create-form__input-wrap">
        <input
          id="raffle-ticket-mint"
          :value="form.ticketMint"
          type="text"
          class="raffle-create-form__input"
          placeholder="e.g. USDC, SOL or any SPL token"
          required
          @input="form.ticketMint = ($event.target as HTMLInputElement).value"
        />
        <button
          type="button"
          class="raffle-create-form__suffix"
          title="Browse address book"
          aria-label="Browse address book"
          @click="addressBookModalOpen = true"
        >
          <Icon icon="lucide:book-open" />
        </button>
      </div>
    </div>
    <div class="raffle-create-form__field">
      <label class="raffle-create-form__label" for="raffle-ticket-price">Ticket price</label>
      <div class="raffle-create-form__input-wrap">
        <input
          id="raffle-ticket-price"
          :value="ticketPriceDisplaySafe"
          type="text"
          inputmode="decimal"
          class="raffle-create-form__input raffle-create-form__input--full"
          placeholder="e.g. 0.25"
          @input="form.ticketPriceDisplay = ($event.target as HTMLInputElement).value"
        />
      </div>
    </div>
    <FormInput
      v-model="form.maxTicketsDisplay"
      type="number"
      label="Total tickets"
      placeholder="e.g. 10"
      required
    />
    <GateSelect
      v-if="showGateSelect"
      :slug="slug"
      :model-value="form.gate"
      :label="`${gateLabel} (this raffle)`"
      show-use-default
      @update:model-value="form.gate = $event"
    />
    <p v-if="error" class="raffle-create-form__error">{{ error }}</p>
    <div class="raffle-create-form__actions">
      <slot name="actions">
        <Button variant="secondary" type="button" @click="$emit('cancel')">
          Cancel
        </Button>
        <Button variant="default" type="submit" :disabled="submitting">
          {{ submitting ? 'Creating...' : 'Create raffle' }}
        </Button>
      </slot>
    </div>
  </form>

  <AddressBookModal
    v-if="addressBookModalOpen"
    v-model="addressBookModalOpen"
    kind="SPL"
    @select="(m) => (form.ticketMint = m)"
  />
</template>

<script setup lang="ts">
import { getGateLabel } from '@decentraguild/catalog'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import GateSelect from '~/components/gates/GateSelect.vue'
import AddressBookModal from '~/components/shared/AddressBookModal.vue'

const gateLabel = getGateLabel()

const addressBookModalOpen = ref(false)

const form = defineModel<{
  name: string
  description: string
  ticketMint: string
  ticketPriceDisplay: string
  maxTicketsDisplay: string
  gate: { programId: string; account: string } | null | 'use-default'
}>('form', { required: true })

defineProps<{
  slug: string
  showGateSelect: boolean
  submitting: boolean
  error: string | null
}>()

const ticketPriceDisplaySafe = computed(() => {
  const v = form.value.ticketPriceDisplay
  return typeof v === 'string' ? v : ''
})

defineEmits<{
  submit: []
  cancel: []
}>()
</script>

<style scoped>
.raffle-create-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
}

.raffle-create-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.raffle-create-form__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.raffle-create-form__input-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background-color: var(--theme-bg-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.raffle-create-form__input-wrap:focus-within {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px var(--theme-bg-primary), 0 0 0 4px var(--theme-primary-light);
}

.raffle-create-form__input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: var(--theme-input-height, 2.25rem);
  padding: var(--theme-space-sm) 2.5rem var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background: transparent;
  border: none;
  border-radius: var(--theme-radius-md);
  outline: none;
  box-sizing: border-box;
}

.raffle-create-form__input--full {
  padding-right: var(--theme-space-md);
}

.raffle-create-form__input:focus {
  outline: none;
}

.raffle-create-form__input::placeholder {
  color: var(--theme-text-muted);
}

.raffle-create-form__suffix {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  color: var(--theme-text-muted);
  background: transparent;
  border: none;
  border-radius: 0 var(--theme-radius-md) var(--theme-radius-md) 0;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.raffle-create-form__suffix:hover {
  color: var(--theme-primary);
  background: var(--theme-bg-muted);
}

.raffle-create-form__error {
  font-size: var(--theme-font-sm);
  color: var(--theme-error, #dc3545);
}

.raffle-create-form__actions {
  display: flex;
  gap: var(--theme-space-md);
  justify-content: flex-end;
  margin-top: var(--theme-space-sm);
}
</style>
