<template>
  <form class="raffle-add-reward-form" @submit.prevent="$emit('submit')">
    <div class="raffle-add-reward-form__field">
      <label class="raffle-add-reward-form__label" for="raffle-prize-mint">Prize token mint</label>
      <div class="raffle-add-reward-form__input-wrap">
        <input
          id="raffle-prize-mint"
          :value="form.prizeMint"
          type="text"
          class="raffle-add-reward-form__input"
          placeholder="SPL token mint address"
          required
          @input="form.prizeMint = ($event.target as HTMLInputElement).value"
        />
        <button
          type="button"
          class="raffle-add-reward-form__suffix"
          title="Browse address book"
          aria-label="Browse address book"
          @click="addressBookModalOpen = true"
        >
          <Icon icon="lucide:book-open" />
        </button>
      </div>
    </div>
    <FormInput
      v-model="form.amountDisplay"
      type="number"
      :label="prizeMintMeta.label"
      :placeholder="prizeMintMeta.placeholder"
      required
    />
    <p v-if="prizeMintMeta.hint" class="raffle-add-reward-form__hint">{{ prizeMintMeta.hint }}</p>
    <FormInput
      v-model="form.imageUrl"
      label="Image URL (optional)"
      placeholder="https://..."
    />
    <p v-if="error" class="raffle-add-reward-form__error">{{ error }}</p>
    <div class="raffle-add-reward-form__actions">
      <Button variant="secondary" type="button" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button variant="default" type="submit" :disabled="submitting">
        {{ submitting ? 'Adding...' : 'Add reward' }}
      </Button>
    </div>
  </form>

  <AddressBookModal
    v-if="addressBookModalOpen"
    v-model="addressBookModalOpen"
    kind="SPL"
    @select="(m) => (form.prizeMint = m)"
  />
</template>

<script setup lang="ts">
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import AddressBookModal from '~/components/shared/AddressBookModal.vue'

const addressBookModalOpen = ref(false)

const form = defineModel<{
  prizeMint: string
  amountDisplay: string
  imageUrl: string
}>('form', { required: true })

defineProps<{
  prizeMintMeta: { label: string; placeholder: string; hint?: string }
  submitting: boolean
  error: string | null
}>()

defineEmits<{ submit: []; cancel: [] }>()
</script>

<style scoped>
.raffle-add-reward-form {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  overflow-wrap: break-word;
}
.raffle-add-reward-form :deep(input) {
  max-width: 100%;
  box-sizing: border-box;
}
.raffle-add-reward-form__hint {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.raffle-add-reward-form__error {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-error);
}
.raffle-add-reward-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--theme-space-sm);
  margin-top: var(--theme-space-sm);
}

.raffle-add-reward-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
}

.raffle-add-reward-form__label {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.raffle-add-reward-form__input-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background-color: var(--theme-bg-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.raffle-add-reward-form__input-wrap:focus-within {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px var(--theme-bg-primary), 0 0 0 4px var(--theme-primary-light);
}

.raffle-add-reward-form__input {
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

.raffle-add-reward-form__input:focus {
  outline: none;
}

.raffle-add-reward-form__input::placeholder {
  color: var(--theme-text-muted);
}

.raffle-add-reward-form__suffix {
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

.raffle-add-reward-form__suffix:hover {
  color: var(--theme-primary);
  background: var(--theme-bg-muted);
}
</style>
